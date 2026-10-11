import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, redirect, useRouterState } from "@tanstack/react-router";
import { Activity, Archive, CreditCard, FileClock, Inbox, LayoutDashboard, ListTodo, Loader2, LogOut, Menu, Package, Receipt, Users, UserCog, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Spinner } from "@/components/ui/spinner";
import { supabase } from "@/integrations/supabase/client";
import { OPS_ROLE_LABELS, opsAllowedHost, opsCan, type OpsSection } from "@/lib/ops";
import { getOpsMe, getOpsTasks } from "@/lib/ops.functions";
import { OpsMfa } from "@/components/OpsMfa";
import { OpsRoleContext } from "@/components/OpsShared";
import { LogoMark } from "@/components/brand/Logo";
import { NOINDEX } from "@/lib/seo";

export const Route = createFileRoute("/ops")({
  ssr: false,
  beforeLoad: () => {
    if (!opsAllowedHost(window.location.host)) throw redirect({ to: "/" });
  },
  head: () => ({
    meta: [
      NOINDEX,
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


type NavItem = { to: string; label: string; section: OpsSection; icon: typeof Users; badge?: "tasks" | "archived" | "messages" };

const NAV_GROUPS: { title: string | null; items: NavItem[] }[] = [
  {
    title: null,
    items: [
      { to: "/ops", label: "نظرة عامة", section: "overview", icon: LayoutDashboard },
      { to: "/ops/tasks", label: "مهام اليوم", section: "clients", icon: ListTodo, badge: "tasks" },
      { to: "/ops/messages", label: "رسائل التواصل", section: "clients", icon: Inbox, badge: "messages" },
    ],
  },
  {
    title: "العملاء",
    items: [
      { to: "/ops/clients", label: "العملاء", section: "clients", icon: Users },
      { to: "/ops/archive", label: "الأرشيف والمحذوفة", section: "clients", icon: Archive, badge: "archived" },
    ],
  },
  {
    title: "المالية",
    items: [
      { to: "/ops/subscriptions", label: "الاشتراكات", section: "subscriptions", icon: CreditCard },
      { to: "/ops/plans", label: "الباقات", section: "subscriptions", icon: Package },
      { to: "/ops/payments", label: "المدفوعات", section: "payments", icon: Receipt },
    ],
  },
  {
    title: "التشغيل",
    items: [
      { to: "/ops/usage", label: "الاستخدام", section: "usage", icon: Activity },
      { to: "/ops/logs", label: "السجلات", section: "logs", icon: FileClock },
    ],
  },
  {
    title: "الإدارة",
    items: [{ to: "/ops/staff", label: "فريق العمليات", section: "staff", icon: UserCog }],
  },
];

function OpsLayout() {
  const qc = useQueryClient();
  const path = useRouterState({ select: (s) => s.location.pathname });
  const [menuOpen, setMenuOpen] = useState(false);
  const me = useQuery({ queryKey: ["ops-me"], queryFn: () => getOpsMe({ data: {} }), retry: false });
  const role = me.data?.role ?? null;
  const tasks = useQuery({
    queryKey: ["ops-tasks"],
    queryFn: () => getOpsTasks({ data: {} }),
    enabled: opsCan(role, "clients") && me.data?.mfa !== "required",
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });

  if (me.isLoading) return <div className="grid min-h-screen place-items-center"><Spinner className="size-6" /></div>;
  if (!me.data || !role) return <OpsSignIn onDone={() => qc.invalidateQueries({ queryKey: ["ops-me"] })} />;

  async function signOut() {
    await supabase.auth.signOut();
    qc.clear();
    window.location.href = "/ops";
  }

  if (me.data.mfa === "required") {
    // The session upgraded to aal2: reload everything ops shows with the new token.
    return <OpsMfa email={me.data.email} onDone={() => void qc.invalidateQueries()} onSignOut={() => void signOut()} />;
  }

  const badges = { tasks: tasks.data?.tasks.length ?? 0, archived: tasks.data?.archivedCount ?? 0, messages: tasks.data?.newMessages ?? 0 };
  const groups = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((n) => opsCan(role, n.section)) })).filter((g) => g.items.length);
  const current = groups.flatMap((g) => g.items).find((n) => isActive(n.to, path));

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 py-5">
        <LogoMark className="h-8" />
        <div className="min-w-0">
          <p className="text-sm font-bold">تدقيق · العمليات</p>
          <p className="text-[11px] opacity-60">لوحة الفريق الداخلي</p>
        </div>
      </div>
      <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
        {groups.map((g) => (
          <div key={g.title ?? "main"}>
            {g.title ? <p className="mb-1.5 px-3 text-[11px] font-semibold tracking-wide opacity-45">{g.title}</p> : null}
            <div className="space-y-0.5">
              {g.items.map((n) => {
                const active = isActive(n.to, path);
                const count = n.badge ? badges[n.badge] : 0;
                return (
                  <Link
                    key={n.to}
                    to={n.to}
                    onClick={() => setMenuOpen(false)}
                    className={`flex items-center gap-2.5 rounded-md px-3 py-2 text-sm transition-colors ${active ? "bg-primary text-primary-foreground" : "opacity-75 hover:bg-background/10 hover:opacity-100"}`}
                  >
                    <n.icon className="size-4 shrink-0" />
                    <span className="flex-1">{n.label}</span>
                    {count ? (
                      <span
                        className={`num min-w-5 rounded-full px-1.5 py-0.5 text-center text-[11px] font-bold leading-none ${
                          n.badge === "tasks" || n.badge === "messages" ? (active ? "bg-primary-foreground text-primary" : "bg-primary text-primary-foreground") : "bg-background/15"
                        }`}
                      >
                        {count}
                      </span>
                    ) : null}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
      <div className="border-t border-background/10 p-3">
        <div className="flex items-center gap-2.5 rounded-md px-2 py-2">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-background/15 text-xs font-bold uppercase">{(me.data.email ?? "?").slice(0, 1)}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs" dir="ltr">{me.data.email}</p>
            <p className="text-[11px] opacity-60">{OPS_ROLE_LABELS[role]}</p>
          </div>
          <button onClick={() => void signOut()} title="خروج" aria-label="خروج" className="rounded-md p-2 opacity-60 hover:bg-background/10 hover:opacity-100">
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <OpsRoleContext.Provider value={role}>
      <div dir="rtl" className="min-h-screen bg-muted/30 lg:flex">
        <aside className="hidden bg-foreground text-background lg:sticky lg:top-0 lg:block lg:h-screen lg:w-64 lg:shrink-0">{sidebar}</aside>

        <header className="sticky top-0 z-30 flex items-center gap-3 bg-foreground px-4 py-3 text-background lg:hidden">
          <button onClick={() => setMenuOpen(true)} aria-label="القائمة" className="rounded-md p-1.5 hover:bg-background/10">
            <Menu className="size-5" />
          </button>
          <LogoMark className="h-6" />
          <p className="flex-1 truncate text-sm font-semibold">{current?.label ?? "العمليات"}</p>
          {badges.tasks ? (
            <Link to="/ops/tasks" className="num rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">{badges.tasks}</Link>
          ) : null}
        </header>
        {menuOpen ? (
          <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
            <button className="absolute inset-0 bg-black/50" aria-label="إغلاق" onClick={() => setMenuOpen(false)} />
            <aside className="absolute inset-y-0 start-0 w-72 max-w-[85vw] bg-foreground text-background shadow-xl">
              <button onClick={() => setMenuOpen(false)} aria-label="إغلاق" className="absolute end-3 top-5 rounded-md p-1.5 opacity-70 hover:bg-background/10">
                <X className="size-4" />
              </button>
              {sidebar}
            </aside>
          </div>
        ) : null}

        <main className="min-w-0 flex-1 p-4 md:p-7">
          <Outlet />
        </main>
      </div>
    </OpsRoleContext.Provider>
  );
}

function isActive(to: string, path: string) {
  return to === "/ops" ? path === "/ops" || path === "/ops/" : path === to || path.startsWith(`${to}/`);
}

function OpsSignIn({ onDone }: { onDone: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
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
      const message = err instanceof Error ? err.message : "تعذّر الدخول";
      setError(message);
      toast.error(message);
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
        <div className="space-y-2"><Label htmlFor="ops-email">البريد الإلكتروني</Label><Input id="ops-email" dir="ltr" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? "ops-signin-error" : undefined} /></div>
        <div className="space-y-2"><Label htmlFor="ops-password">كلمة المرور</Label><Input id="ops-password" dir="ltr" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? "ops-signin-error" : undefined} /></div>
        {error ? <p id="ops-signin-error" role="alert" className="text-sm text-destructive">{error}</p> : null}
        <Button className="w-full" disabled={busy}>{busy ? <Loader2 className="size-4 animate-spin" /> : null}دخول</Button>
        <p className="text-[11px] text-muted-foreground">إذا كنت مسجلاً في التطبيق بحساب من الفريق، اضغط دخول مباشرة.</p>
      </form>
    </div>
  );
}

