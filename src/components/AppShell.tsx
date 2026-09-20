import { useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { LogOut, Upload } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { buildPeriodExceptions, summarizeExceptions } from "@/lib/exceptions";
import { arabicDate } from "@/lib/format";
import { useSelectedPeriod } from "@/lib/use-period";
import { cn } from "@/lib/utils";

const NAV_GROUPS = [
  {
    title: "التدقيق",
    items: [
      { to: "/invoice-check", label: "مطابقة الفاتورة" },
      { to: "/exceptions", label: "مركز الاستثناءات" },
      { to: "/dashboard", label: "اللوحة التنفيذية" },
    ],
  },
  {
    title: "التقارير",
    items: [
      { to: "/branches", label: "تقرير الفروع" },
      { to: "/daily", label: "التقرير اليومي" },
      { to: "/breakdown", label: "تفصيل البنود" },
      { to: "/history", label: "الفترات السابقة" },
    ],
  },
  {
    title: "الإعداد",
    items: [{ to: "/import", label: "رفع البيانات" }],
  },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { periods, selected, select } = useSelectedPeriod();

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

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <div className="flex min-h-screen">
        <aside
          data-noprint
          className="sticky top-0 hidden h-screen w-[246px] shrink-0 overflow-y-auto border-s border-border bg-white px-3.5 pb-4 pt-5 min-[881px]:block"
        >
          <div className="flex min-h-full flex-col">
            <Link
              to="/dashboard"
              className="flex items-center gap-2.5 border-b border-border/80 px-1.5 pb-4"
            >
              <span className="grid size-[30px] place-items-center rounded-lg bg-primary text-[15px] font-bold text-primary-foreground">
                ت
              </span>
              <span>
                <span className="block text-[15px] font-bold leading-tight">تدقيق</span>
                <span className="mt-0.5 block text-[11px] text-muted-foreground">
                  مراجعة فواتير التوصيل
                </span>
              </span>
            </Link>

            <nav className="pb-5">
              {NAV_GROUPS.map((group) => (
                <div key={group.title} className="mt-[18px]">
                  <p className="mx-1.5 mb-1.5 text-[10.5px] font-semibold tracking-[0.08em] text-muted-foreground">
                    {group.title}
                  </p>
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
                              ? "border-primary/15 bg-secondary font-semibold text-secondary-foreground"
                              : "border-transparent text-foreground/80 hover:bg-muted",
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
                </div>
              ))}
            </nav>

            <div className="mt-auto border-t border-border/80 px-2 pt-3">
              <p className="text-[11px] leading-5 text-muted-foreground">
                كل الحسابات تتم داخل المتصفح. الملفات نفسها لا تُرفع؛ تُحفظ نتائج التدقيق فقط.
              </p>
              <button
                type="button"
                onClick={signOut}
                className="mt-3 flex w-full items-center gap-2 rounded-[7px] px-2 py-2 text-start text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-destructive"
              >
                <LogOut className="size-3.5" />
                تسجيل الخروج
              </button>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <header
            data-noprint
            className="sticky top-0 z-20 flex flex-wrap items-center gap-2.5 border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur-md sm:px-5"
          >
            {selected ? (
              <>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>المنصة</span>
                  <span className="rounded-[7px] border border-input bg-white px-2.5 py-1.5 text-[13px] text-foreground">
                    {selected.platform === "hungerstation" ? "هنقرستيشن" : "كيتا"}
                  </span>
                </div>

                <label className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                  <span>الفترة</span>
                  <Select value={selected.id} onValueChange={select}>
                    <SelectTrigger className="h-8 min-w-[170px] max-w-[260px] bg-white text-[13px]">
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

                <span className="num rounded-[7px] border border-input bg-white px-2.5 py-1.5 text-[12px] text-foreground/80">
                  {arabicDate(selected.period_start)} — {arabicDate(selected.period_end)}
                </span>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                لا توجد بيانات بعد — ابدأ من صفحة رفع البيانات.
              </p>
            )}

            <span className="flex-1" />

            <Button asChild size="sm">
              <Link to="/import">
                <Upload className="size-3.5" />
                رفع بيانات
              </Link>
            </Button>
          </header>

          <div
            data-noprint
            className="flex gap-1 overflow-x-auto border-b border-border bg-white px-3.5 py-2 min-[881px]:hidden"
          >
            {NAV_GROUPS.flatMap((group) => group.items).map((item) => {
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
                      : "border-border bg-white text-foreground/80",
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

          <div className="max-w-[1360px] px-4 pb-14 pt-[22px] sm:px-5">{children}</div>
        </main>
      </div>
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
