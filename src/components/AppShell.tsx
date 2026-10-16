import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { AlertTriangle, CalendarClock, LogOut, Menu, PanelRightClose, PanelRightOpen, Sparkles, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { AppNavBrand, AppNavList, AppNavRail, AppNavWorkspace } from "@/components/AppNav";
import { AskTadqeeqWidget } from "@/components/AskTadqeeqWidget";
import { OnboardingGate } from "@/components/OnboardingGate";
import { LockedFeatureCard, TrialBanner, UpgradeCard } from "@/components/PlanUpgrade";
import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { SuiteSwitch } from "@/components/SuiteSwitch";
import { WorkspaceSwitcher } from "@/components/WorkspaceSwitcher";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { AI_UI_ENABLED } from "@/lib/ai/config";
import { buildPeriodExceptions, summarizeExceptions } from "@/lib/exceptions";
import { arabicDate, count, sar } from "@/lib/format";
import { latestPeriod, useSelectedPeriod } from "@/lib/use-period";
import { ordersMonthLabel } from "@/lib/plans";
import { PLATFORM_BRANDS, PLATFORM_KEYS, type PlatformKey } from "@/lib/platforms";
import { cn } from "@/lib/utils";
import { PRODUCTS, type ProductKey } from "@/lib/products";
import { WORKSPACE_ROLE_LABELS, type WorkspacePermission } from "@/lib/workspace-access";
import { LogoWordmark } from "@/components/brand/Logo";
import { PlatformIcon } from "@/components/brand/PlatformLogo";
import { NotificationBell, UserMenu, type AppNotice } from "@/components/dash/TopBarMenus";

type NavItem = { to: string; label: string; hint?: string; permission: WorkspacePermission; adminOnly?: boolean };

const productNav = (key: ProductKey, permission: WorkspacePermission): NavItem => ({
  to: PRODUCTS[key].path,
  label: PRODUCTS[key].name,
  hint: PRODUCTS[key].descriptor,
  permission,
});

const NAV_GROUPS: Array<{ title: string; items: NavItem[] }> = [
  {
    title: "الرئيسية",
    items: [
      { to: "/dashboard", label: "اللوحة التنفيذية", permission: "reports.read" },
      ...(AI_UI_ENABLED
        ? [{ to: "/ai", label: "Tadqeeq AI", permission: "ai.use" as const }]
        : []),
    ],
  },
  {
    title: "العمليات",
    items: [
      productNav("nabd", "financials.read"),
    ],
  },
  {
    title: "التدقيق",
    items: [
      productNav("mutabiq", "financials.read"),
      productNav("kashif", "financials.read"),
      productNav("aaid", "financials.read"),
      productNav("radar", "exceptions.read"),
      productNav("istirdad", "compensation.read"),
    ],
  },
  {
    title: "التقارير",
    items: [
      { to: "/trends", label: "الاتجاهات والمقارنة", permission: "reports.read" },
      { to: "/branches", label: "تقرير الفروع", permission: "reports.read" },
      { to: "/journal", label: "القيود المحاسبية", permission: "reports.read" },
      { to: "/daily", label: "التقرير اليومي", permission: "reports.read" },
      { to: "/breakdown", label: "تفصيل البنود", permission: "reports.read" },
      { to: "/history", label: "الفترات السابقة", permission: "reports.read" },
      { to: "/report-schedules", label: "جدولة التقارير", permission: "reports.read" },
    ],
  },
  {
    title: "الإعداد",
    items: [
      { to: "/import", label: "رفع البيانات", permission: "imports.create" },
      { to: "/branch-mapping", label: "ربط الفروع بين المنصات", permission: "branches.read" },
      { to: "/integrations", label: "التكاملات", permission: "reports.read" },
      { to: "/team", label: "المستخدمون والصلاحيات", permission: "users.manage" },
    ],
  },
];

const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);



