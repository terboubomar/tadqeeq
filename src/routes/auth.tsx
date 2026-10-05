import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { lovable } from "@/integrations/lovable/index";
import { supabase } from "@/integrations/supabase/client";
import { LogoLockup, LogoWordmark } from "@/components/brand/Logo";
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
            emailRedirectTo: returnUrl(),
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
    <div className="grid min-h-screen bg-background lg:grid-cols-[0.85fr_1.15fr]">
      <aside className="hidden bg-ink p-12 text-ink-foreground lg:flex lg:flex-col lg:justify-between">
        <LogoLockup title="تدقيق" className="h-16 text-ink-foreground" />
        <div><h2 className="max-w-md font-display text-4xl font-bold leading-[1.55]">دقّق فواتير منصات التوصيل قبل السداد</h2><p className="mt-5 max-w-md text-base leading-8 text-ink-muted">مساحة سعودية واحدة لمطابقة الفواتير، متابعة التعويضات، وتحليل أداء الفروع.</p></div>
        <ul aria-label="المنصات المدعومة" className="flex flex-wrap gap-2 text-sm text-ink-foreground">{PLATFORM_KEYS.map((key) => (<li key={key} className="rounded-full bg-ink-foreground/10 py-1 ps-1 pe-3"><PlatformName platform={key} iconClassName="rounded-full" /></li>))}</ul>
      </aside>
      <main className="flex items-center justify-center px-4 py-10 sm:px-8">
      <div className="w-full max-w-[430px] rounded-[16px] border border-border bg-card p-7 shadow-panel sm:p-9">
        <div>
          <h1>
            <LogoWordmark title="تدقيق" className="h-9 text-ink" />
          </h1>
          <p className="mt-2 text-xs text-muted-foreground">مراجعة فواتير تطبيقات التوصيل</p>
        </div>

        <h2 className="mt-8 font-display text-xl font-semibold">
          {mfaStep ? "التحقق بخطوتين" : emailStep ? "رمز التحقق من البريد" : mode === "signin" ? "تسجيل الدخول" : mode === "signup" ? "سجّل منشأتك" : "إعادة تعيين كلمة المرور"}
        </h2>

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
              تم إنشاء حسابك ✅ تحقق من بريدك <span dir="ltr" className="font-semibold">{signupSentTo}</span> واضغط على رابط التأكيد لتفعيل الحساب. إن لم تجده
              خلال دقائق، تحقق من صندوق الرسائل غير المرغوب فيها.
            </p>
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
                إذا كان <span dir="ltr" className="font-semibold">{resetSentTo}</span> مسجّلاً لدينا، سيصلك خلال دقائق رابط لتعيين كلمة مرور جديدة. تحقق
                من صندوق الرسائل غير المرغوب فيها إن لم تجده.
              </p>
              <Button variant="outline" className="w-full" onClick={() => setResetSentTo(null)}>
                إرسال الرابط مرة أخرى
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-5 space-y-4">
              <p className="text-xs leading-5 text-muted-foreground">اكتب بريدك الذي تسجّل به، وسنرسل لك رابطاً لتعيين كلمة مرور جديدة.</p>
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

        {mode === "signup" ? (
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            أنشئ حسابك، وبعدها مباشرة ستملأ نموذج بيانات المنشأة وتحجز اجتماعك.
          </p>
        ) : null}
        <form onSubmit={submit} className="mt-5 space-y-4">
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
                <button type="button" onClick={() => setMode("reset")} className="text-xs text-muted-foreground underline-offset-4 hover:text-primary hover:underline">
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
            {mode === "signup" ? <p className="text-xs text-muted-foreground">8 أحرف على الأقل.</p> : null}
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            {mode === "signin" ? "دخول" : "إنشاء الحساب"}
          </Button>
        </form>

        <div className="my-5 flex items-center gap-3 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          أو
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button variant="outline" className="w-full" onClick={google}>
          المتابعة باستخدام جوجل
        </Button>
        <Button variant="outline" className="mt-3 w-full" onClick={apple}>
          المتابعة باستخدام Apple
        </Button>
          </>
        )}

        {mfaStep || emailStep ? null : (
        <button
          type="button"
          onClick={() => {
            setResetSentTo(null);
            setMode(mode === "signin" ? "signup" : "signin");
          }}
          className="mt-6 w-full text-center text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          {mode === "signin" ? "ليس لديك حساب؟ أنشئ حساباً" : mode === "signup" ? "لديك حساب؟ سجّل الدخول" : "رجوع لتسجيل الدخول"}
        </button>
        )}
      </div>
      </main>
    </div>
  );
}
