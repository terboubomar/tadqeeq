import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { useState } from "react";

import { HEAT_RAMP, WEEKDAYS, WEEKDAYS_SHORT } from "@/lib/chart-palette";
import { count, money, short } from "@/lib/format";
import { getOperationHourly } from "@/lib/operations/operations.functions";
import type { OperationPlatform } from "@/lib/operations/types";
import { cn } from "@/lib/utils";

type Measure = "sales" | "orders";

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}:00`;
/** Whole riyals in the cells: thousands as 4.1K, smaller amounts rounded. */
const cellSales = (v: number) => (v >= 1000 ? short(v) : count(Math.round(v)));
const dayCount = (n: number) => (n === 1 ? "يوم واحد" : n === 2 ? "يومان" : n <= 10 ? `${count(n)} أيام` : `${count(n)} يوماً`);

/**
 * «المبيعات حسب الساعة»: the month's orders as a grid of hour (rows) by weekday (columns), each cell the total for
 * that hour across the month's uploaded days of that weekday, shaded on one amber scale (darker is more).
 */
export function SalesByHour({ platform, month }: { platform: OperationPlatform; month: string }) {
  const [measure, setMeasure] = useState<Measure>("sales");
  const query = useQuery({
    queryKey: ["operation-hourly", platform, month],
    queryFn: () => getOperationHourly({ data: { platform, month } }),
    // A month of orders takes a while to read; one retry is enough before showing the error.
    retry: 1,
    staleTime: 5 * 60_000,
  });

  const grid = query.data;
  const value = (weekday: number, hour: number) => {
    const cell = grid?.cells[weekday]?.[hour];
    return cell ? (measure === "sales" ? cell.sales : cell.orders) : 0;
  };
  const all = grid ? grid.cells.flat().map((cell) => (measure === "sales" ? cell.sales : cell.orders)) : [];
  const max = Math.max(...all, 0);
  const hasTimes = all.some((v) => v > 0);
  const step = (v: number) => (max <= 0 || v <= 0 ? -1 : Math.min(HEAT_RAMP.length - 1, Math.floor((v / max) * HEAT_RAMP.length)));
  const exact = (v: number) => (measure === "sales" ? money(v) : `${count(v)} طلب`);

  return (
    <section className="rounded-2xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-[15px] font-bold">المبيعات حسب الساعة</h2>
          <p className="mt-0.5 text-[12px] text-muted-foreground">مجموع كل ساعة في أيام الشهر المرفوعة، لكل يوم من أيام الأسبوع. الأغمق هو الأعلى.</p>
        </div>
        <div className="flex items-center gap-3">
          {query.isFetching ? <Loader2 className="size-4 animate-spin text-ink-muted" /> : null}
          <div role="group" aria-label="المؤشر" className="flex rounded-lg bg-muted p-0.5">
            {(["sales", "orders"] as const).map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={measure === key}
                onClick={() => setMeasure(key)}
                className={cn("rounded-md px-3 py-1.5 text-xs text-muted-foreground", measure === key && "bg-card font-semibold text-foreground shadow-sm")}
              >
                {key === "sales" ? "المبيعات" : "الطلبات"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {query.isError ? (
        <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-center text-[12.5px] text-muted-foreground">
          تعذّر تحميل المبيعات حسب الساعة.
          {query.error instanceof Error && query.error.message ? <span className="mt-1 block text-[11.5px]">{query.error.message}</span> : null}{" "}
          <button type="button" className="font-semibold text-primary-text underline-offset-2 hover:underline" onClick={() => void query.refetch()}>
            إعادة المحاولة
          </button>
        </p>
      ) : query.isLoading ? (
        <div className="mt-4 h-64 animate-pulse rounded-xl bg-muted/60" />
      ) : !hasTimes ? (
        <p className="mt-4 rounded-lg border border-dashed border-border px-4 py-6 text-center text-[12.5px] text-muted-foreground">
          لا توجد طلبات بوقت مسجّل في هذا الشهر.
        </p>
      ) : (
        <>
          <div className="mt-4 max-h-[26rem] overflow-auto rounded-xl border border-border">
            <table className="w-full min-w-[34rem] border-separate border-spacing-0.5 text-center">
              <thead className="sticky top-0 z-10 bg-card">
                <tr>
                  <th scope="col" className="w-14 py-2 text-[11px] font-medium text-muted-foreground">
                    <span className="sr-only">الساعة</span>
                  </th>
                  {WEEKDAYS.map((name, weekday) => (
                    <th key={name} scope="col" className="py-2 text-[11.5px] font-medium text-muted-foreground">
                      <span className="sm:hidden">{WEEKDAYS_SHORT[weekday]}</span>
                      <span className="max-sm:hidden">{name}</span>
                      <span className="block text-[10.5px] font-normal opacity-75" title="عدد الأيام المرفوعة من هذا اليوم في الشهر">
                        {dayCount(grid?.weekdayDays[weekday] ?? 0)}
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {HOURS.map((hour) => (
                  <tr key={hour}>
                    <th scope="row" className="px-1 text-[11px] font-normal text-muted-foreground">
                      <span className="num">{hourLabel(hour)}</span>
                    </th>
                    {WEEKDAYS.map((name, weekday) => {
                      const v = value(weekday, hour);
                      const s = step(v);
                      return (
                        <td
                          key={name}
                          title={`${name} ${hourLabel(hour)} · ${exact(v)}`}
                          className={cn("h-8 rounded-[5px] px-1 text-[11px] sm:text-[12px]", s === HEAT_RAMP.length - 1 ? "font-semibold text-white" : "text-foreground", s < 0 && "text-muted-foreground/60")}
                          style={{ background: s < 0 ? "var(--color-muted)" : HEAT_RAMP[s] }}
                        >
                          <span className="num">{v > 0 ? (measure === "sales" ? cellSales(v) : count(v)) : "·"}</span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-2" aria-hidden="true">
              <span className="num">0</span>
              <span className="flex gap-0.5">
                {HEAT_RAMP.map((color) => (
                  <span key={color} className="h-2.5 w-5 rounded-sm" style={{ background: color }} />
                ))}
              </span>
              <span className="num">{measure === "sales" ? short(max) : count(max)}</span>
            </span>
            {grid && grid.untimedOrders > 0 ? (
              <span>
                <span className="num">{count(grid.untimedOrders)}</span> طلب بدون وقت في ملف المنصة (<span className="num">{money(grid.untimedSales)}</span>) غير ظاهر في الجدول.
              </span>
            ) : null}
          </div>
        </>
      )}
    </section>
  );
}
