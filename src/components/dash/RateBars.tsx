import { percent } from "@/lib/format";
import { cn } from "@/lib/utils";

export interface RateBarItem {
  key: string;
  label: string;
  /** A share between 0 and 1. */
  rate: number;
  /** Shown under the label, e.g. the amount the rate is taken from. */
  sub?: string;
}

/**
 * One horizontal bar per item, longest rate first, with a marker at `average`. Items above the average are drawn in
 * the accent and the rest in grey, so the ones that cost more than usual stand out. Bars start at zero.
 */
export function RateBars({ items, average, averageLabel, limit = 15 }: { items: RateBarItem[]; average: number | null; averageLabel: string; limit?: number }) {
  const sorted = [...items].sort((a, b) => b.rate - a.rate);
  const shown = sorted.slice(0, limit);
  const scale = Math.max(...shown.map((item) => item.rate), average ?? 0, 0.0001);
  if (!shown.length) return <p className="py-4 text-center text-sm text-muted-foreground">لا توجد بيانات.</p>;
  return (
    <div>
      {average !== null ? (
        <p className="mb-3 flex items-center gap-2 text-[11.5px] text-muted-foreground">
          <span aria-hidden="true" className="h-3 w-0.5 rounded-full bg-foreground/70" />
          {averageLabel} <span className="num font-semibold text-foreground">{percent(average, 1)}</span>
        </p>
      ) : null}
      <ul className="space-y-2.5">
        {shown.map((item) => {
          const above = average !== null && item.rate > average + 0.0005;
          return (
            <li key={item.key} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_3.5rem] items-center gap-3 sm:grid-cols-[minmax(0,12rem)_minmax(0,1fr)_4rem]">
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-medium" title={item.label}>{item.label}</span>
                {item.sub ? <span className="block truncate text-[11px] text-muted-foreground">{item.sub}</span> : null}
              </span>
              <span className="relative h-2.5" title={`${item.label} · ${percent(item.rate, 1)}`}>
                <span
                  className={cn("absolute inset-y-0 start-0 rounded-full", above ? "bg-primary" : "bg-muted-foreground/45")}
                  style={{ width: `${Math.max(2, (Math.max(item.rate, 0) / scale) * 100)}%` }}
                />
                {average !== null ? (
                  <span aria-hidden="true" className="absolute -inset-y-1 w-0.5 rounded-full bg-foreground/70" style={{ insetInlineStart: `${(average / scale) * 100}%` }} />
                ) : null}
              </span>
              <span className={cn("num text-end text-[12.5px]", above ? "font-semibold text-foreground" : "text-muted-foreground")}>{percent(item.rate, 1)}</span>
            </li>
          );
        })}
      </ul>
      {sorted.length > shown.length ? (
        <p className="mt-3 text-[11.5px] text-muted-foreground">
          أعلى <span className="num">{shown.length}</span> فرعاً من <span className="num">{sorted.length}</span>. كل الفروع في الجدول أدناه.
        </p>
      ) : null}
    </div>
  );
}
