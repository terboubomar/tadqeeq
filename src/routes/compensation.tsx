import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, Outlet, redirect, useNavigate, useRouterState } from "@tanstack/react-router";
import { Menu, PanelRightClose, PanelRightOpen } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";

import { AppNavBrand, AppNavList, AppNavRail, AppNavWorkspace } from "@/components/AppNav";
import { useCompensationCases } from "@/components/compensation/queries";
import { Denied } from "@/components/compensation/shared";
import { UserMenu } from "@/components/dash/TopBarMenus";
import { LockedFeatureCard, TrialBanner } from "@/components/PlanUpgrade";
import { SuiteSwitch } from "@/components/SuiteSwitch";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { useWorkspaceAccess, WorkspaceAccessProvider } from "@/components/WorkspaceAccessProvider";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { supabase } from "@/integrations/supabase/client";
import { loadSupabase } from "@/integrations/supabase/lazy-client";
import { caseFollowUp } from "@/lib/compensation-overview";
import { getEmailCodeStatus } from "@/lib/email-signin.functions";
import { needsMfaCode } from "@/lib/mfa";
import { isOpsHost } from "@/lib/ops";
import { PRODUCTS, productPageTitle } from "@/lib/products";
import { NOINDEX } from "@/lib/seo";
import { cn } from "@/lib/utils";
import { WORKSPACE_ROLE_LABELS, type WorkspacePermission } from "@/lib/workspace-access";

