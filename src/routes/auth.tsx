import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { LogoWordmark } from "@/components/brand/Logo";
import { EmailCodeStep, MfaCodeStep } from "@/components/TwoFactor";
import { getEmailCodeStatus } from "@/lib/email-signin.functions";
import { needsMfaCode } from "@/lib/mfa";
import {
  appOriginFor,
  HANDOFF_STATE_KEY,
  handoffUrl,
  isLoginHost,
  loginUrl,
  safeState,
  usesLoginSubdomain,
  type LoginSearch,
} from "@/lib/login-host";
import { safeNextPath } from "@/lib/redirects";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول · تدقيق" },
      { name: "robots", content: "noindex, follow" },
      { name: "description", content: "سجّل الدخول لمراجعة فواتير هنقرستيشن وكيتا وجاهز ومطابقتها ببيانات الطلبات." },
      { property: "og:title", content: "تسجيل الدخول · تدقيق" },
      { property: "og:description", content: "سجّل الدخول لمراجعة فواتير تطبيقات التوصيل." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): LoginSearch => {
    const next = safeNextPath(search["next"]);
    const mode = search["mode"] === "signup" ? ("signup" as const) : search["mode"] === "reset" ? ("reset" as const) : undefined;
    const state = safeState(search["state"]);
    return { ...(mode ? { mode } : {}), ...(next ? { next } : {}), ...(state ? { state } : {}) };
  },
  // On tadqeeq.app, signing in and signing up happen on login.tadqeeq.app (see login-host).
  beforeLoad: ({ search }) => {
    if (typeof window !== "undefined" && usesLoginSubdomain(window.location.host)) throw redirect({ href: toLoginSubdomain(search) });
  },
  component: AuthPage,
});

/** The login subdomain's address for this request, with a one-time state this tab checks on the way back. */
function toLoginSubdomain(search: LoginSearch): string {
  const state = crypto.randomUUID();
  try {
    sessionStorage.setItem(HANDOFF_STATE_KEY, state);
  } catch {
    // Storage blocked: the app asks the person to confirm the account instead.
  }
  return loginUrl(window.location.host, { mode: search.mode, next: search.next, state });
}

/**
 * On login.tadqeeq.app: give the signed-in session to tadqeeq.app and forget it here, so only the app keeps
 * (and refreshes) it.
 */
