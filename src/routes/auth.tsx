import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { CheckCircle2, FileCheck2, Loader2, LockKeyhole, ShieldCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";
import { LogoLockup, LogoMark, LogoWordmark } from "@/components/brand/Logo";
import { EmailCodeStep, MfaCodeStep } from "@/components/TwoFactor";
import { getEmailCodeStatus } from "@/lib/email-signin.functions";
import { PlatformName } from "@/components/brand/PlatformLogo";
import { PLATFORM_KEYS } from "@/lib/platforms";
import { needsMfaCode } from "@/lib/mfa";
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
  validateSearch: (search: Record<string, unknown>): { mode?: "signup" | "reset"; next?: string } => {
    const next = safeNextPath(search["next"]);
    const mode = search["mode"] === "signup" ? ("signup" as const) : search["mode"] === "reset" ? ("reset" as const) : undefined;
    return { ...(mode ? { mode } : {}), ...(next ? { next } : {}) };
  },
  component: AuthPage,
});

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
  const go = () => (next ? window.location.assign(next) : navigate({ to: "/dashboard", replace: true }));
  const returnUrl = () => window.location.origin + (next ?? "");
  // New accounts land on a clear "email confirmed" page unless they were heading somewhere specific.
  const confirmUrl = () => (next ? returnUrl() : `${window.location.origin}/email-confirmed`);
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
          redirectTo: `${window.location.origin}/reset-password`,
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

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: returnUrl(),
    });
    if (result.error) {
      toast.error("تعذّر تسجيل الدخول عبر جوجل");
      return;
    }
    if (result.redirected) return;
    await finishSignIn();
  }

  async function apple() {
    const result = await lovable.auth.signInWithOAuth("apple", {
      redirect_uri: returnUrl(),
    });
    if (result.error) {
      toast.error("تعذّر تسجيل الدخول عبر Apple");
      return;
    }
    if (result.redirected) return;
    await finishSignIn();
  }

  return (
    <div
      dir="rtl"
      className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1.08fr)_minmax(440px,0.92fr)]"
    >
      <aside className="relative hidden min-h-screen overflow-hidden border-l border-white/10 bg-ink px-12 py-10 text-ink-foreground lg:flex lg:flex-col xl:px-16 xl:py-12">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-32 -left-24 opacity-[0.045]"
        >
          <LogoMark className="h-[520px] text-white" />
        </div>
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-[41%] border-t border-white/10"
        />

        <div className="relative flex items-start justify-between gap-8">
          <LogoLockup title="تدقيق" className="h-16 text-ink-foreground" />
          <div className="flex items-center gap-2 border border-white/15 px-3 py-2 text-xs text-ink-muted">
            <ShieldCheck className="size-4 text-primary" />
            دخول محمي
          </div>
        </div>

        <div className="relative my-auto max-w-xl py-14">
          <p className="mb-5 flex items-center gap-3 text-sm font-medium text-primary">
            <span className="h-px w-10 bg-primary" />
            منصة الرقابة المالية للمطاعم
          </p>
          <h2 className="font-display text-[clamp(2.35rem,4vw,4.6rem)] font-bold leading-[1.45] tracking-[-0.035em]">
            لا تعتمد الفاتورة
            <br />
            قبل أن تدقّقها.
          </h2>
          <p className="mt-7 max-w-lg text-base leading-8 text-ink-muted">
            مساحة عمل واحدة لمطابقة فواتير منصات التوصيل، توثيق الفروقات، ومتابعة حقوق منشأتك بثقة.
          </p>

          <div className="mt-10 max-w-lg border-y border-white/10 py-2">
            {[
              {
                icon: FileCheck2,
                title: "مطابقة الفواتير",
                description: "حسابات موثقة وقابلة للمراجعة",
              },
              {
                icon: CheckCircle2,
                title: "متابعة الفروقات",
                description: "من الاكتشاف حتى الاسترداد",
              },
              {
                icon: LockKeyhole,
                title: "بيانات منشأتك",
                description: "معزولة ومحكومة بصلاحيات فريقك",
              },
            ].map(({ icon: Icon, title, description }) => (
              <div
                key={title}
                className="grid grid-cols-[32px_1fr_auto] items-center gap-3 border-b border-white/10 py-4 last:border-b-0"
              >
                <Icon className="size-5 text-primary" />
                <span className="text-sm font-semibold">{title}</span>
                <span className="text-xs text-ink-muted">{description}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="relative flex items-end justify-between gap-8">
          <ul
            aria-label="المنصات المدعومة"
            className="flex flex-wrap gap-2 text-sm text-ink-foreground"
          >
            {PLATFORM_KEYS.map((key) => (
              <li key={key} className="border border-white/10 bg-white/[0.035] py-1 ps-1 pe-3">
                <PlatformName platform={key} iconClassName="rounded-sm" />
              </li>
            ))}
          </ul>
          <span className="shrink-0 text-xs text-ink-muted">صُمّم للمطاعم في السعودية</span>
        </div>
      </aside>

      <main className="relative flex min-h-screen items-center justify-center px-5 py-8 sm:px-10 lg:px-12 xl:px-20">
        <div
          aria-hidden="true"
          className="absolute inset-x-5 top-0 h-px bg-border sm:inset-x-10 lg:hidden"
        />
        <div className="w-full max-w-[440px]">
          <div className="flex items-center justify-between gap-6 border-b border-border pb-5 lg:hidden">
            <h1>
              <span className="sr-only">
                تسجيل الدخول إلى تدقيق — مراجعة فواتير تطبيقات التوصيل
              </span>
              <LogoWordmark title="تدقيق" aria-hidden="true" className="h-8 text-ink" />
            </h1>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <LockKeyhole className="size-4 text-primary" />
              دخول محمي
            </div>
          </div>

          <div className="hidden lg:block">
            <h1>
              <span className="sr-only">
                تسجيل الدخول إلى تدقيق — مراجعة فواتير تطبيقات التوصيل
              </span>
              <LogoWordmark title="تدقيق" aria-hidden="true" className="h-9 text-ink" />
            </h1>
            <p className="mt-2 text-xs text-muted-foreground">مراجعة فواتير تطبيقات التوصيل</p>
          </div>

          <div className="mt-9 sm:mt-11">
            <h2 className="font-display text-2xl font-semibold leading-relaxed text-ink">
              {mfaStep
                ? "التحقق بخطوتين"
                : emailStep
                  ? "رمز التحقق من البريد"
                  : mode === "signin"
                    ? "مرحباً بعودتك"
                    : mode === "signup"
                      ? "ابدأ مع تدقيق"
                      : "إعادة تعيين كلمة المرور"}
            </h2>
            {!mfaStep && !emailStep && mode !== "reset" ? (
              <p className="mt-1.5 text-sm leading-7 text-muted-foreground">
                {mode === "signin"
                  ? "ادخل إلى مساحة عمل منشأتك وتابع آخر التدقيقات."
                  : "أنشئ حساب منشأتك، ثم أكمل بياناتها واحجز اجتماع التعريف."}
              </p>
            ) : null}
          </div>

          {!mfaStep && !emailStep && mode !== "reset" && !signupSentTo ? (
            <div
              className="mt-7 grid grid-cols-2 border border-border bg-secondary/45 p-1"
              role="group"
              aria-label="اختيار تسجيل الدخول أو إنشاء حساب"
            >
              <button
                type="button"
                aria-pressed={mode === "signin"}
                onClick={() => setMode("signin")}
                className={`min-h-10 px-4 text-sm font-semibold transition-colors ${mode === "signin" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                تسجيل الدخول
              </button>
              <button
                type="button"
                aria-pressed={mode === "signup"}
                onClick={() => setMode("signup")}
                className={`min-h-10 px-4 text-sm font-semibold transition-colors ${mode === "signup" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                إنشاء حساب
              </button>
            </div>
          ) : null}

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
            <div className="mt-5 space-y-4" role="status">
              <p className="rounded-md bg-success-soft p-4 text-sm leading-7">
                تم إنشاء حسابك ✅ تحقق من بريدك{" "}
                <span dir="ltr" className="font-semibold">
                  {signupSentTo}
                </span>{" "}
                واضغط على رابط التأكيد لتفعيل الحساب. إن لم تجده خلال دقائق، تحقق من صندوق الرسائل
                غير المرغوب فيها.
              </p>
              <Button
                className="w-full"
                disabled={busy || resendWait > 0}
                onClick={() => void resendConfirmation(signupSentTo)}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {resendWait > 0
                  ? `إعادة إرسال رابط التأكيد (${resendWait})`
                  : "إعادة إرسال رابط التأكيد"}
              </Button>
              <Button
                variant="outline"
                className="w-full"
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
              <div className="mt-5 space-y-4">
                <p className="rounded-md bg-secondary p-4 text-sm leading-7">
                  إذا كان{" "}
                  <span dir="ltr" className="font-semibold">
                    {resetSentTo}
                  </span>{" "}
                  مسجّلاً لدينا، سيصلك خلال دقائق رابط لتعيين كلمة مرور جديدة. تحقق من صندوق الرسائل
                  غير المرغوب فيها إن لم تجده.
                </p>
                <Button variant="outline" className="w-full" onClick={() => setResetSentTo(null)}>
                  إرسال الرابط مرة أخرى
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="mt-5 space-y-4">
                <p className="text-xs leading-5 text-muted-foreground">
                  اكتب بريدك الذي تسجّل به، وسنرسل لك رابطاً لتعيين كلمة مرور جديدة.
                </p>
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
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                  أرسل رابط إعادة التعيين
                </Button>
              </form>
            )
          ) : (
            <>
              <form onSubmit={submit} className="mt-6 space-y-5">
                {mode === "signup" ? (
                  <div className="space-y-2">
                    <Label htmlFor="name">الاسم</Label>
                    <Input
                      id="name"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      placeholder="اسمك الكامل"
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
                        className="text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline"
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
                    minLength={mode === "signup" ? 8 : undefined}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    required
                  />
                  {mode === "signup" ? (
                    <p className="text-xs text-muted-foreground">8 أحرف على الأقل.</p>
                  ) : null}
                </div>
                <Button type="submit" className="w-full" disabled={busy}>
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

              <div className="my-6 flex items-center gap-3 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                أو تابع باستخدام
                <span className="h-px flex-1 bg-border" />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <Button variant="outline" className="w-full bg-card" onClick={google}>
                  جوجل
                </Button>
                <Button variant="outline" className="w-full bg-card" onClick={apple}>
                  Apple
                </Button>
              </div>
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

          <div className="mt-10 flex items-center justify-between gap-4 border-t border-border pt-5 text-[11px] text-muted-foreground lg:hidden">
            <span>مطابقة دقيقة. قرار أوضح.</span>
            <div className="flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-primary" />
              بيانات منشأتك محمية
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
