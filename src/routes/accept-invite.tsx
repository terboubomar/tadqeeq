import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/accept-invite")({
  head: () => ({
    meta: [
      { title: "قبول دعوة Tadqeeq" },
      { name: "description", content: "إكمال إعداد حساب المستخدم في Tadqeeq." },
    ],
  }),
  component: AcceptInvitePage,
});

function AcceptInvitePage() {
  const navigate = useNavigate();
  const [sessionReady, setSessionReady] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSessionReady(Boolean(data.session));
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active && session) setSessionReady(true);
    });
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function finish(event: React.FormEvent) {
    event.preventDefault();
    if (password.length < 8) {
      toast.error("استخدم كلمة مرور من 8 أحرف على الأقل.");
      return;
    }
    if (password !== confirm) {
      toast.error("كلمتا المرور غير متطابقتين.");
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("تم تفعيل حسابك.");
      navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر تفعيل الحساب.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4" dir="rtl">
      <div className="panel w-full max-w-[420px] p-7">
        <h1 className="text-xl font-bold">مرحباً بك في Tadqeeq</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          أكمل إعداد حسابك ثم سجّل الدخول بحسابك الشخصي.
        </p>

        {!sessionReady ? (
          <div className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            جارٍ التحقق من رابط الدعوة…
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={finish}>
            <div className="space-y-2">
              <Label htmlFor="new-password">كلمة المرور</Label>
              <Input
                id="new-password"
                type="password"
                dir="ltr"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">تأكيد كلمة المرور</Label>
              <Input
                id="confirm-password"
                type="password"
                dir="ltr"
                minLength={8}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                required
              />
            </div>
            <Button className="w-full" type="submit" disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              تفعيل الحساب
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
