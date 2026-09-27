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

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "تسجيل الدخول · تدقيق" },
      { name: "description", content: "سجّل الدخول لمراجعة فواتير هنقرستيشن وكيتا وجاهز ومطابقتها ببيانات الطلبات." },
      { property: "og:title", content: "تسجيل الدخول · تدقيق" },
      { property: "og:description", content: "سجّل الدخول لمراجعة فواتير تطبيقات التوصيل." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): { mode?: "signup" } =>
    search["mode"] === "signup" ? { mode: "signup" } : {},
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const search = Route.useSearch();
  const [mode, setMode] = useState<"signin" | "signup">(search.mode === "signup" ? "signup" : "signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/dashboard", replace: true });
    });
  }, [navigate]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: { full_name: name },
          },
        });
        if (error) throw error;
        if (data.session) navigate({ to: "/dashboard", replace: true });
        else toast.success("تم إنشاء الحساب — تحقق من بريدك لتأكيد التسجيل.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate({ to: "/dashboard", replace: true });
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "تعذّر إتمام العملية");
    } finally {
      setBusy(false);
    }
  }

  async function google() {
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error("تعذّر تسجيل الدخول عبر جوجل");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/dashboard", replace: true });
  }

  return (
    <div className="grid min-h-screen bg-background lg:grid-cols-[0.85fr_1.15fr]">
      <aside className="hidden bg-ink p-12 text-ink-foreground lg:flex lg:flex-col lg:justify-between">
        <LogoLockup title="تدقيق" className="h-16 text-ink-foreground" />
        <div><h2 className="max-w-md font-display text-4xl font-bold leading-[1.55]">دقّق فواتير منصات التوصيل قبل السداد</h2><p className="mt-5 max-w-md text-base leading-8 text-ink-muted">مساحة سعودية واحدة لمطابقة الفواتير، متابعة التعويضات، وتحليل أداء الفروع.</p></div>
        <p className="text-sm text-ink-muted">هنقرستيشن · كيتا · جاهز</p>
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
          {mode === "signin" ? "تسجيل الدخول" : "سجّل منشأتك"}
        </h2>

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
            <Label htmlFor="password">كلمة المرور</Label>
            <Input
              id="password"
              type="password"
              dir="ltr"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              minLength={6}
              required
            />
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

        <button
          type="button"
          onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
          className="mt-6 w-full text-center text-sm text-muted-foreground transition-colors hover:text-primary"
        >
          {mode === "signin" ? "ليس لديك حساب؟ أنشئ حساباً" : "لديك حساب؟ سجّل الدخول"}
        </button>
      </div>
      </main>
    </div>
  );
}
