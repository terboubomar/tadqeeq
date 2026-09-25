import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronDown, LogOut, PanelRightClose, PanelRightOpen, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import type { ReactNode } from "react";

import { AskTadqeeqWidget } from "@/components/AskTadqeeqWidget";
import { OnboardingGate } from "@/components/OnboardingGate";
import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { Button } from "@/components/ui/button";
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
import { arabicDate } from "@/lib/format";
import { useSelectedPeriod } from "@/lib/use-period";
import { cn } from "@/lib/utils";
import { WORKSPACE_ROLE_LABELS, type WorkspacePermission } from "@/lib/workspace-access";

type NavItem = { to: string; label: string; permission: WorkspacePermission; adminOnly?: boolean };

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
    title: "التدقيق",
    items: [
      { to: "/invoice-check", label: "مطابقة الفاتورة", permission: "financials.read" },
      { to: "/charges", label: "خريطة الرسوم", permission: "financials.read" },
      { to: "/promotions", label: "تحليل العروض و ROI", permission: "financials.read" },
      { to: "/exceptions", label: "مركز الاستثناءات", permission: "exceptions.read" },
      { to: "/compensation", label: "مركز التعويضات", permission: "compensation.read" },
    ],
  },
  {
    title: "التقارير",
    items: [
      { to: "/branches", label: "تقرير الفروع", permission: "reports.read" },
      { to: "/daily", label: "التقرير اليومي", permission: "reports.read" },
      { to: "/breakdown", label: "تفصيل البنود", permission: "reports.read" },
      { to: "/history", label: "الفترات السابقة", permission: "reports.read" },
    ],
  },
  {
    title: "الإعداد",
    items: [
      { to: "/import", label: "رفع البيانات", permission: "imports.create" },
      { to: "/contracts", label: "العقود وشروط المنصات", permission: "contracts.read" },
      { to: "/settings", label: "إعدادات الفروع", permission: "branches.manage" },
      { to: "/team", label: "المستخدمون والصلاحيات", permission: "users.manage" },
    ],
  },
];

const NAV_ITEMS = NAV_GROUPS.flatMap((group) => group.items);


