import { Link } from "@tanstack/react-router";
import { ChevronDown, type LucideIcon } from "lucide-react";
import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";

/**
 * The app's page building blocks (the platform redesign): page header with breadcrumb, action bar, number tiles,
 * list + detail layout, an ink-topped detail panel and collapsible sections. Drawn in the app's cream / ink / gold
 * tokens; red, amber and green are for statuses only.
 */

export interface Crumb {
  label: string;
  to?: string;
}

/** Breadcrumb, H1, subtitle and an optional end slot (counts, badges). */
export function PageHeader({
  crumbs,
  title,
  subtitle,
  aside,
}: {
  crumbs?: Crumb[];
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
}) {
  return (
    <header className="space-y-2">
      {crumbs?.length ? (
        <nav aria-label="مسار الصفحة" className="flex flex-wrap items-center gap-1.5 text-[12.5px] text-muted-foreground">
          {crumbs.map((crumb, index) => (
            <span key={crumb.label} className="flex items-center gap-1.5">
              {index > 0 ? <span aria-hidden="true">›</span> : null}
              {crumb.to ? (
                <Link to={crumb.to} className="hover:text-foreground">
                  {crumb.label}
                </Link>
              ) : (
                <span className={index === crumbs.length - 1 ? "text-foreground" : undefined}>{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="font-display text-[1.6rem] font-extrabold leading-[1.5]">{title}</h1>
          {subtitle ? <div className="mt-0.5 text-[13px] text-muted-foreground">{subtitle}</div> : null}
        </div>
        {aside}
      </div>
    </header>
  );
}

/** White rounded bar holding a page's commands, view switches and filters; wraps on small screens. */
export function ActionBar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div
      role="toolbar"
      aria-label="الإجراءات"
      data-noprint
      className={cn("flex flex-wrap items-center gap-1.5 rounded-xl border border-border bg-card p-1.5", className)}
    >
      {children}
    </div>
  );
}

/** A thin divider between groups in an ActionBar. */
export function ActionDivider() {
  return <span aria-hidden="true" className="mx-1 hidden h-6 w-px bg-border sm:block" />;
}

type TileTone = "plain" | "gold" | "danger" | "success";

const tileTone: Record<TileTone, { box: string; label: string; value: string }> = {
  plain: { box: "border-border bg-card", label: "text-muted-foreground", value: "text-foreground" },
  gold: { box: "border-primary bg-primary", label: "text-primary-foreground/80", value: "text-primary-foreground" },
  danger: { box: "border-destructive/25 bg-destructive-soft", label: "text-destructive/85", value: "text-destructive" },
  success: { box: "border-success/25 bg-success-soft", label: "text-success/85", value: "text-success" },
};

export interface NumberTile {
  label: string;
  value: string;
  hint?: string;
  tone?: TileTone;
  icon?: LucideIcon;
  to?: string;
}

/** Row of number tiles; a tile with `to` is a link to the list behind the number. */
export function NumberTiles({ items, className }: { items: NumberTile[]; className?: string }) {
  return (
    <section className={cn("grid gap-3 grid-cols-2 sm:[grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]", className)}>
      {items.map((item) => {
        const tone = tileTone[item.tone ?? "plain"];
        const body = (
          <>
            <span className={cn("flex items-start justify-between gap-2 text-[12.5px] leading-5", tone.label)}>
              {item.label}
              {item.icon ? <item.icon className="size-4 shrink-0 opacity-80" /> : null}
            </span>
            <span className={cn("num block truncate text-[16px] font-semibold leading-7 tracking-[-0.01em] sm:text-[24px] sm:leading-8", tone.value)}>{item.value}</span>
            {item.hint ? <span className={cn("block text-[11.5px] leading-5", tone.label)}>{item.hint}</span> : null}
          </>
        );
        const classes = cn("flex min-h-[92px] min-w-0 flex-col justify-between gap-1 rounded-xl border p-3 sm:min-h-[104px] sm:p-3.5", tone.box);
        return item.to ? (
          <Link key={item.label} to={item.to} className={cn(classes, "transition-transform hover:-translate-y-0.5")}>
            {body}
          </Link>
        ) : (
          <div key={item.label} className={classes}>
            {body}
          </div>
        );
      })}
    </section>
  );
}

/**
 * List with a detail panel beside it from xl up. Below xl the panel is not shown; pages open the same detail in a
 * sheet instead, so nothing is reachable only on wide screens.
 */
export function ListDetail({ list, detail, filters }: { list: ReactNode; detail?: ReactNode; filters?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start gap-4">
      {filters ? <aside className="w-full xl:w-56 xl:shrink-0">{filters}</aside> : null}
      <div className="min-w-0 flex-[999_1_520px]">{list}</div>
      {detail ? <aside className="hidden min-w-0 flex-[1_1_300px] xl:block xl:max-w-[380px]">{detail}</aside> : null}
    </div>
  );
}

/** Detail card with an ink header: an eyebrow line, a title and a headline amount. */
export function DetailPanel({
  eyebrow,
  title,
  value,
  children,
  className,
}: {
  eyebrow?: ReactNode;
  title: ReactNode;
  value?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("overflow-hidden rounded-2xl border border-border bg-card", className)}>
      <div className="space-y-1 bg-ink px-4 py-3.5 text-ink-foreground">
        {eyebrow ? <p className="text-[12px] text-ink-muted">{eyebrow}</p> : null}
        <h2 className="font-display text-[15px] font-bold leading-7">{title}</h2>
        {value ? <p className="num text-[24px] font-semibold leading-8 text-primary">{value}</p> : null}
      </div>
      {children ? <div className="space-y-3 p-4">{children}</div> : null}
    </section>
  );
}

/** Collapsible card section; the summary stays visible in the header when it is closed. */
export function Section({
  title,
  summary,
  defaultOpen = true,
  children,
}: {
  title: string;
  summary?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center gap-2.5 px-5 py-3.5 text-start"
      >
        <ChevronDown className={cn("size-4 shrink-0 text-primary-text transition-transform", !open && "rotate-90")} />
        <span className="font-display text-[15px] font-bold">{title}</span>
        {summary ? <span className="ms-auto text-[12.5px] text-muted-foreground">{summary}</span> : null}
      </button>
      {open ? <div className="border-t border-border/70">{children}</div> : null}
    </section>
  );
}
