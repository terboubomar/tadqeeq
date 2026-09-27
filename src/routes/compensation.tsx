import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { ArrowRight, FileSearch, FileSpreadsheet, FileText, LayoutDashboard, LogOut, Send } from "lucide-react";

import { useCompensationCases } from "@/components/compensation/queries";
import { Denied } from "@/components/compensation/shared";
import { useWorkspaceAccess, WorkspaceAccessProvider } from "@/components/WorkspaceAccessProvider";
import { supabase } from "@/integrations/supabase/client";
import { isOpsHost } from "@/lib/ops";
import { cn } from "@/lib/utils";
import { WORKSPACE_ROLE_LABELS, type WorkspacePermission } from "@/lib/workspace-access";
import { NOINDEX } from "@/lib/seo";

export const Route = createFileRoute("/compensation")({
  ssr: false,
  beforeLoad: async () => {
    if (isOpsHost(window.location.host)) throw redirect({ to: "/ops" });
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw redirect({ to: "/auth" });
    return { user: data.user };
  },
  head: () => ({
    meta: [
      { title: "مركز التعويضات · تدقيق" },
      NOINDEX,
      {
        name: "description",
        content: "متابعة مطالبات التعويض من منصات التوصيل: المطالَب والمسترَد والأدلة وملفات الاعتراض.",
      },
    ],
  }),
  component: () => (
    <WorkspaceAccessProvider>
      <CompensationShell />
    </WorkspaceAccessProvider>
  ),
});

const NAV: Array<{
  to: string;
  label: string;
  permission: WorkspacePermission;
  icon: typeof LayoutDashboard;
  exact?: boolean;
  badge?: "cases";
}> = [
  { to: "/compensation", label: "نظرة عامة", permission: "compensation.read", icon: LayoutDashboard, exact: true },
  { to: "/compensation/cases", label: "الحالات", permission: "compensation.read", icon: FileText, badge: "cases" },
  { to: "/compensation/evidence", label: "الأدلة وبناء الاعتراض", permission: "compensation.read", icon: FileSearch },
  { to: "/compensation/scanner", label: "فحص ملف التعويضات", permission: "compensation.read", icon: FileSpreadsheet },
  { to: "/compensation/branches", label: "ربط الفروع (Telegram)", permission: "telegram.read", icon: Send },
];

function CompensationShell() {
  const { context, can } = useWorkspaceAccess();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const path = useRouterState({ select: (s) => s.location.pathname.replace(/\/+$/, "") || "/" });
  const locked = context.onboardingStatus !== "active" && !context.isPlatformAdmin;
  const caseCount = useCompensationCases(!locked && can("compensation.read")).data?.length;

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  if (locked) {
    return (
      <div dir="rtl" className="grid min-h-screen place-items-center bg-background px-4">
        <div className="panel max-w-md p-7 text-center">
          <p className="text-sm">أكمل تهيئة حسابك أولاً لفتح مركز التعويضات.</p>
          <Link to="/dashboard" className="mt-4 inline-block text-sm font-semibold text-primary">
            العودة إلى تدقيق
          </Link>
        </div>
      </div>
    );
  }

  const items = NAV.filter((item) => can(item.permission));
  const current = NAV.find((item) => (item.exact ? path === item.to : path.startsWith(item.to)));
  const denied = current ? !can(current.permission) : false;

  return (
    <div dir="rtl" className="min-h-screen bg-background lg:flex">
      <aside className="border-b border-ink-2 bg-ink text-ink-foreground lg:sticky lg:top-0 lg:h-screen lg:w-[248px] lg:shrink-0 lg:border-b-0">
        <div className="flex h-full flex-col">
          <div className="flex items-center gap-3 px-5 py-5">
            <span className="grid size-9 place-items-center rounded-lg bg-primary font-display font-bold text-primary-foreground">
              ت
            </span>
            <div className="min-w-0">
              <p className="text-sm font-bold">تدقيق · التعويضات</p>
              <p className="truncate text-[11px] text-ink-muted">
                {context.workspaceName} · {WORKSPACE_ROLE_LABELS[context.role]}
              </p>
            </div>
          </div>
          <nav aria-label="أقسام مركز التعويضات" className="flex gap-1 overflow-x-auto px-3 pb-3 lg:flex-col lg:overflow-visible">
            {items.map((item) => {
              const active = item.exact ? path === item.to : path.startsWith(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex shrink-0 items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm transition-colors",
                    active
                      ? "bg-primary font-semibold text-primary-foreground"
                      : "text-ink-muted hover:bg-ink-2 hover:text-ink-foreground",
                  )}
                >
                  <item.icon className="size-4" />
                  {item.label}
                  {item.badge === "cases" && caseCount ? (
                    <span className="num ms-auto rounded-full bg-ink-foreground/15 px-2 py-0.5 text-[11px]">
                      {caseCount}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </nav>
          <div className="mt-auto hidden flex-col gap-1 px-3 pb-5 lg:flex">
            <Link
              to="/dashboard"
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-muted hover:bg-ink-2 hover:text-ink-foreground"
            >
              <ArrowRight className="size-4" />
              العودة إلى تدقيق
            </Link>
            <button
              type="button"
              onClick={() => void signOut()}
              className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-ink-muted hover:bg-ink-2 hover:text-ink-foreground"
            >
              <LogOut className="size-4" />
              تسجيل الخروج
            </button>
          </div>
        </div>
      </aside>
      <main className="min-w-0 flex-1 px-4 py-6 md:px-8 md:py-7">
        <Link
          to="/dashboard"
          className="mb-4 inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground lg:hidden"
        >
          <ArrowRight className="size-3.5" />
          العودة إلى تدقيق
        </Link>
        {can("compensation.read") && !denied ? <Outlet /> : <Denied />}
      </main>
    </div>
  );
}
