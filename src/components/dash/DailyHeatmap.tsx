import { useState } from "react";

import { count, money, short } from "@/lib/format";
import { HEAT_RAMP as RAMP, WEEKDAYS, WEEKDAYS_SHORT } from "@/lib/chart-palette";
import { cn } from "@/lib/utils";

export interface HeatmapDay {
  /** YYYY-MM-DD */
  date: string;
  sales: number;
  orders: number;
}

type Measure = "sales" | "orders";

/**
 * The period as a calendar: one cell per day, weeks as rows and weekdays as columns, shaded by the day's sales or
 * orders. It shows which weekdays carry the period, which the table alone does not.
 */
export function DailyHeatmap({ days, salesLabel }: { days: HeatmapDay[]; salesLabel: string }) {
  const [measure, setMeasure] = useState<Measure>("sales");
  const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
  if (sorted.length < 2) return null;

  const value = (day: HeatmapDay) => (measure === "sales" ? day.sales : day.orders);
  const values = sorted.map(value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const step = (v: number) => (max === min ? 2 : Math.min(RAMP.length - 1, Math.floor(((v - min) / (max - min)) * RAMP.length)));
  const format = (v: number) => (measure === "sales" ? money(v) : count(v));

  // Lay the days on a Sunday-first week grid; gaps before the first day and missing dates stay empty.
  const byDate = new Map(sorted.map((day) => [day.date, day]));
  const first = new Date(sorted[0]!.date + "T00:00:00Z");
  const last = new Date(sorted[sorted.length - 1]!.date + "T00:00:00Z");
  const cells: (HeatmapDay | { date: string; empty: true } | null)[] = Array.from({ length: first.getUTCDay() }, () => null);
  for (let d = new Date(first); d <= last; d.setUTCDate(d.getUTCDate() + 1)) {
    const key = d.toISOString().slice(0, 10);
    cells.push(byDate.get(key) ?? { date: key, empty: true });
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="المؤشر" className="flex rounded-lg bg-muted p-0.5">
          {(["sales", "orders"] as const).map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={measure === key}
              onClick={() => setMeasure(key)}
              className={cn("rounded-md px-3 py-1.5 text-xs text-muted-foreground", measure === key && "bg-card font-semibold text-foreground shadow-sm")}
            >
              {key === "sales" ? salesLabel : "الطلبات"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground" aria-hidden="true">
          <span className="num">{measure === "sales" ? short(min) : count(min)}</span>
          <span className="flex gap-0.5">
            {RAMP.map((color) => (
              <span key={color} className="h-2.5 w-5 rounded-sm" style={{ background: color }} />
            ))}
          </span>
          <span className="num">{measure === "sales" ? short(max) : count(max)}</span>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-7 gap-1 sm:gap-1.5" role="grid" aria-label={measure === "sales" ? salesLabel : "الطلبات"}>
        {WEEKDAYS.map((name, index) => (
          <span key={name} role="columnheader" className="pb-1 text-center text-[10.5px] text-muted-foreground sm:text-[11.5px]">
            <span className="sm:hidden">{WEEKDAYS_SHORT[index]}</span>
            <span className="max-sm:hidden">{name}</span>
          </span>
        ))}
        {cells.map((cell, index) =>
          cell === null ? (
            <span key={`pad-${index}`} aria-hidden="true" />
          ) : "empty" in cell ? (
            <span key={cell.date} className="grid h-12 place-items-center rounded-md border border-dashed border-border text-[11px] text-muted-foreground sm:h-14">
              <span className="num">{Number(cell.date.slice(8, 10))}</span>
            </span>
          ) : (
            <span
              key={cell.date}
              role="gridcell"
              title={`${cell.date} · ${salesLabel} ${money(cell.sales)} · ${count(cell.orders)} طلب`}
              aria-label={`${cell.date}: ${format(value(cell))}`}
              className={cn(
                "flex h-12 flex-col justify-between rounded-md px-1.5 py-1 sm:h-14 sm:px-2 sm:py-1.5",
                step(value(cell)) >= RAMP.length - 1 ? "text-white" : "text-foreground",
              )}
              style={{ background: RAMP[step(value(cell))] }}
            >
              <span className="num text-[10.5px] opacity-80 sm:text-[11px]">{Number(cell.date.slice(8, 10))}</span>
              <span className="num truncate text-[11px] font-semibold sm:text-[12.5px]">
                {measure === "sales" ? (
                  <>
                    {/* Phones have room for whole thousands only; the exact figure is in the table below and on hover. */}
                    <span className="sm:hidden">{Math.round(value(cell) / 1000)}K</span>
                    <span className="max-sm:hidden">{short(value(cell))}</span>
                  </>
                ) : (
                  count(value(cell))
                )}
              </span>
            </span>
          ),
        )}
      </div>
    </div>
  );
}