const ROUTE_PERMISSIONS: Record<string, WorkspacePermission> = {
  "/dashboard": "reports.read",
  "/operations": "financials.read",
  "/ai": "ai.use",
  "/ask": "ai.use",
  "/invoice-check": "financials.read",
  "/charges": "financials.read",
  "/promotions": "financials.read",
  "/exceptions": "exceptions.read",
  "/branches": "reports.read",
  "/journal": "reports.read",
  "/daily": "reports.read",
  "/breakdown": "reports.read",
  "/history": "reports.read",
  "/trends": "reports.read",
  "/report-schedules": "reports.read",
  "/import": "imports.create",
  "/branch-mapping": "branches.read",
  "/integrations": "reports.read",
  "/team": "users.manage",
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { context, can } = useWorkspaceAccess();
  // Suspended (or otherwise unusable) workspaces only; trial workspaces use the app with their limits.
  const locked = context.onboardingStatus !== "active" && !context.trial && !context.isPlatformAdmin;
  const planLocked = (permission: WorkspacePermission) => context.planLockedPermissions.includes(permission);
  const trialUploadUsed =
    context.trial && context.uploadLimit !== null && context.uploadsThisMonth >= context.uploadLimit;
  const { periods, selected, select } = useSelectedPeriod(can("periods.read") && !locked);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  // A platform picked in the top bar that has no saved period yet (otherwise the selected period decides).
  const [emptyPlatform, setEmptyPlatform] = useState<PlatformKey | null>(null);
  const activePlatform: PlatformKey = emptyPlatform ?? selected?.platform ?? "hungerstation";
  const platformPeriods = periods.filter((period) => period.platform === activePlatform);
  const showPeriod = selected && !emptyPlatform ? selected : null;

  useEffect(() => {
    setEmptyPlatform(null);
  }, [selected?.id]);

  function choosePlatform(next: PlatformKey) {
    const latest = latestPeriod(periods.filter((period) => period.platform === next));
    if (latest) {
      setEmptyPlatform(null);
      select(latest.id);
    } else {
      setEmptyPlatform(next);
    }
  }

  useEffect(() => {
    setSidebarHidden(window.localStorage.getItem("tadqeeq-sidebar-hidden") === "1");
  }, []);

  const toggleSidebar = () =>
    setSidebarHidden((prev) => {
      window.localStorage.setItem("tadqeeq-sidebar-hidden", prev ? "0" : "1");
      return !prev;
    });

  const visibleGroups = NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items
        .filter(
          (item) =>
            (can(item.permission) || planLocked(item.permission)) && (!item.adminOnly || context.isPlatformAdmin),
        )
        .map((item) => ({ ...item, locked: !can(item.permission) })),
    }))
    .filter((group) => group.items.length > 0);
  const visibleItems = visibleGroups.flatMap((group) => group.items);
  const requiredPermission = ROUTE_PERMISSIONS[pathname];
  const routeDenied = requiredPermission ? !can(requiredPermission) : false;
  const firstAllowedRoute = visibleItems.find((item) => !item.locked)?.to ?? "/auth";

  const exceptionSummary = selected
    ? summarizeExceptions(buildPeriodExceptions(selected))
    : null;

  const notices: AppNotice[] = [];
  if (exceptionSummary && exceptionSummary.openCount > 0 && can("exceptions.read") && selected) {
    notices.push({
      id: "exceptions",
      icon: AlertTriangle,
      tone: exceptionSummary.criticalCount > 0 ? "critical" : "warning",
      title: `${count(exceptionSummary.openCount)} استثناء مفتوح في ${selected.label}`,
      body: `${count(exceptionSummary.criticalCount)} حرج · قابل للاسترداد ${sar(exceptionSummary.potentialRecovery)}`,
      to: "/exceptions",
    });
  }
  if (context.trial) {
    notices.push({
      id: "trial",
      icon: Sparkles,
      tone: trialUploadUsed ? "warning" : "info",
      title: trialUploadUsed ? "استخدمت رفع التجربة المجانية" : "أنت على التجربة المجانية",
      body: "اشترك لرفع فترات ومنصات أخرى وفتح بقية الأقسام.",
      to: "/subscribe",
    });
  } else if (context.uploadLimit !== null && context.uploadsThisMonth >= context.uploadLimit) {
    notices.push({
      id: "upload-limit",
      icon: Upload,
      tone: "warning",
      title: "وصلت حد الرفع لهذا الشهر",
      body: `${count(context.uploadsThisMonth)} / ${count(context.uploadLimit)} رفعة · تواصل معنا لترقية الباقة.`,
      to: "/subscribe",
    });
  }
  const latest = periods.reduce<string | null>((max, p) => (p.period_end && (!max || p.period_end > max) ? p.period_end : max), null);
  if (can("imports.create") && !locked) {
    if (!periods.length) {
      notices.push({ id: "first-upload", icon: Upload, tone: "info", title: "ارفع أول فترة", body: "ملف الطلبات وفاتورة المنصة لبدء التدقيق.", to: "/import" });
    } else if (latest && Date.now() - new Date(latest).getTime() > 21 * 864e5) {
      notices.push({
        id: "stale",
        icon: CalendarClock,
        tone: "info",
        title: "حان وقت رفع الفترة الجديدة",
        body: `آخر فترة مرفوعة تنتهي في ${arabicDate(latest)}.`,
        to: "/import",
      });
    }
  }
  const planLine = context.trial
    ? `تجربة مجانية · الرفع ${Math.min(context.uploadsThisMonth, context.uploadLimit ?? 0)} / ${context.uploadLimit}`
    : context.planName
      ? context.orderLimit !== null
        ? `باقة ${context.planName} · ${ordersMonthLabel(context.ordersMonth)} ${count(context.monthlyOrders)} / ${count(context.orderLimit)}`
        : context.uploadLimit !== null
          ? `باقة ${context.planName} · الرفع هذا الشهر ${context.uploadsThisMonth} / ${context.uploadLimit}`
          : `باقة ${context.planName}`
      : null;

  const workspaceLine = planLine ?? WORKSPACE_ROLE_LABELS[context.role];

  async function signOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  const badgeFor = (to: string) =>
    to === "/exceptions" && (exceptionSummary?.openCount ?? 0) > 0
      ? String(exceptionSummary?.openCount ?? 0)
      : "";

  if (locked) {
    return (
      <div className="min-h-screen bg-background" dir="rtl">
        <header className="mx-auto flex max-w-3xl items-center justify-between border-b border-border px-5 py-4">
          <div className="flex items-center gap-2.5">
            <LogoWordmark title="تدقيق" className="h-8 text-ink" />
            <WorkspaceSwitcher />
          </div>
          <button
            type="button"
            onClick={signOut}
            className="flex items-center gap-2 rounded-[7px] px-2 py-2 text-xs text-muted-foreground hover:bg-muted hover:text-destructive"
          >
            <LogOut className="size-3.5" />
            تسجيل الخروج
          </button>
        </header>
        <div className="mx-auto w-full max-w-3xl px-4 pb-14 pt-6">
          <OnboardingGate>{children}</OnboardingGate>
        </div>
      </div>
    );
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
              <AppNavRail groups={visibleGroups} pathname={pathname} badgeFor={badgeFor} workspaceName={context.workspaceName} line={workspaceLine} trial={context.trial} />
            </aside>
          ) : (
            <aside className="flex h-full w-[260px] flex-col pb-4 pt-5">
              <div className="px-3">
                <AppNavBrand />
              </div>
              <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-3 pb-4 [mask-image:linear-gradient(to_bottom,black_calc(100%-2rem),transparent)] [scrollbar-color:var(--ink-2)_transparent] [scrollbar-width:thin]">
                <AppNavList groups={visibleGroups} pathname={pathname} badgeFor={badgeFor} />
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
            className="sticky top-0 z-20 flex items-center gap-2 border-b border-border bg-background/90 px-3 py-2.5 backdrop-blur-md sm:flex-wrap sm:gap-2.5 sm:px-5"
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
            <SuiteSwitch current="mizan" />
            <WorkspaceSwitcher />
            {can("periods.read") && !locked ? (
              <>
                <label className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="max-md:hidden">المنصة</span>
                  <Select value={activePlatform} onValueChange={(value) => choosePlatform(value as PlatformKey)}>
                    <SelectTrigger aria-label="المنصة" className="h-8 w-auto gap-1.5 bg-card px-2.5 text-[13px] sm:min-w-[132px]">
                      <div className="flex items-center gap-1.5 whitespace-nowrap">
                        <PlatformIcon platform={activePlatform} className="size-4 rounded" />
                        <span className="max-sm:hidden">{PLATFORM_BRANDS[activePlatform].name}</span>
                      </div>
                    </SelectTrigger>
                    <SelectContent>
                      {PLATFORM_KEYS.map((key) => {
                        const saved = periods.filter((period) => period.platform === key).length;
                        return (
                          <SelectItem key={key} value={key}>
                            <span className="inline-flex items-center gap-2">
                              <PlatformIcon platform={key} className="size-4 rounded" />
                              {PLATFORM_BRANDS[key].name}
                              <span className="num text-[11px] text-muted-foreground">
                                {saved ? `${count(saved)} فترة` : "لا توجد فترات"}
                              </span>
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                </label>

                {showPeriod ? (
                  <>
                    <label className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                      <span className="max-sm:hidden">الفترة</span>
                      <Select value={showPeriod.id} onValueChange={select}>
                        <SelectTrigger className="h-8 min-w-[120px] max-w-[260px] bg-card text-[13px] sm:min-w-[170px]">
                          <SelectValue placeholder="اختر الفترة" />
                        </SelectTrigger>
                        <SelectContent>
                          {platformPeriods.map((period) => (
                            <SelectItem key={period.id} value={period.id}>
                              {period.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>

                    <span className="num rounded-[7px] border border-input bg-card px-2.5 py-1.5 text-[12px] text-foreground/80 max-lg:hidden">
                      {arabicDate(showPeriod.period_start)} — {arabicDate(showPeriod.period_end)}
                    </span>
                  </>
                ) : can("imports.create") ? (
                  <Link
                    to="/import"
                    search={{ platform: activePlatform }}
                    className="min-w-0 truncate rounded-[7px] border border-dashed border-primary/60 bg-card px-2.5 py-1.5 text-[12.5px] font-medium text-primary-text hover:bg-secondary/60"
                  >
                    <span className="max-sm:hidden">لا توجد فترات لـ{PLATFORM_BRANDS[activePlatform].name} · </span>ارفع أول فترة
                  </Link>
                ) : (
                  <span className="min-w-0 truncate text-[12.5px] text-muted-foreground">
                    لا توجد فترات لـ{PLATFORM_BRANDS[activePlatform].name}
                  </span>
                )}
              </>
            ) : null}

            <span className="flex-1" />

            {can("imports.create") ? (
              <Button asChild size="sm">
                <Link to="/import" search={{ platform: activePlatform }} title={"رفع بيانات " + PLATFORM_BRANDS[activePlatform].name}>
                  <Upload className="size-3.5" />
                  <span className="max-sm:hidden">رفع {PLATFORM_BRANDS[activePlatform].name}</span>
                </Link>
              </Button>
            ) : null}
            <NotificationBell notices={notices} />
            <UserMenu
              name={context.fullName || context.email || "مستخدم Tadqeeq"}
              email={context.email}
              role={WORKSPACE_ROLE_LABELS[context.role]}
              workspace={context.workspaceName}
              planLine={planLine}
              canManageUsers={can("users.manage")}
              onSignOut={() => void signOut()}
            />
          </header>

          {context.trial ? <TrialBanner uploadsUsed={context.uploadsThisMonth} uploadLimit={context.uploadLimit} /> : null}

          <div className="mx-auto w-full max-w-[1360px] px-4 pb-14 pt-[22px] sm:px-5">
            {locked ? (
              <OnboardingGate>{children}</OnboardingGate>
            ) : routeDenied && requiredPermission && planLocked(requiredPermission) ? (
              <LockedFeatureCard permission={requiredPermission} trial={context.trial} />
            ) : pathname === "/import" && trialUploadUsed ? (
              <UpgradeCard
                title="استخدمت الرفع المتاح في التجربة المجانية"
                body="نتائج الفترة التي رفعتها متاحة في اللوحة والتقارير. اشترك لرفع فترات ومنصات أخرى وفتح بقية الأقسام."
              />
            ) : routeDenied ? (
              <div className="panel mx-auto mt-10 max-w-lg p-8 text-center">
                <h1 className="text-lg font-bold">ليس لديك صلاحية للوصول إلى هذه الصفحة</h1>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">
                  صلاحيات حسابك داخل {context.workspaceName} لا تسمح بفتح هذا القسم.
                </p>
                {firstAllowedRoute !== "/auth" ? (
                  <Button asChild className="mt-5">
                    <Link to={firstAllowedRoute}>فتح قسم مسموح</Link>
                  </Button>
                ) : null}
              </div>
            ) : (
              children
            )}
          </div>
        </main>
      </div>

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent
          side="right"
          dir="rtl"
          className="flex w-[300px] max-w-[85vw] flex-col gap-0 border-ink-2 bg-ink p-0 text-ink-muted sm:max-w-[300px] [&>button]:left-4 [&>button]:right-auto [&>button]:top-6 [&>button]:text-ink-foreground"
        >
          <SheetTitle className="sr-only">القائمة</SheetTitle>
          <SheetDescription className="sr-only">أقسام تدقيق</SheetDescription>
          <div className="px-3 pt-5">
            <AppNavBrand onNavigate={() => setMenuOpen(false)} />
          </div>
          <div className="mt-6 min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            <AppNavList groups={visibleGroups} pathname={pathname} badgeFor={badgeFor} onNavigate={() => setMenuOpen(false)} />
          </div>
          <div className="border-t border-ink-2 px-3 py-3">
            <AppNavWorkspace workspaceName={context.workspaceName} line={workspaceLine} trial={context.trial} onNavigate={() => setMenuOpen(false)} />
          </div>
        </SheetContent>
      </Sheet>

      {can("ai.use") && !locked ? (
        <AskTadqeeqWidget
          key={selected?.id ?? "no-period"}
          selected={selected}
          currentRoute={pathname}
          defaultOpen={pathname === "/ask"}
        />
      ) : null}
    </div>
  );
}

export function EmptyState({ title, body }: { title: string; body: string }) {
  return (
    <div className="panel mx-auto mt-10 max-w-lg p-10 text-center">
      <h2 className="text-lg font-bold">{title}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{body}</p>
      <Button asChild className="mt-6">
        <Link to="/import">
          <Upload className="size-4" />
          رفع ملفات الفترة
        </Link>
      </Button>
    </div>
  );
}
