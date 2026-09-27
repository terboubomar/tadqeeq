import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, Tooltip } from "recharts";

import { cn } from "@/lib/utils";

/**
 * Dashboard building blocks: stat tiles, trend cards, metric cards, chart cards and an activity feed.
 * Layout ideas from classic admin kits, drawn in Tadqeeq's cream / ink / gold tokens and RTL.
 */

type Tone = "default" | "positive" | "negative" | "gold";

const toneText: Record<Tone, string> = {
  default: "text-foreground",
  positive: "text-success",
  negative: "text-destructive",
  gold: "text-primary-text",
};

export interface StatTile {
  label: string;
  value: string;
  icon: LucideIcon;
  hint?: string;
  tone?: Tone;
}

/** Grid of small stats split by hairlines: icon, value, label. */
export function StatTiles({ items, className }: { items: StatTile[]; className?: string }) {
  return (
    <section className={cn("panel grid overflow-hidden sm:grid-cols-2 lg:grid-cols-3", className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className="-mb-px -ms-px flex items-start gap-3 border-b border-s border-border/70 px-4 py-4 sm:px-5"
        >
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-secondary text-primary-text">
            <item.icon className="size-4" />
          </span>
          <div className="min-w-0">
            <p className={cn("num whitespace-nowrap text-[17px] font-semibold leading-7 tracking-[-0.01em]", toneText[item.tone ?? "default"])}>
              {item.value}
            </p>
            <p className="text-[12px] leading-5 text-muted-foreground">{item.label}</p>
            {item.hint ? <p className="mt-0.5 text-[11px] leading-4 text-muted-foreground/80">{item.hint}</p> : null}
          </div>
        </div>
      ))}
    </section>
  );
}

export interface TrendPoint {
  label: string;
  value: number;
}

/**
 * A headline number with a small trend chart that runs into an ink strip of up to three sub-stats.
 * `format` renders values in the chart tooltip.
 */
