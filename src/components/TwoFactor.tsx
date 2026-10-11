import { useServerFn } from "@tanstack/react-start";
import { Loader2, Mail, ShieldCheck, ShieldOff } from "lucide-react";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { getEmailCodeStatus, requestEmailCode, submitEmailCode } from "@/lib/email-signin.functions";

const WRONG_CODE = "الرمز غير صحيح أو انتهت صلاحيته. أدخل الرمز الظاهر الآن في التطبيق.";

function CodeInput({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="space-y-2">
      <Label htmlFor="mfa-code">رمز التحقق (6 أرقام)</Label>
      <Input
        id="mfa-code"
        dir="ltr"
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={6}
        pattern="[0-9]{6}"
        required
        autoFocus
        value={value}
        onChange={(event) => onChange(event.target.value.replace(/\D/g, ""))}
        className="text-center font-mono text-lg tracking-[0.4em]"
      />
    </div>
  );
}

/** Sign-in step for accounts with two-step sign-in: asks for the authenticator code (session → aal2). */
export function MfaCodeStep({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const [factorId, setFactorId] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void supabase.auth.mfa.listFactors().then(({ data }) => {
      setFactorId(data?.totp.find((factor) => factor.status === "verified")?.id ?? null);
    });
  }, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!factorId) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code: code.trim() });
    setBusy(false);
    if (error) {
      toast.error(WRONG_CODE);
      return;
    }
    onDone();
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4">
      <p className="flex items-start gap-2 rounded-md bg-secondary p-3 text-sm leading-7">
        <ShieldCheck className="mt-1 size-4 shrink-0 text-primary" />
        حسابك محمي بالتحقق بخطوتين. افتح تطبيق المصادقة وأدخل الرمز الظاهر لـ Tadqeeq.
      </p>
      <CodeInput value={code} onChange={setCode} />
      <Button type="submit" className="w-full" disabled={busy || !factorId || code.length !== 6} aria-busy={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        تحقق ودخول
      </Button>
      <button type="button" onClick={onCancel} className="w-full text-xs text-muted-foreground hover:text-foreground">
        فقدت الوصول إلى التطبيق؟ تسجيل الخروج والتواصل مع فريق Tadqeeq
      </button>
    </form>
  );
}

type SettingsState =
  | { kind: "loading" }
  | { kind: "off" }
  | { kind: "enroll"; factorId: string; qr: string; secret: string }
  | { kind: "on"; factorId: string; since: string };

