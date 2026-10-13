import { Link } from "@tanstack/react-router";
import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, YAxis } from "recharts";

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
export function StatTiles({ items, cols = 3, className }: { items: StatTile[]; cols?: 3 | 4; className?: string }) {
  return (
    <section className={cn("panel grid overflow-hidden sm:grid-cols-2", cols === 4 ? "xl:grid-cols-4" : "lg:grid-cols-3", className)}>
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
  reference,
  format,
  band,
  className,
}: {
  value: string;
  label: string;
  description?: string;
  data: TrendPoint[];
  /** "line" is for rates: no fill, the scale fits the data, and `reference` draws the average as a dashed line. */
  variant?: "area" | "bars" | "line";
  reference?: number;
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
            {variant === "line" ? (
              <LineChart data={data} margin={{ top: 6, right: 8, left: 8, bottom: 6 }}>
                <YAxis hide domain={["dataMin", "dataMax"]} padding={{ top: 4, bottom: 4 }} />
                <Tooltip content={<SparkTip format={format} />} cursor={{ stroke: "var(--color-border)" }} />
                {reference !== undefined ? (
                  <ReferenceLine y={reference} stroke="var(--color-muted-foreground)" strokeDasharray="4 4" strokeWidth={1} ifOverflow="extendDomain" />
                ) : null}
                <Line type="monotone" dataKey="value" stroke="var(--color-primary)" strokeWidth={2} dot={false} activeDot={{ r: 4, stroke: "var(--color-card)", strokeWidth: 2 }} isAnimationActive={false} />
              </LineChart>
            ) : variant === "area" ? (
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

const calloutTone = {
  success: { box: "border-success/25 bg-success/5", icon: "text-success", title: "" },
  danger: { box: "border-destructive/25 bg-destructive/5", icon: "text-destructive", title: "text-destructive" },
  warning: { box: "border-warning/30 bg-warning/5", icon: "text-warning", title: "" },
  info: { box: "border-primary/20 bg-secondary/40", icon: "text-primary-text", title: "" },
} as const;

/** Inline notice with an icon, a bold title and an explanation. */
export function Callout({
  tone,
  icon: Icon,
  title,
  children,
  className,
}: {
  tone: keyof typeof calloutTone;
  icon: LucideIcon;
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  const t = calloutTone[tone];
  return (
    <section className={cn("flex items-start gap-3 rounded-[14px] border p-4", t.box, className)}>
      <Icon className={cn("mt-0.5 size-5 shrink-0", t.icon)} />
      <div className="min-w-0">
        <h2 className={cn("text-sm font-bold", t.title)}>{title}</h2>
        {children ? <div className="mt-1 text-[12.5px] leading-6 text-muted-foreground">{children}</div> : null}
      </div>
    </section>
  );
}

export interface BarListItem {
  key: string;
  label: string;
  value: string;
  /** 0–1: the bar length relative to the largest item. Leave it out when the items are not on one scale (no bar is drawn). */
  size?: number;
  share?: string;
  sub?: string;
  color?: string;
}

/** Ranked rows with a proportional bar under each label. */
export function BarList({ items, empty = "لا توجد بيانات." }: { items: BarListItem[]; empty?: string }) {
  if (!items.length) return <p className="py-4 text-center text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-3.5">
      {items.map((item) => (
        <li key={item.key}>
          <div className="flex items-baseline justify-between gap-3">
            <span className="min-w-0 truncate text-[13px] font-medium" title={item.label}>
              {item.color ? <span className="me-2 inline-block size-2.5 rounded-[3px] align-middle" style={{ background: item.color }} /> : null}
              {item.label}
            </span>
            <span className="flex shrink-0 items-baseline gap-2">
              {item.share ? <span className="num text-[11.5px] text-muted-foreground">{item.share}</span> : null}
              <span className="num text-[13px] font-semibold">{item.value}</span>
            </span>
          </div>
          {item.size !== undefined ? (
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full"
                style={{ width: `${Math.max(item.size * 100, item.size > 0 ? 1.5 : 0)}%`, background: item.color ?? "var(--color-primary)" }}
              />
            </div>
          ) : null}
          {item.sub ? <p className="mt-1 text-[11px] leading-5 text-muted-foreground">{item.sub}</p> : null}
        </li>
      ))}
    </ul>
  );
}

/** One bar split into coloured segments with a legend of counts or amounts. */
export function SegmentBar({ segments }: { segments: { key: string; label: string; value: number; display: string; color: string }[] }) {
  const total = segments.reduce((sum, s) => sum + Math.max(s.value, 0), 0);
  return (
    <div>
      <div className="flex h-3 overflow-hidden rounded-full bg-muted">
        {segments.map((s) =>
          s.value > 0 ? (
            <span key={s.key} title={s.label} style={{ width: `${(s.value / (total || 1)) * 100}%`, background: s.color }} />
          ) : null,
        )}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2">
        {segments.map((s) => (
          <span key={s.key} className="flex items-center gap-1.5 text-[12px]">
            <span className="size-2.5 rounded-[3px]" style={{ background: s.color }} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="num font-semibold">{s.display}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

/** Pill toggle between a few views, e.g. all rows vs. flagged rows. */
export function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <div data-noprint className="inline-flex rounded-lg border border-border bg-background p-0.5 text-[12px]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn("rounded-md px-2.5 py-1 transition-colors", value === o.value ? "bg-ink font-semibold text-ink-foreground" : "text-muted-foreground hover:text-foreground")}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
