import { Link } from "@tanstack/react-router";
import { ChevronDown, Lock } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { LogoMark, LogoWordmark } from "@/components/brand/Logo";
import { NavIcon } from "@/components/NavIcons";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export type AppNavItem = { to: string; label: string; hint?: string; locked: boolean };
export type AppNavGroup = { title: string; items: AppNavItem[] };

type NavProps = {
  groups: AppNavGroup[];
  pathname: string;
  badgeFor: (to: string) => string;
};

type WorkspaceCardProps = { workspaceName: string; line: string; trial: boolean };

const LOCKED_HINT = "متاح بعد الاشتراك";
const CLOSED_GROUPS_KEY = "tadqeeq-nav-closed-groups";

/** Groups the person folded away, remembered on this device; every group starts open. */
function useClosedGroups() {
  const [closed, setClosed] = useState<string[]>([]);
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(CLOSED_GROUPS_KEY) ?? "[]");
      if (Array.isArray(saved)) setClosed(saved.filter((title): title is string => typeof title === "string"));
    } catch {
      // Unreadable storage: keep every group open.
    }
  }, []);
  const toggle = (title: string) =>
    setClosed((prev) => {
      const next = prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title];
      try {
        window.localStorage.setItem(CLOSED_GROUPS_KEY, JSON.stringify(next));
      } catch {
        // Storage unavailable: the choice lasts for this visit only.
      }
      return next;
    });
  return { closed, toggle };
}

function ItemBadge({ locked, badge }: { locked: boolean; badge: string }) {
  if (locked) return <Lock aria-label={LOCKED_HINT} className="size-3.5 shrink-0 text-primary" />;
  if (!badge) return null;
  return (
    <span className="num inline-grid min-w-[20px] shrink-0 place-items-center rounded-full bg-destructive px-1.5 py-0.5 text-[11px] font-semibold leading-none text-white">
      {badge}
    </span>
  );
}