export const Route = createFileRoute("/compensation")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    if (isOpsHost(window.location.host)) throw redirect({ to: "/ops" });
    const supabase = await loadSupabase();
    const { data, error } = await supabase.auth.getUser();
    const back = { next: location.href };
    if (error || !data.user) throw redirect({ to: "/auth", search: back });
    // Same sign-in steps as the app (_authenticated): the authenticator code, then the emailed code for password sign-ins.
    const { data: levels } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (needsMfaCode(levels)) throw redirect({ to: "/auth", search: back });
    const emailCode = await getEmailCodeStatus().catch(() => ({ needed: false }));
    if (emailCode.needed) throw redirect({ to: "/auth", search: back });
    return { user: data.user };
  },
  head: () => ({
    meta: [
      { title: productPageTitle("istirdad") },
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

type SectionItem = { to: string; label: string; permission: WorkspacePermission };

/** «استرداد» sections, in the same sidebar style as «ميزان». */
const SECTION_GROUPS: Array<{ title: string; items: SectionItem[] }> = [
  {
    title: "استرداد",
    items: [
      { to: "/compensation", label: "نظرة عامة", permission: "compensation.read" },
      { to: "/compensation/cases", label: "الحالات", permission: "compensation.read" },
      { to: "/compensation/evidence", label: "الأدلة وبناء الاعتراض", permission: "compensation.read" },
    ],
  },
  {
    title: "الإعداد",
    items: [{ to: "/compensation/branches", label: "ربط الفروع (Telegram)", permission: "telegram.read" }],
  },
];

const SECTION_ITEMS = SECTION_GROUPS.flatMap((group) => group.items);

/** The compensation-file scanner opens from «الحالات», so the sidebar keeps that section marked. */
const navPathFor = (pathname: string) => (pathname === "/compensation/scanner" ? "/compensation/cases" : pathname);

function CompensationShell() {
  const { context, can } = useWorkspaceAccess();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname.replace(/\/+$/, "") || "/" });
  const locked = context.onboardingStatus !== "active" && !context.trial && !context.isPlatformAdmin;
  const planLocked = !can("compensation.read") && context.planLockedPermissions.includes("compensation.read");
  const cases = useCompensationCases(!locked && can("compensation.read")).data;
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setSidebarHidden(window.localStorage.getItem("tadqeeq-sidebar-hidden") === "1");
  }, []);

  const toggleSidebar = () =>
    setSidebarHidden((prev) => {
      window.localStorage.setItem("tadqeeq-sidebar-hidden", prev ? "0" : "1");
      return !prev;
    });

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  // Cases waiting on someone (ready but not sent, or no answer from the platform), shown on «الحالات».
  const now = new Date();
  const waiting = (cases ?? []).filter((item) => caseFollowUp(item, now) !== null).length;
  const badgeFor = (to: string) => (to === "/compensation/cases" && waiting > 0 ? String(waiting) : "");

  const groups = SECTION_GROUPS.map((group) => ({
    title: group.title,
    items: group.items.filter((item) => can(item.permission)).map((item) => ({ to: item.to, label: item.label, locked: false })),
  })).filter((group) => group.items.length > 0);
  const navPath = navPathFor(pathname);
  const current = SECTION_ITEMS.find((item) => (item.to === "/compensation" ? pathname === item.to : pathname.startsWith(item.to)));
  const denied = current ? !can(current.permission) : false;
  const workspaceLine = context.planName ? `باقة ${context.planName}` : WORKSPACE_ROLE_LABELS[context.role];
  const brand = { to: "/compensation", tagline: `${PRODUCTS.istirdad.name} · ${PRODUCTS.istirdad.descriptor}` };

  let content: ReactNode;
  if (locked) {
    content = (
      <div className="panel mx-auto mt-10 max-w-md p-7 text-center">
        <p className="text-sm">أكمل تهيئة حسابك أولاً لفتح «استرداد».</p>
        <Link to="/dashboard" className="mt-4 inline-block text-sm font-semibold text-primary">
          الانتقال إلى ميزان
        </Link>
      </div>
    );
  } else if (planLocked) {
    content = <LockedFeatureCard permission="compensation.read" trial={context.trial} />;
  } else {
    content = can("compensation.read") && !denied ? <Outlet /> : <Denied />;
  }

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="flex min-h-screen">
        <div
          data-noprint
          className={cn(
            "sticky top-0 hidden h-screen shrink-0 overflow-hidden border-s border-ink-2 bg-ink transition-[width] duration-200 ease-out motion-reduce:transition-none min-[881px]:block",
            sidebarHidden ? "w-[68px]" : "w-[260px]",
          )}
        >
          {sidebarHidden ? (
            <aside className="h-full w-[68px] px-3.5 pb-4 pt-5">
              <AppNavRail groups={groups} pathname={navPath} badgeFor={badgeFor} workspaceName={context.workspaceName} line={workspaceLine} trial={context.trial} />
            </aside>
          ) : (
            <aside className="flex h-full w-[260px] flex-col pb-4 pt-5">
              <div className="px-3">
                <AppNavBrand {...brand} />
              </div>
              <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-3 pb-4">
                <AppNavList groups={groups} pathname={navPath} badgeFor={badgeFor} />
              </div>
              <div className="border-t border-ink-2 px-3 pt-3">
                <AppNavWorkspace workspaceName={context.workspaceName} line={workspaceLine} trial={context.trial} />
              </div>
            </aside>
          )}
        </div>

        <main className="min-w-0 flex-1">
          <header
            data-noprint
            className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/90 px-3 py-2.5 backdrop-blur-md sm:gap-2.5 sm:px-5"
          >
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={sidebarHidden ? "إظهار القائمة الجانبية" : "إخفاء القائمة الجانبية"}
              className="hidden size-8 shrink-0 place-items-center rounded-[7px] border border-input bg-card text-foreground/80 transition-colors hover:bg-muted min-[881px]:grid"
            >
              {sidebarHidden ? <PanelRightOpen className="size-4" /> : <PanelRightClose className="size-4" />}
            </button>
            <button
              type="button"
              onClick={() => setMenuOpen(true)}
              aria-label="القائمة"
              aria-expanded={menuOpen}
              className="grid size-8 shrink-0 place-items-center rounded-[7px] border border-input bg-card text-foreground/80 transition-colors hover:bg-muted min-[881px]:hidden"
            >
              <Menu className="size-4" />
            </button>
            <SuiteSwitch current="istirdad" />
            <WorkspaceSwitcher />
            <span className="flex-1" />
            <UserMenu
              name={context.fullName || context.email || "مستخدم Tadqeeq"}
              email={context.email}
              role={WORKSPACE_ROLE_LABELS[context.role]}
              workspace={context.workspaceName}
              planLine={context.planName ? `باقة ${context.planName}` : null}
              canManageUsers={can("users.manage")}
              onSignOut={() => void signOut()}
            />
          </header>

          {context.trial ? <TrialBanner uploadsUsed={context.uploadsThisMonth} uploadLimit={context.uploadLimit} /> : null}

          <div className="mx-auto w-full max-w-[1360px] px-4 pb-14 pt-[22px] sm:px-5">{content}</div>
        </main>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="right"
          dir="rtl"
          className="flex w-[300px] max-w-[85vw] flex-col gap-0 border-ink-2 bg-ink p-0 text-ink-muted sm:max-w-[300px] [&>button]:left-4 [&>button]:right-auto [&>button]:top-6 [&>button]:text-ink-foreground"
        >
          <SheetTitle className="sr-only">القائمة</SheetTitle>
          <SheetDescription className="sr-only">أقسام استرداد</SheetDescription>
          <div className="px-3 pt-5">
            <AppNavBrand {...brand} onNavigate={() => setMenuOpen(false)} />
          </div>
          <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            <AppNavList groups={groups} pathname={navPath} badgeFor={badgeFor} onNavigate={() => setMenuOpen(false)} />
          </div>
          <div className="border-t border-ink-2 px-3 py-3">
            <AppNavWorkspace workspaceName={context.workspaceName} line={workspaceLine} trial={context.trial} onNavigate={() => setMenuOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