export function TrendCard({
  value,
  label,
  description,
  data,
  variant = "area",
  format,
  band,
  className,
}: {
  value: string;
  label: string;
  description?: string;
  data: TrendPoint[];
  variant?: "area" | "bars";
  format: (value: number) => string;
  band: { value: string; label: string }[];
  className?: string;
}) {
  const id = `trend-${label.replace(/\s+/g, "-")}`;
  return (
    <section className={cn("panel flex flex-col overflow-hidden", className)}>
      <div className="px-5 pt-5">
        <p className="num text-[26px] font-semibold leading-8 tracking-[-0.02em]">{value}</p>
        <p className="mt-0.5 text-[13px] font-semibold text-primary-text">{label}</p>
        {description ? <p className="mt-2 text-[12px] leading-5 text-muted-foreground">{description}</p> : null}
      </div>
      <div className="mt-auto h-20 pt-3" dir="ltr">
        {data.length > 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            {variant === "area" ? (
              <AreaChart data={data} margin={{ top: 4, right: 0, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <Tooltip content={<SparkTip format={format} />} cursor={{ stroke: "var(--color-border)" }} />
                <Area type="monotone" dataKey="value" stroke="var(--color-primary)" strokeWidth={2} fill={`url(#${id})`} />
              </AreaChart>
            ) : (
              <BarChart data={data} margin={{ top: 4, right: 4, left: 4, bottom: 0 }} barCategoryGap={2}>
                <Tooltip content={<SparkTip format={format} />} cursor={{ fill: "var(--color-muted)" }} />
                <Bar dataKey="value" fill="var(--color-primary)" radius={[2, 2, 0, 0]} />
              </BarChart>
            )}
          </ResponsiveContainer>
        ) : null}
      </div>
      <div className="grid bg-ink text-ink-foreground" style={{ gridTemplateColumns: `repeat(${Math.max(band.length, 1)}, minmax(0, 1fr))` }}>
        {band.map((b) => (
          <div key={b.label} className="px-3 py-3 text-center">
            <p className="num text-[16px] font-semibold leading-6">{b.value}</p>
            <p className="truncate text-[11px] text-ink-muted" title={b.label}>{b.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function SparkTip({ active, payload, format }: { active?: boolean; payload?: { payload: TrendPoint }[]; format: (v: number) => string }) {
  const point = active ? payload?.[0]?.payload : undefined;
  if (!point) return null;
  return (
    <div dir="rtl" className="rounded-md border border-border bg-popover px-2 py-1 text-[11px] shadow-sm">
      <span className="text-muted-foreground">{point.label}</span> · <span className="num font-semibold">{format(point.value)}</span>
    </div>
  );
}

/** Single figure with an icon. `highlight` fills it with ink for the one number that matters most. */
export function MetricCard({
  label,
  value,
  icon: Icon,
  hint,
  tone = "default",
  highlight = false,
  to,
  className,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  hint?: string;
  tone?: Tone;
  highlight?: boolean;
  to?: string;
  className?: string;
}) {
  const body = (
    <>
      <div className="flex items-center justify-between gap-3">
        <p className={cn("text-[12.5px] leading-5", highlight ? "text-ink-muted" : "text-muted-foreground")}>{label}</p>
        <span
          className={cn(
            "grid size-8 shrink-0 place-items-center rounded-lg",
            highlight ? "bg-ink-2 text-primary" : "bg-secondary text-primary-text",
          )}
        >
          <Icon className="size-4" />
        </span>
      </div>
      <p
        className={cn(
          "num mt-1 whitespace-nowrap text-[21px] font-semibold leading-8 tracking-[-0.01em]",
          highlight ? "text-primary" : toneText[tone],
        )}
      >
        {value}
      </p>
      {hint ? (
        <p className={cn("mt-1 text-[11.5px] leading-5", highlight ? "text-ink-muted" : "text-muted-foreground")}>{hint}</p>
      ) : null}
    </>
  );
  const classes = cn(
    "block rounded-[14px] border p-5 transition-colors",
    highlight ? "border-ink bg-ink text-ink-foreground" : "border-border bg-card shadow-[var(--shadow-panel)]",
    to && (highlight ? "hover:bg-ink-2" : "hover:border-primary/40"),
    className,
  );
  return to ? (
    <Link to={to} className={classes}>
      {body}
    </Link>
  ) : (
    <div className={classes}>{body}</div>
  );
}

/** Card with a titled header, optional headline totals and a body (usually a chart or table). */
export function ChartCard({
  title,
  action,
  totals,
  children,
  className,
  bodyClassName,
}: {
  title: string;
  action?: ReactNode;
  totals?: { label: string; value: string; tone?: Tone }[];
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}) {
  return (
    <section className={cn("panel flex flex-col overflow-hidden", className)}>
      <header className="flex items-center justify-between gap-3 border-b border-border px-5 py-3.5">
        <h2 className="text-[14px] font-bold">{title}</h2>
        {action}
      </header>
      {totals?.length ? (
        <div className="flex flex-wrap gap-x-8 gap-y-3 px-5 pt-4">
          {totals.map((t) => (
            <div key={t.label}>
              <p className={cn("num whitespace-nowrap text-[21px] font-semibold leading-7 tracking-[-0.01em]", toneText[t.tone ?? "default"])}>{t.value}</p>
              <p className="text-[12px] text-muted-foreground">{t.label}</p>
            </div>
          ))}
        </div>
      ) : null}
      <div className={cn("flex-1 p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

export interface FeedItem {
  id: string;
  icon: LucideIcon;
  tone?: "default" | "warning" | "critical" | "positive";
  title: string;
  meta?: string;
  aside?: string;
  to?: string;
}

const feedTone: Record<NonNullable<FeedItem["tone"]>, string> = {
  default: "bg-secondary text-primary-text",
  warning: "bg-warning/10 text-warning",
  critical: "bg-destructive-soft text-destructive",
  positive: "bg-success-soft text-success",
};

/** List of events or items needing attention: icon bubble, text, and a value or time at the end. */
export function ActivityFeed({ items, empty }: { items: FeedItem[]; empty: string }) {
  if (!items.length) return <p className="py-6 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="-my-1.5">
      {items.map((item) => {
        const row = (
          <>
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-lg", feedTone[item.tone ?? "default"])}>
              <item.icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-medium">{item.title}</span>
              {item.meta ? <span className="block truncate text-[11.5px] text-muted-foreground">{item.meta}</span> : null}
            </span>
            {item.aside ? <span className="num shrink-0 whitespace-nowrap text-[12px] font-semibold">{item.aside}</span> : null}
          </>
        );
        return (
          <li key={item.id}>
            {item.to ? (
              <Link to={item.to} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-muted/60">
                {row}
              </Link>
            ) : (
              <div className="flex items-center gap-3 py-2.5">{row}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
