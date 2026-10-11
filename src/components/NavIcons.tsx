import { NAV_ICONS } from "@/lib/nav-icons";
import { cn } from "@/lib/utils";

/** A page's nav icon; pages without one get a small dot so labels stay aligned. */
export function NavIcon({ to, className }: { to: string; className?: string }) {
  const Icon = NAV_ICONS[to];
  return Icon ? (
    <Icon aria-hidden="true" strokeWidth={1.75} className={cn("shrink-0", className)} />
  ) : (
    <span aria-hidden="true" className={cn("grid shrink-0 place-items-center", className)}>
      <span className="size-1 rounded-full bg-current" />
    </span>
  );
}
