import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";
import { LogoWordmark } from "@/components/brand/Logo";
import { EmailCodeStep, MfaCodeStep } from "@/components/TwoFactor";
import { getEmailCodeStatus } from "@/lib/email-signin.functions";
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

  return (
    <div dir="rtl" className="min-h-screen bg-background">
      <main className="flex min-h-screen justify-center px-5 py-12 sm:px-8 sm:py-16 lg:py-20">
        <div className="w-full max-w-[440px]">
          <header className="text-center">
            <h1 className="flex justify-center">
              <span className="sr-only">تدقيق</span>
              <Link
                to="/"
                aria-label="العودة إلى الصفحة الرئيسية"
                className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4"
              >
                <LogoWordmark aria-hidden="true" className="h-11 text-ink sm:h-12" />
              </Link>
            </h1>
            <h2 className="mt-8 font-display text-2xl font-semibold leading-relaxed text-ink sm:text-[1.75rem]">
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
            </h2>
            {!mfaStep && !emailStep && !signupSentTo ? (
              <p className="mt-2 text-sm leading-7 text-muted-foreground">
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
                تم إنشاء حسابك ✅ تحقق من بريدك{" "}
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
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                {resendWait > 0
                  ? `إعادة إرسال رابط التأكيد (${resendWait})`
                  : "إعادة إرسال رابط التأكيد"}
              </Button>
              <Button
                variant="outline"
                className="h-12 w-full bg-card"
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
                <p className="rounded-md border border-border bg-card p-4 text-sm leading-7">
                  إذا كان{" "}
                  <span dir="ltr" className="font-semibold">
                    {resetSentTo}
                  </span>{" "}
                  مسجّلاً لدينا، سيصلك خلال دقائق رابط لتعيين كلمة مرور جديدة. تحقق من صندوق الرسائل
                  غير المرغوب فيها إن لم تجده.
                </p>
                <Button variant="outline" className="h-12 w-full bg-card" onClick={() => setResetSentTo(null)}>
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
                <Button type="submit" className="h-12 w-full" disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin" /> : null}
                  أرسل رابط إعادة التعيين
                </Button>
              </form>
            )
          ) : (
            <>
              <div className="mt-9 grid gap-3">
                <Button variant="outline" className="h-12 w-full bg-card" onClick={google}>
                  <GoogleLogo className="size-5 shrink-0" />
                  المتابعة باستخدام جوجل
                </Button>
              </div>

              <div className="my-7 flex items-center gap-4 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                أو تابع بالبريد الإلكتروني
                <span className="h-px flex-1 bg-border" />
              </div>

              <form onSubmit={submit} className="space-y-5">
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
                <Button type="submit" className="h-12 w-full" disabled={busy}>
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
      </main>
    </div>
  );
}

function GoogleLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"
      />
      <path
        fill="#34A853"
        d="M12 22c2.7 0 4.97-.9 6.62-2.36l-3.24-2.54c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"
      />
      <path
        fill="#FBBC05"
        d="M6.39 13.93A6.02 6.02 0 0 1 6.08 12c0-.67.11-1.32.31-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.55l3.35-2.62Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.94c1.47 0 2.79.5 3.82 1.49l2.87-2.87A9.62 9.62 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z"
      />
    </svg>
  );
}