/** Turn the optional two-step sign-in on (scan QR, confirm a code) or off, for the signed-in user. */
export function TwoFactorSettings() {
  const [state, setState] = useState<SettingsState>({ kind: "loading" });
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data, error } = await supabase.auth.mfa.listFactors();
    if (error) {
      toast.error(error.message);
      return setState({ kind: "off" });
    }
    const verified = data.totp.find((factor) => factor.status === "verified");
    setState(verified ? { kind: "on", factorId: verified.id, since: verified.created_at } : { kind: "off" });
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function start() {
    setBusy(true);
    try {
      const { data } = await supabase.auth.mfa.listFactors();
      // A setup that was started but never finished cannot be reused (its QR code is gone): start again.
      for (const factor of (data?.all ?? []).filter((f) => f.factor_type === "totp" && f.status !== "verified")) {
        await supabase.auth.mfa.unenroll({ factorId: factor.id });
      }
      const enrolled = await supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: `Tadqeeq ${new Date().toISOString().slice(0, 10)}` });
      if (enrolled.error) throw enrolled.error;
      setCode("");
      setState({ kind: "enroll", factorId: enrolled.data.id, qr: enrolled.data.totp.qr_code, secret: enrolled.data.totp.secret });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر بدء الإعداد.");
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: FormEvent) {
    event.preventDefault();
    if (state.kind !== "enroll") return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: state.factorId, code: code.trim() });
    setBusy(false);
    if (error) {
      toast.error(WRONG_CODE);
      return;
    }
    toast.success("تم تفعيل التحقق بخطوتين. سيُطلب الرمز في كل تسجيل دخول.");
    await load();
  }

  async function cancelSetup() {
    if (state.kind === "enroll") await supabase.auth.mfa.unenroll({ factorId: state.factorId });
    setState({ kind: "off" });
  }

  async function turnOff() {
    if (state.kind !== "on") return;
    if (!window.confirm("إيقاف التحقق بخطوتين؟ سيكفي البريد وكلمة المرور لتسجيل الدخول.")) return;
    setBusy(true);
    const { error } = await supabase.auth.mfa.unenroll({ factorId: state.factorId });
    if (!error) await supabase.auth.refreshSession();
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم إيقاف التحقق بخطوتين.");
    setState({ kind: "off" });
  }

  return (
    <section className="panel space-y-4 p-6">
      <div className="flex items-start gap-3">
        {state.kind === "on" ? <ShieldCheck className="mt-0.5 size-6 shrink-0 text-primary" /> : <ShieldOff className="mt-0.5 size-6 shrink-0 text-muted-foreground" />}
        <div>
          <h2 className="font-display text-lg font-semibold">التحقق بخطوتين</h2>
          <p className="mt-1 text-sm leading-7 text-muted-foreground">
            اختياري. بعد تفعيله يُطلب رمز من تطبيق المصادقة على جوالك (Google Authenticator أو Microsoft Authenticator أو غيرهما) مع كلمة المرور، فلا يكفي تسريب كلمة المرور للدخول إلى حسابك.
          </p>
        </div>
      </div>

      {state.kind === "loading" ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> جارٍ التحميل…
        </p>
      ) : null}

      {state.kind === "off" ? (
        <Button onClick={() => void start()} disabled={busy} aria-busy={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          تفعيل التحقق بخطوتين
        </Button>
      ) : null}

      {state.kind === "enroll" ? (
        <form onSubmit={confirm} className="space-y-4">
          <ol className="list-decimal space-y-1 ps-5 text-sm leading-7">
            <li>افتح تطبيق المصادقة على جوالك واختر إضافة حساب.</li>
            <li>امسح الرمز التالي، أو أدخل المفتاح يدوياً.</li>
            <li>أدخل الرمز المكوّن من 6 أرقام الظاهر في التطبيق.</li>
          </ol>
          <img src={state.qr} alt="رمز QR لإضافة Tadqeeq إلى تطبيق المصادقة" className="mx-auto size-44 rounded-md border border-border bg-white p-2" />
          <p className="break-all rounded-md bg-secondary p-2 text-center font-mono text-xs" dir="ltr">
            {state.secret}
          </p>
          <CodeInput value={code} onChange={setCode} />
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy || code.length !== 6} aria-busy={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              تأكيد وتفعيل
            </Button>
            <Button type="button" variant="outline" onClick={() => void cancelSetup()} disabled={busy}>
              إلغاء
            </Button>
          </div>
        </form>
      ) : null}

      {state.kind === "on" ? (
        <div className="space-y-3">
          <p className="rounded-md bg-secondary p-3 text-sm">
            مفعّل منذ <span dir="ltr">{state.since.slice(0, 10)}</span>. إذا فقدت جوالك تواصل مع فريق Tadqeeq لإعادة تعيينه.
          </p>
          <Button variant="outline" onClick={() => void turnOff()} disabled={busy} aria-busy={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            إيقاف التحقق بخطوتين
          </Button>
        </div>
      ) : null}
    </section>
  );
}

/** Sign-in step after a password: enter the 6-digit code emailed to the account. */
export function EmailCodeStep({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const requestCode = useServerFn(requestEmailCode);
  const checkCode = useServerFn(submitEmailCode);
  const status = useServerFn(getEmailCodeStatus);
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [wait, setWait] = useState(0);
  const started = useRef(false);

  const send = useCallback(
    async (force: boolean) => {
      try {
        const result = await requestCode({ data: { force } });
        if (result.waitSeconds) setWait(result.waitSeconds);
        if (result.sent) toast.success("أرسلنا الرمز إلى بريدك.");
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "تعذّر إرسال الرمز.");
      }
    },
    [requestCode],
  );

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void status().then((s) => setEmail(s.email));
    void send(false);
  }, [send, status]);

  useEffect(() => {
    if (wait <= 0) return;
    const timer = window.setTimeout(() => setWait((w) => w - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [wait]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      await checkCode({ data: { code } });
      onDone();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : WRONG_CODE);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 space-y-4">
      <p className="flex items-start gap-2 rounded-md bg-secondary p-3 text-sm leading-7">
        <Mail className="mt-1 size-4 shrink-0 text-primary" />
        <span>
          أرسلنا رمزاً من 6 أرقام إلى <span dir="ltr" className="font-semibold">{email || "بريدك"}</span>. تحقق من صندوق الرسائل غير المرغوب فيها إن لم تجده.
        </span>
      </p>
      <CodeInput value={code} onChange={setCode} />
      <Button type="submit" className="w-full" disabled={busy || code.length !== 6} aria-busy={busy}>
        {busy ? <Loader2 className="size-4 animate-spin" /> : null}
        تحقق ودخول
      </Button>
      <button
        type="button"
        disabled={wait > 0}
        onClick={() => void send(true)}
        className="w-full text-xs text-muted-foreground hover:text-foreground disabled:opacity-60"
      >
        {wait > 0 ? `إعادة الإرسال بعد ${wait} ثانية` : "لم يصلك الرمز؟ أعد الإرسال"}
      </button>
      <button type="button" onClick={onCancel} className="w-full text-xs text-muted-foreground hover:text-foreground">
        تسجيل الخروج
      </button>
    </form>
  );
}