/** The grouped page list: the full sidebar and the phone menu. */
export function AppNavList({ groups, pathname, badgeFor, onNavigate }: NavProps & { onNavigate?: () => void }) {
  const { closed, toggle } = useClosedGroups();
  const navRef = useRef<HTMLElement>(null);
  // Bring the open page into view when it changes (it can sit below the fold on short screens).
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [pathname]);
  return (
    <nav ref={navRef} aria-label="أقسام التطبيق" className="flex flex-col gap-4">
      {groups.map((group) => {
        const hasActive = group.items.some((item) => item.to === pathname);
        // The group holding the open page always shows, so you can see where you are.
        const open = hasActive || !closed.includes(group.title);
        const listId = `nav-group-${group.title}`;
        return (
          <div key={group.title}>
            <button
              type="button"
              onClick={() => toggle(group.title)}
              aria-expanded={open}
              aria-controls={listId}
              disabled={hasActive}
              className="group/head flex w-full items-center justify-between rounded-md px-3 pb-1 text-start text-xs font-semibold text-ink-muted/80 transition-colors hover:text-ink-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default disabled:hover:text-ink-muted/80"
            >
              {group.title}
              <ChevronDown
                aria-hidden="true"
                className={cn(
                  "size-3.5 opacity-0 transition-[transform,opacity] group-hover/head:opacity-100 group-focus-visible/head:opacity-100 group-disabled/head:hidden motion-reduce:transition-none",
                  !open && "rotate-90 opacity-100",
                )}
              />
            </button>
            {open ? (
              <ul id={listId} className="flex flex-col gap-0.5">
                {group.items.map((item) => {
                  const active = item.to === pathname;
                  return (
                    <li key={item.to}>
                      <Link
                        to={item.locked ? "/subscribe" : item.to}
                        title={item.locked ? LOCKED_HINT : undefined}
                        aria-current={active ? "page" : undefined}
                        onClick={onNavigate}
                        className={cn(
                          "relative flex min-h-9 items-center gap-3 rounded-lg px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none",
                          active ? "bg-ink-2 text-ink-foreground" : "text-ink-muted hover:bg-ink-2/55 hover:text-ink-foreground",
                        )}
                      >
                        {active ? <span aria-hidden="true" className="absolute inset-y-2 start-0 w-[3px] rounded-full bg-primary" /> : null}
                        <NavIcon to={item.to} className={cn("size-[18px]", active ? "text-primary" : "opacity-75", item.locked && "opacity-50")} />
                        <span className={cn("min-w-0 flex-1", item.locked && "opacity-60")}>
                          <span className={cn("block truncate text-[13.5px] leading-5", active ? "font-semibold" : "font-medium")}>{item.label}</span>
                          {item.hint ? <span className="block truncate text-[11px] leading-4 text-ink-muted/70">{item.hint}</span> : null}
                        </span>
                        <ItemBadge locked={item.locked} badge={badgeFor(item.to)} />
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

/** The folded sidebar: one icon per page with its name on hover or focus. */
export function AppNavRail({ groups, pathname, badgeFor, workspaceName, line }: NavProps & WorkspaceCardProps) {
  return (
    <TooltipProvider delayDuration={120}>
      <div className="flex h-full flex-col items-center">
        <Link to="/dashboard" aria-label="تدقيق، اللوحة التنفيذية" className="grid size-10 place-items-center rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          <LogoMark title="تدقيق" className="h-7 w-auto text-ink-foreground" />
        </Link>
        <nav aria-label="أقسام التطبيق" className="mt-4 flex w-full flex-1 flex-col items-center gap-2.5 overflow-y-auto pb-4 [scrollbar-width:none]">
          {groups.map((group, index) => (
            <ul key={group.title} aria-label={group.title} className={cn("flex flex-col items-center gap-0.5", index > 0 && "border-t border-ink-2 pt-2.5")}>
              {group.items.map((item) => {
                const active = item.to === pathname;
                const badge = badgeFor(item.to);
                return (
                  <li key={item.to}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          to={item.locked ? "/subscribe" : item.to}
                          aria-label={item.locked ? `${item.label}، ${LOCKED_HINT}` : item.label}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "relative grid size-9 place-items-center rounded-lg transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary motion-reduce:transition-none",
                            active ? "bg-ink-2 text-primary" : "text-ink-muted hover:bg-ink-2/55 hover:text-ink-foreground",
                          )}
                        >
                          <NavIcon to={item.to} className={cn("size-[18px]", item.locked && "opacity-50")} />
                          {item.locked ? (
                            <Lock aria-hidden="true" className="absolute -bottom-0.5 -start-0.5 size-3 rounded-full bg-ink p-px text-primary" />
                          ) : badge ? (
                            <span aria-hidden="true" className="num absolute -top-1 -start-1 grid min-w-4 place-items-center rounded-full bg-destructive px-1 text-[10px] font-semibold leading-4 text-white">
                              {badge}
                            </span>
                          ) : null}
                        </Link>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="bg-ink-2 text-ink-foreground">
                        {item.label}
                        {item.hint ? <span className="ms-1.5 text-ink-muted">{item.hint}</span> : null}
                        {item.locked ? <span className="ms-1.5 text-primary">{LOCKED_HINT}</span> : null}
                        {badge ? <span className="num ms-1.5 text-ink-muted">({badge})</span> : null}
                      </TooltipContent>
                    </Tooltip>
                  </li>
                );
              })}
            </ul>
          ))}
        </nav>
        <Tooltip>
          <TooltipTrigger asChild>
            <span tabIndex={0} aria-label={`${workspaceName}، ${line}`} className="grid size-10 place-items-center rounded-lg bg-ink-2 text-sm font-bold text-ink-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
              {workspaceName.trim().charAt(0) || "؟"}
            </span>
          </TooltipTrigger>
          <TooltipContent side="left" className="bg-ink-2 text-ink-foreground">
            {workspaceName}
            <span className="ms-1.5 text-ink-muted">{line}</span>
          </TooltipContent>
        </Tooltip>
      </div>
    </TooltipProvider>
  );
}

/** Wordmark and tagline at the top of the full sidebar and the phone menu. */
export function AppNavBrand({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <Link to="/dashboard" onClick={onNavigate} className="block rounded-lg px-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
      <LogoWordmark title="تدقيق" className="h-7 text-ink-foreground" />
      <span className="mt-1.5 block text-xs text-ink-muted">مراجعة فواتير التوصيل</span>
    </Link>
  );
}

/** The workspace and its plan, at the foot of the sidebar. */
export function AppNavWorkspace({ workspaceName, line, trial, onNavigate }: WorkspaceCardProps & { onNavigate?: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-ink-2 p-3">
      <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-lg bg-ink text-sm font-bold text-primary">
        {workspaceName.trim().charAt(0) || "؟"}
      </span>
      <div className="min-w-0 flex-1 text-xs leading-5">
        <p className="truncate font-semibold text-ink-foreground">{workspaceName}</p>
        <p className="truncate text-ink-muted">{line}</p>
      </div>
      {trial ? (
        <Link to="/subscribe" onClick={onNavigate} className="shrink-0 rounded-md bg-primary px-2.5 py-1.5 text-xs font-semibold text-primary-foreground transition-colors hover:bg-primary/90">
          اشترك الآن
        </Link>
      ) : null}
    </div>
  );
}
