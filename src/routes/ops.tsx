import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { Activity, CreditCard, FileClock, LayoutDashboard, Loader2, LogOut, Receipt, Users, UserCog } from "lucide-react";
import { createContext, useContext, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { OPS_ROLE_LABELS, opsAllowedHost, opsCan, type OpsRole, type OpsSection } from "@/lib/ops";
import { getOpsMe } from "@/lib/ops.functions";

export const Route = createFileRoute("/ops")({
  ssr: false,
  beforeLoad: () => {
    if (!opsAllowedHost(window.location.host)) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      { title: "لوحة العمليات · تدقيق" },
      { name: "description", content: "لوحة داخلية لإدارة العملاء والاشتراكات والمدفوعات." },
      { property: "og:title", content: "لوحة العمليات · تدقيق" },
      { property: "og:description", content: "لوحة داخلية لإدارة العملاء والاشتراكات والمدفوعات." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex,nofollow" },
    ],
  }),
  component: OpsLayout,
});

const OpsRoleContext = createContext<OpsRole | null>(null);
export const useOpsRole = () => useContext(OpsRoleContext);

const NAV: { to: string; label: string; section: OpsSection; icon: typeof Users }[] = [
  { to: "/ops", label: "نظرة عامة", section: "overview", icon: LayoutDashboard },
  { to: "/ops/clients", label: "العملاء", section: "clients", icon: Users },
  { to: "/ops/subscriptions", label: "الاشتراكات", section: "subscriptions", icon: CreditCard },
  { to: "/ops/payments", label: "المدفوعات", section: "payments", icon: Receipt },
  { to: "/ops/usage", label: "الاستخدام", section: "usage", icon: Activity },
  { to: "/ops/logs", label: "السجلات", section: "logs", icon: FileClock },
  { to: "/ops/staff", label: "فريق العمليات", section: "staff", icon: UserCog },
];

function OpsLayout() {
  const qc = useQueryClient();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const me = useQuery({ queryKey: ["ops-me"], queryFn: () => getOpsMe({ data: {} }), retry: false });

  if (me.isLoading) return <div className="grid min-h-screen place-items-center"><Loader2 className="size-6 animate-spin" /></div>;
  if (!me.data) return <OpsSignIn onDone={() => qc.invalidateQueries({ queryKey: ["ops-me"] })} />;

  const role = me.data.role;
  async function signOut() {
    await supabase.auth.signOut();
    qc.clear();
    window.location.href = "/ops";
  }

  return (
    <OpsRoleContext.Provider value={role}>
      <div dir="rtl" className="min-h-screen bg-muted/30 lg:flex">
        <aside className="border-b border-border bg-foreground text-background lg:sticky lg:top-0 lg:h-screen lg:w-60 lg:shrink-0 lg:border-b-0">
          <div className="flex items-center gap-3 px-5 py-5">
            <span className="grid size-9 place-items-center rounded-md bg-primary font-bold text-primary-foreground">ت</span>
            <div>
              <p className="text-sm font-bold">تدقيق · العمليات</p>
              <p className="text-[11px] opacity-60">{me.data.email} · {OPS_ROLE_LABELS[role]}</p>
            </div>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
            {NAV.filter((n) => opsCan(role, n.section)).map((n) => {
              const active = n.to === "/ops" ? path === "/ops" || path === "/ops/" : path.startsWith(n.to);
              return (
                <Link key={n.to} to={n.to} className={`flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${active ? "bg-primary text-primary-foreground" : "opacity-75 hover:bg-background/10 hover:opacity-100"}`}>
                  <n.icon className="size-4" />
                  {n.label}
                </Link>
              );
            })}
            <button onClick={() => void signOut()} className="flex shrink-0 items-center gap-2.5 rounded-md px-3 py-2 text-sm opacity-60 hover:opacity-100 lg:mt-4">
              <LogOut className="size-4" /> خروج
            </button>
          </nav>
        </aside>
        <main className="min-w-0 flex-1 p-4 md:p-7">
          <Outlet />
        </main>
      </div>
    </OpsRoleContext.Provider>
  );
}

function OpsSignIn({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error("البريد أو كلمة المرور غير صحيحة");
      }
      const me = await getOpsMe({ data: {} });
      if (!me) {
        await supabase.auth.signOut();
        throw new Error("هذا الحساب ليس ضمن فريق العمليات.");
      }
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذّر الدخول");
    } finally {
      setBusy(false);
    }
  }
  return (
    <div dir="rtl" className="grid min-h-screen place-items-center bg-foreground px-4">
      <form onSubmit={submit} className="panel w-full max-w-sm space-y-4 p-7">
        <div>
          <h1 className="text-lg font-bold">لوحة العمليات</h1>
          <p className="text-xs text-muted-foreground">للفريق الداخلي فقط</p>
        </div>
        <div className="space-y-2"><Label>البريد الإلكتروني</Label><Input dir="ltr" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="space-y-2"><Label>كلمة المرور</Label><Input dir="ltr" type="password" value={password} onChange={(e) => setPassword(e.target.value)} /></div>
        <Button className="w-full" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : null}دخول</Button>
        <p className="text-[11px] text-muted-foreground">إذا كنت مسجلاً في التطبيق بحساب من الفريق، اضغط دخول مباشرة.</p>
      </form>
    </div>
  );
}

export function OpsDenied() {
  return <p className="panel mx-auto mt-10 max-w-md p-8 text-center text-sm">دورك لا يسمح بفتح هذا القسم.</p>;
}

export function OpsHeader({ title, sub, children }: { title: string; sub?: string; children?: React.ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {sub ? <p className="mt-1 text-sm text-muted-foreground">{sub}</p> : null}
      </div>
      {children}
    </div>
  );
}
