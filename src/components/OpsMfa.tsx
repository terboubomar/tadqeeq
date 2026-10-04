import { Loader2, LogOut, ShieldCheck } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

type Step =
  | { kind: "loading" }
  | { kind: "enroll"; factorId: string; qr: string; secret: string }
  | { kind: "verify"; factorId: string }
  | { kind: "error"; message: string };

/**
 * Two-step sign-in for the ops team (docs/SECURITY_BUILD_SPEC.md, M2). First visit: scan a QR code with an
 * authenticator app (Google Authenticator, Microsoft Authenticator, 1Password…) and enter its 6-digit code.
 * Later visits: just the code. A verified code upgrades the session to aal2, which every ops action requires.
 */
export function OpsMfa({ email, onDone, onSignOut }: { email: string | null; onDone: () => void; onSignOut: () => void }) {
  const [step, setStep] = useState<Step>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data, error } = await supabase.auth.mfa.listFactors();
      if (!active) return;
      if (error) return setStep({ kind: "error", message: error.message });
      const verified = data.totp.find((factor) => factor.status === "verified");
      if (verified) return setStep({ kind: "verify", factorId: verified.id });
      // A setup that was started but never finished cannot be reused (its QR code is gone): start again.
      for (const factor of data.all.filter((f) => f.factor_type === "totp" && f.status !== "verified")) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
      const enrolled = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Tadqeeq Ops ${new Date().toISOString().slice(0, 10)}` });
      if (!active) return;
      if (enrolled.error) return setStep({ kind: "error", message: enrolled.error.message });
      setStep({ kind: "enroll", factorId: enrolled.data.id, qr: enrolled.data.totp.qr_code, secret: enrolled.data.totp.secret });
    })();
    return () => {
      active = false;
    };
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (step.kind !== "enroll" && step.kind !== "verify") return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: step.factorId, code: code.trim() });
      if (error) throw new Error("الرمز غير صحيح أو انتهت صلاحيته. أدخل الرمز الظاهر الآن في التطبيق.");
      toast.success("تم التحقق.");
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر التحقق.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div dir="rtl" className="grid min-h-screen place-items-center bg-foreground px-4">
      <form onSubmit={submit} className="panel w-full max-w-sm space-y-4 p-7">
        <div className="flex items-start gap-3">
          <ShieldCheck className="mt-0.5 size-6 shrink-0 text-primary" />
          <div>
            <h1 className="text-lg font-bold">التحقق بخطوتين</h1>
            <p className="text-xs text-muted-foreground" dir="ltr">
              {email}
            </p>
          </div>
        </div>

        {step.kind === "loading" ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            جارٍ التحضير…
          </p>
        ) : step.kind === "error" ? (
          <p className="text-sm leading-7 text-destructive">
            تعذّر تجهيز التحقق بخطوتين: {step.message}. تأكد أن المصادقة بتطبيق (TOTP) مفعّلة في إعدادات Supabase.
          </p>
        ) : (
          <>
            {step.kind === "enroll" ? (
              <div className="space-y-3 text-sm leading-7">
                <p>
                  لوحة العمليات تحتاج تحققاً إضافياً. امسح الرمز بتطبيق مصادقة (Google Authenticator أو Microsoft Authenticator أو 1Password)، ثم
                  أدخل الرمز المكوّن من 6 أرقام.
                </p>
                <img src={step.qr} alt="رمز QR لإضافة تدقيق إلى تطبيق المصادقة" className="mx-auto size-44 rounded-md bg-white p-2" />
                <p className="text-xs text-muted-foreground">
                  لا تستطيع المسح؟ أدخل هذا المفتاح يدوياً:{" "}
                  <span dir="ltr" className="num break-all font-semibold text-foreground">
                    {step.secret}
                  </span>
                </p>
              </div>
            ) : (
              <p className="text-sm leading-7">أدخل الرمز المكوّن من 6 أرقام من تطبيق المصادقة.</p>
            )}
            <div className="space-y-2">
              <Label htmlFor="ops-mfa-code">الرمز</Label>
              <Input
                id="ops-mfa-code"
                dir="ltr"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="num text-center text-lg tracking-[0.4em]"
                autoFocus
                required
              />
            </div>
            <Button className="w-full" disabled={busy || code.length !== 6}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              تحقق
            </Button>
          </>
        )}

        <button type="button" onClick={onSignOut} className="flex w-full items-center justify-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
          <LogOut className="size-3.5" />
          تسجيل الخروج
        </button>
      </form>
    </div>
  );
}