async function handOffToApp(next: string | undefined, state: string | undefined) {
  const { data } = await supabase.auth.getSession();
  const session = data.session;
  if (!session) return;
  await supabase.auth.stopAutoRefresh();
  const storageKey = (supabase.auth as unknown as { storageKey?: string }).storageKey ?? "";
  try {
    for (const key of Object.keys(localStorage)) if (storageKey && key.startsWith(storageKey)) localStorage.removeItem(key);
  } catch {
    // Storage blocked: nothing kept here to clear.
  }
  window.location.replace(
    handoffUrl(appOriginFor(window.location.host, window.location.protocol), {
      accessToken: session.access_token,
      refreshToken: session.refresh_token,
      next,
      state,
    }),
  );
}

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup" | "reset">(search.mode ?? "signin");
  const [resetSentTo, setResetSentTo] = useState<string | null>(null);
  const [signupSentTo, setSignupSentTo] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const next = search.next;
  const [mfaStep, setMfaStep] = useState(false);
  const [emailStep, setEmailStep] = useState(false);
  const onLoginHost = () => isLoginHost(window.location.host);
  const go = () =>
    onLoginHost()
      ? void handOffToApp(next ?? "/start", search.state)
      : next
        ? window.location.assign(next)
        : navigate({ to: "/start", replace: true });
  // Email links always open the app itself, also when sent from the login subdomain.
  const appOrigin = () => (onLoginHost() ? appOriginFor(window.location.host, window.location.protocol) : window.location.origin);
  const returnUrl = () => appOrigin() + (next ?? "");
  // New accounts land on a clear "email confirmed" page unless they were heading somewhere specific.
  const confirmUrl = () => (next ? returnUrl() : `${appOrigin()}/email-confirmed`);
  const [resendWait, setResendWait] = useState(0);
  useEffect(() => {
    if (resendWait <= 0) return;
    const t = setTimeout(() => setResendWait((n) => n - 1), 1000);
    return () => clearTimeout(t);
  }, [resendWait]);
  async function resendConfirmation(to: string) {
    setBusy(true);
    const { error } = await supabase.auth.resend({ type: "signup", email: to, options: { emailRedirectTo: confirmUrl() } });
    setBusy(false);
    if (error) {
      toast.error(error.message.includes("seconds") ? "انتظر قليلاً قبل إعادة الإرسال." : "تعذّر إعادة إرسال الرابط");
      return;
    }
    toast.success("أعدنا إرسال رابط التأكيد إلى بريدك.");
    setResendWait(60);
  }
  // Accounts with two-step sign-in enter their authenticator code before going in.
  const finishSignIn = async () => {
    const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (needsMfaCode(data)) return setMfaStep(true);
    // Password sign-ins also confirm a code sent to the account's email.
    const email = await getEmailCodeStatus().catch(() => ({ needed: false }));
    if (email.needed) setEmailStep(true);
    else go();
  };

  useEffect(() => {
    // A server-rendered first visit to tadqeeq.app/auth moves to the login subdomain here.
    if (usesLoginSubdomain(window.location.host)) {
      window.location.replace(toLoginSubdomain(search));
      return;
    }
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) void finishSignIn();
    });
  }, [navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "reset") {
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
          redirectTo: `${appOrigin()}/reset-password`,
        });
        if (error) throw error;
        setResetSentTo(email.trim());
      } else if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: confirmUrl(),
            data: { full_name: name },
          },
        });
        if (error) throw error;
        if (data.user && (data.user.identities?.length ?? 0) === 0) {
          toast.error("هذا البريد مسجّل مسبقاً — سجّل الدخول أو استخدم «نسيت كلمة المرور».");
          setMode("signin");
          return;
        }
        if (data.session) await finishSignIn();
        else {
          setSignupSentTo(email.trim());
          setResendWait(60);
          setPassword("");
          setName("");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        await finishSignIn();
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر إتمام العملية");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div dir="rtl" className="min-h-[100dvh] bg-background">
      <main className="flex min-h-[100dvh] flex-col items-center justify-center px-4 py-8 sm:px-6 sm:py-12">
        <div className="w-full max-w-[1040px] motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-3 motion-safe:duration-500">
          <div className="mb-6 flex justify-center lg:hidden">
            <HomeLink>
              <LogoWordmark aria-hidden="true" className="h-10 text-ink" />
            </HomeLink>
          </div>
          {/* One framed card: the brand panel at the start, the form beside it (21st.dev «Sign In Split Screen»). */}
          <div className="grid overflow-hidden rounded-[20px] border border-border bg-card shadow-[0_2px_6px_rgb(19_35_43/0.04),0_24px_48px_-24px_rgb(19_35_43/0.22)] lg:min-h-[620px] lg:grid-cols-[minmax(0,0.92fr)_minmax(0,1fr)]">
          <AuthAside signup={mode === "signup"} />
          <section className="flex flex-col justify-center px-5 py-8 sm:px-10 sm:py-12 lg:px-14">
          <div className="mx-auto w-full max-w-[420px]">
          <header className="text-start">
            <h1 className="font-display text-2xl font-semibold leading-relaxed text-ink sm:text-[1.65rem]">
              {mfaStep
                ? "التحقق بخطوتين"
                : emailStep
                  ? "رمز التحقق من البريد"
                  : signupSentTo
                    ? "تحقق من بريدك"
                    : mode === "signin"
                      ? "تسجيل الدخول إلى حسابك"
                      : mode === "signup"
                        ? "إنشاء حساب جديد"
                        : "إعادة تعيين كلمة المرور"}
            </h1>
            {!mfaStep && !emailStep && !signupSentTo ? (
              <p className="mt-1.5 text-[15px] leading-7 text-muted-foreground">
                {mode === "signin"
                  ? "أدخل بريدك الإلكتروني وكلمة المرور للمتابعة."
                  : mode === "signup"
                    ? "أدخل بياناتك لإنشاء حساب منشأتك."
                    : "سنرسل إلى بريدك رابطاً لتعيين كلمة مرور جديدة."}
              </p>
            ) : null}
          </header>

          {emailStep ? (
            <EmailCodeStep
              onDone={go}
              onCancel={async () => {
                await supabase.auth.signOut();
                setEmailStep(false);
              }}
            />
          ) : mfaStep ? (
            <MfaCodeStep
              onDone={go}
              onCancel={async () => {
                await supabase.auth.signOut();
                setMfaStep(false);
              }}
            />
          ) : mode === "signup" && signupSentTo ? (
            <div className="mt-8 space-y-4" role="status">
              <p className="rounded-md border border-border bg-success-soft p-4 text-sm leading-7">
                <CheckCircle2 aria-hidden="true" className="me-1.5 inline size-4 align-[-3px] text-success" />
                تم إنشاء حسابك. تحقق من بريدك{" "}
                <span dir="ltr" className="font-semibold">
                  {signupSentTo}
                </span>{" "}
                واضغط على رابط التأكيد لتفعيل الحساب. إن لم تجده خلال دقائق، تحقق من صندوق الرسائل
                غير المرغوب فيها.
              </p>
              <Button
                className="h-12 w-full"
                disabled={busy || resendWait > 0}
                onClick={() => void resendConfirmation(signupSentTo)}
                aria-busy={busy}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {resendWait > 0
                  ? `إعادة إرسال رابط التأكيد (${resendWait})`
                  : "إعادة إرسال رابط التأكيد"}
              </Button>
              <Button
                variant="outline"
                className="h-12 w-full"
                onClick={() => {
                  setSignupSentTo(null);
                  setMode("signin");
                }}
              >
                العودة لتسجيل الدخول
              </Button>
            </div>
          ) : mode === "reset" ? (
            resetSentTo ? (
              <div className="mt-8 space-y-4">
                <p className="rounded-md border border-border bg-background p-4 text-sm leading-7">
                  إذا كان{" "}
                  <span dir="ltr" className="font-semibold">
                    {resetSentTo}
                  </span>{" "}
                  مسجّلاً لدينا، سيصلك خلال دقائق رابط لتعيين كلمة مرور جديدة. تحقق من صندوق الرسائل
                  غير المرغوب فيها إن لم تجده.
                </p>
                <Button variant="outline" className="h-12 w-full" onClick={() => setResetSentTo(null)}>
                  إرسال الرابط مرة أخرى
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-8 space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="reset-email">البريد الإلكتروني</Label>
                  <Input
                    id="reset-email"
                    type="email"
                    dir="ltr"
                    autoComplete="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                    className="h-12 bg-card"
                    required
                  />
                </div>
                <Button type="submit" className="h-12 w-full" disabled={busy} aria-busy={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                  أرسل رابط إعادة التعيين
                </Button>
              </form>
            )
          ) : (
            <>
              <form onSubmit={submit} className="mt-9 space-y-5">
                {mode === "signup" ? (
                  <div className="space-y-2">
                    <Label htmlFor="name">الاسم</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="اسمك الكامل"
                      className="h-12 bg-card"
                      required
                    />
                  </div>
                ) : null}
                <div className="space-y-2">
                  <Label htmlFor="email">البريد الإلكتروني</Label>
                  <Input
                    id="email"
                    type="email"
                    dir="ltr"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    placeholder="you@company.com"
                    className="h-12 bg-card"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <Label htmlFor="password">كلمة المرور</Label>
                    {mode === "signin" ? (
                      <button
                        type="button"
                        onClick={() => setMode("reset")}
                        className="text-[13px] text-muted-foreground underline-offset-4 hover:text-primary-text hover:underline"
                      >
                        نسيت كلمة المرور؟
                      </button>
                    ) : null}
                  </div>
                  <Input
                    id="password"
                    type="password"
                    dir="ltr"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="كلمة المرور"
                    className="h-12 bg-card"
                    minLength={mode === "signup" ? 8 : undefined}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    required
                  />
                  {mode === "signup" ? (
                    <p className="text-xs text-muted-foreground">8 أحرف على الأقل.</p>
                  ) : null}
                </div>
                <Button type="submit" className="h-12 w-full" disabled={busy} aria-busy={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                  {mode === "signin" ? "دخول" : "إنشاء الحساب"}
                </Button>
                {mode === "signup" ? (
                  <p className="text-center text-xs leading-6 text-muted-foreground">
                    بإنشاء الحساب فإنك توافق على{" "}
                    <Link
                      to="/terms"
                      target="_blank"
                      className="font-semibold text-foreground underline-offset-4 hover:underline"
                    >
                      الشروط والأحكام
                    </Link>{" "}
                    و
                    <Link
                      to="/privacy"
                      target="_blank"
                      className="font-semibold text-foreground underline-offset-4 hover:underline"
                    >
                      سياسة الخصوصية
                    </Link>
                    .
                  </p>
                ) : null}
              </form>

              <p className="mt-7 text-center text-sm text-muted-foreground">
                {mode === "signin" ? "ليس لديك حساب؟" : "لديك حساب؟"}{" "}
                <button
                  type="button"
                  onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
                  className="font-semibold text-foreground underline underline-offset-4 transition-colors hover:text-primary"
                >
                  {mode === "signin" ? "إنشاء حساب" : "تسجيل الدخول"}
                </button>
              </p>
            </>
          )}

          {mode === "reset" && !mfaStep && !emailStep ? (
            <button
              type="button"
              onClick={() => {
                setResetSentTo(null);
                setMode("signin");
              }}
              className="mt-7 w-full text-center text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-primary hover:underline"
            >
              رجوع لتسجيل الدخول
            </button>
          ) : null}
          </div>
          </section>
          </div>
        </div>
      </main>
    </div>
  );
}

/** The logo's way home; on the login subdomain the home page is the main site. */
function HomeLink({ children }: { children: React.ReactNode }) {
  return (
    <Link
      to="/"
      aria-label="تدقيق: العودة إلى الصفحة الرئيسية"
      onClick={(event) => {
        if (!isLoginHost(window.location.host)) return;
        event.preventDefault();
        window.location.assign(appOriginFor(window.location.host, window.location.protocol));
      }}
      className="inline-flex rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-transparent"
    >
      {children}
    </Link>
  );
}

/**
 * Wide screens: the brand panel at the card's start, with the logo, one line on what Tadqeeq does and the
 * platforms it reads. Hidden on phones so the form stays first; the logo then sits above the card.
 */
function AuthAside({ signup }: { signup: boolean }) {
  return (
    <aside className="relative hidden flex-col justify-between overflow-hidden bg-[linear-gradient(160deg,var(--ink)_0%,oklch(0.27_0.03_214)_100%)] p-10 text-ink-foreground lg:flex xl:p-12">
      <HomeLink>
        <LogoWordmark aria-hidden="true" className="h-9 text-ink-foreground" />
      </HomeLink>
      <div className="relative">
        <p className="font-display text-[1.75rem] font-bold leading-[1.55] text-balance">
          {signup ? "ابدأ بتدقيق فترة واحدة مجاناً." : "راجع فاتورتك القادمة قبل أن تدفعها."}
        </p>
        <p className="mt-3 max-w-sm text-[15px] leading-7 text-ink-foreground/75">
          {signup ? "ارفع ملف الطلبات وفاتورة المنصة واعرف الفرق." : "إعادة احتساب كل بند من طلباتك."}
        </p>
        {/* Text only: other companies' logos next to a password form read as impersonation to browser safety checks. */}
        <p className="mt-8 text-sm text-ink-foreground/70">لملفات هنقرستيشن وكيتا وجاهز. حسابك في تدقيق منفصل عن حساباتك في تطبيقات التوصيل.</p>
      </div>
    </aside>
  );
}