const ROUTE_PERMISSIONS: Record<string, WorkspacePermission> = {
  "/dashboard": "reports.read",
  "/ai": "ai.use",
  "/ask": "ai.use",
  "/invoice-check": "financials.read",
  "/charges": "financials.read",
  "/promotions": "financials.read",
  "/exceptions": "exceptions.read",
  "/compensation": "compensation.read",
  "/branches": "reports.read",
  "/daily": "reports.read",
  "/breakdown": "reports.read",
  "/history": "reports.read",
  "/import": "imports.create",
  "/contracts": "contracts.read",
  "/settings": "branches.manage",
  "/team": "users.manage",
};

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { context, can } = useWorkspaceAccess();
  const locked = context.onboardingStatus !== "active" && !context.isPlatformAdmin;
  const { periods, selected, select } = useSelectedPeriod(can("periods.read") && !locked);
  const [sidebarHidden, setSidebarHidden] = useState(false);

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
      items: group.items.filter(
        (item) => can(item.permission) && (!item.adminOnly || context.isPlatformAdmin),
      ),
    }))
    .filter((group) => group.items.length > 0);
  const visibleItems = visibleGroups.flatMap((group) => group.items);
  const requiredPermission = ROUTE_PERMISSIONS[pathname];
  const routeDenied = requiredPermission ? !can(requiredPermission) : false;
  const firstAllowedRoute = visibleItems[0]?.to ?? "/auth";

  const [openGroups, setOpenGroups] = useState<string[]>(() =>
    NAV_GROUPS
      .filter((group) => group.items.some((item) => item.to === pathname))
      .map((group) => group.title),
  );

  const toggleGroup = (title: string) =>
    setOpenGroups((prev) =>
      prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title],
    );

  const exceptionSummary = selected
    ? summarizeExceptions(buildPeriodExceptions(selected))
    : null;

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
            <span className="grid size-9 place-items-center rounded-[8px] bg-primary text-lg font-bold text-primary-foreground">ت</span>
            <span className="text-lg font-bold">تدقيق</span>
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
            "sticky top-0 hidden h-screen shrink-0 overflow-hidden transition-[width] duration-200 ease-out min-[881px]:block",
            sidebarHidden ? "w-0" : "w-[246px]",
          )}
        >
        <aside className="h-full w-[246px] overflow-y-auto border-s border-ink-2 bg-ink px-3.5 pb-4 pt-5 text-ink-muted">
          <div className="flex min-h-full flex-col">
            <Link
              to="/dashboard"
              className="flex items-center gap-2.5 border-b border-ink-2 px-1.5 pb-4"
            >
              <span className="grid size-[30px] place-items-center rounded-lg bg-primary text-[15px] font-bold text-primary-foreground">
                ت
              </span>
              <span>
                <span className="block font-display text-[15px] font-bold leading-tight text-ink-foreground">تدقيق</span>
                <span className="mt-0.5 block text-[11px] text-ink-muted">
                  مراجعة فواتير التوصيل
                </span>
              </span>
            </Link>

            <nav className="pb-5">
              {visibleGroups.map((group) => {
                const open = openGroups.includes(group.title);
                return (
                <div key={group.title} className="mt-[18px]">
                  <button
                    type="button"
                    onClick={() => toggleGroup(group.title)}
                    aria-expanded={open}
                    className="mx-1.5 mb-1.5 flex w-[calc(100%-12px)] items-center justify-between rounded-[7px] px-1 py-1 text-[10.5px] font-semibold tracking-[0.08em] text-ink-muted transition-colors hover:text-ink-foreground"
                  >
                    {group.title}
                    <ChevronDown
                      className={cn(
                        "size-3.5 transition-transform",
                        open ? "" : "-rotate-90",
                      )}
                    />
                  </button>
                  {open ? (
                    <div className="flex flex-col gap-px">
                      {group.items.map((item) => {
                        const active = pathname === item.to;
                        const badge = badgeFor(item.to);
                        return (
                          <Link
                            key={item.to}
                            to={item.to}
                            className={cn(
                              "flex w-full items-center justify-between gap-2 rounded-[7px] border px-2.5 py-[7px] text-[13px] transition-colors",
                              active
                                ? "border-ink-2 bg-ink-2 font-semibold text-ink-foreground"
                                : "border-transparent text-ink-muted hover:bg-ink-2 hover:text-ink-foreground",
                            )}
                          >
                            <span>{item.label}</span>
                            {badge ? (
                              <span className="num inline-grid min-w-[18px] place-items-center rounded-full bg-destructive px-1.5 py-0.5 text-[10.5px] font-semibold text-white">
                                {badge}
                              </span>
                            ) : null}
                          </Link>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
                );
              })}
            </nav>

            <div className="mt-auto border-t border-ink-2 px-2 pt-3">
              <div className="mb-3 rounded-lg bg-ink-2 px-2.5 py-2 text-[11px] leading-5">
                <p className="font-semibold text-ink-foreground">
                  {context.fullName || context.email || "مستخدم Tadqeeq"}
                </p>
                <p className="text-ink-muted">
                  {WORKSPACE_ROLE_LABELS[context.role]} · {context.workspaceName}
                </p>
                {context.planName ? (
                  <p className="mt-1 text-ink-muted">
                    باقة {context.planName} · الرفع هذا الشهر {context.uploadsThisMonth}
                    {context.uploadLimit !== null ? ` / ${context.uploadLimit}` : ""}
                  </p>
                ) : null}
              </div>
              <p className="text-[11px] leading-5 text-ink-muted">
                صلاحيات العرض والتعديل مرتبطة بدورك داخل حساب الشركة.
              </p>
              <button
                type="button"
                onClick={signOut}
                className="mt-3 flex w-full items-center gap-2 rounded-[7px] px-2 py-2 text-start text-xs text-ink-muted transition-colors hover:bg-ink-2 hover:text-ink-foreground"
              >
                <LogOut className="size-3.5" />
                تسجيل الخروج
              </button>
            </div>
          </div>
          </aside>
        </div>

        <main className="min-w-0 flex-1">
          <header
            data-noprint
            className="sticky top-0 z-20 flex flex-wrap items-center gap-2.5 border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur-md sm:px-5"
          >
            <button
              type="button"
              onClick={toggleSidebar}
              aria-label={sidebarHidden ? "إظهار القائمة الجانبية" : "إخفاء القائمة الجانبية"}
                className="hidden size-8 shrink-0 place-items-center rounded-[7px] border border-input bg-card text-foreground/80 transition-colors hover:bg-muted min-[881px]:grid"
            >
              {sidebarHidden ? <PanelRightOpen className="size-4" /> : <PanelRightClose className="size-4" />}
            </button>
            {selected ? (
              <>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>المنصة</span>
                  <span className="rounded-[7px] border border-input bg-card px-2.5 py-1.5 text-[13px] text-foreground">
                    {selected.platform === "hungerstation" ? "هنقرستيشن" : selected.platform === "keeta" ? "كيتا" : "جاهز"}
                  </span>
                </div>

                <label className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                  <span>الفترة</span>
                  <Select value={selected.id} onValueChange={select}>
                    <SelectTrigger className="h-8 min-w-[170px] max-w-[260px] bg-card text-[13px]">
                      <SelectValue placeholder="اختر الفترة" />
                    </SelectTrigger>
                    <SelectContent>
                      {periods.map((period) => (
                        <SelectItem key={period.id} value={period.id}>
                          {period.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>

                <span className="num rounded-[7px] border border-input bg-card px-2.5 py-1.5 text-[12px] text-foreground/80">
                  {arabicDate(selected.period_start)} — {arabicDate(selected.period_end)}
                </span>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                لا توجد بيانات بعد — ابدأ من صفحة رفع البيانات.
              </p>
            )}

            <span className="flex-1" />

            {can("imports.create") ? (
              <Button asChild size="sm">
                <Link to="/import">
                  <Upload className="size-3.5" />
                  رفع بيانات
                </Link>
              </Button>
            ) : null}
          </header>

          <div
            data-noprint
            className="flex gap-1 overflow-x-auto border-b border-border bg-ink px-3.5 py-2 min-[881px]:hidden"
          >
            {visibleItems.map((item) => {
              const active = pathname === item.to;
              const badge = badgeFor(item.to);
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 py-1.5 text-[12.5px]",
                    active
                      ? "border-primary bg-primary font-semibold text-primary-foreground"
                      : "border-ink-2 bg-ink-2 text-ink-muted",
                  )}
                >
                  {item.label}
                  {badge ? (
                    <span className="num rounded-full bg-white/90 px-1.5 text-[10px] text-destructive">
                      {badge}
                    </span>
                  ) : null}
                </Link>
              );
            })}
          </div>

          <div className="mx-auto w-full max-w-[1360px] px-4 pb-14 pt-[22px] sm:px-5">
            {locked ? (
              <OnboardingGate>{children}</OnboardingGate>
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
