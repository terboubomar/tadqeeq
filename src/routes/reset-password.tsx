import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { NOINDEX } from "@/lib/seo";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [NOINDEX, { title: "تعيين كلمة مرور جديدة · تدقيق" }, { name: "description", content: "تعيين كلمة مرور جديدة لحسابك في تدقيق." }],
  }),
  component: ResetPasswordPage,
});

/** How long to wait for the reset link to sign the user in before calling it invalid. */
const LINK_TIMEOUT_MS = 8000;

/** Opened from the reset email: the link signs the user in, then they choose a new password. */
function ResetPasswordPage() {
  const navigate = useNavigate();
  const [state, setState] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // An expired or already used link comes back with an error in the URL hash.
    if (/error(_code)?=/.test(window.location.hash)) {
      setState("invalid");
      return;
    }
    let active = true;
    void supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) setState("ready");
    });
    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (active && session && (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN" || event === "INITIAL_SESSION")) setState("ready");
    });
    const timer = window.setTimeout(() => {
      if (active) setState((current) => (current === "checking" ? "invalid" : current));
    }, LINK_TIMEOUT_MS);
    return () => {
      active = false;
      window.clearTimeout(timer);
      subscription.subscription.unsubscribe();
    };
  }, []);

  async function save(event: React.FormEvent) {
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
      toast.success("تم تغيير كلمة المرور.");
      navigate({ to: "/dashboard", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر تغيير كلمة المرور.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-background px-4" dir="rtl">
      <div className="panel w-full max-w-[420px] p-7">
        <h1 className="text-xl font-bold">تعيين كلمة مرور جديدة</h1>

        {state === "checking" ? (
          <p className="mt-6 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            جارٍ التحقق من الرابط…
          </p>
        ) : state === "invalid" ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm leading-7 text-muted-foreground">
              الرابط منتهي الصلاحية أو استُخدم من قبل. اطلب رابطاً جديداً، وافتحه من نفس الجهاز والمتصفح.
            </p>
            <Button asChild className="w-full">
              <Link to="/auth" search={{ mode: "reset" }}>
                طلب رابط جديد
              </Link>
            </Button>
          </div>
        ) : (
          <form className="mt-6 space-y-4" onSubmit={save}>
            <div className="space-y-2">
              <Label htmlFor="new-password">كلمة المرور الجديدة</Label>
              <Input
                id="new-password"
                type="password"
                dir="ltr"
                autoComplete="new-password"
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <p className="text-xs text-muted-foreground">8 أحرف على الأقل.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">تأكيد كلمة المرور</Label>
              <Input
                id="confirm-password"
                type="password"
                dir="ltr"
                autoComplete="new-password"
                minLength={8}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                required
              />
            </div>
            <Button className="w-full" type="submit" disabled={busy} aria-busy={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : null}
              حفظ كلمة المرور
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
