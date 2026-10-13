import type { ReactNode } from "react";
import { ArrowLeft, type LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Magic UI's «Bento Grid» (via 21st.dev) in Tadqeeq's tokens and RTL: lucide icons instead of Radix icons, the
 * whole card is the link, and the call to action stays visible on touch screens (it only slides in on hover where
 * there is a pointer).
 */
function BentoGrid({ children, className }: { children: ReactNode; className?: string }) {
  return <ul className={cn("grid w-full auto-rows-[20rem] grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3", className)}>{children}</ul>;
}

function BentoCard({
  name,
  className,
  background,
  Icon,
  description,
  href,
  cta,
  dark = false,
}: {
  name: ReactNode;
  className?: string;
  /** The illustration behind the text, positioned by the caller. */
  background: ReactNode;
  Icon: LucideIcon;
  description: string;
  href: string;
  cta: string;
  /** The ink variant, for the featured card. */
  dark?: boolean;
}) {
  return (
    <li
      className={cn(
        "group relative flex flex-col justify-between overflow-hidden rounded-2xl border transform-gpu",
        dark
          ? "border-ink bg-ink text-ink-foreground"
          : "border-border bg-card shadow-[0_1px_2px_rgb(19_35_43/0.04),0_12px_24px_-16px_rgb(19_35_43/0.18)]",
        className,
      )}
    >
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {background}
      </div>

      <div className="pointer-events-none relative z-10 mt-auto flex transform-gpu flex-col gap-1.5 p-6 transition-transform duration-300 [@media(hover:hover)]:group-hover:-translate-y-9">
        <Icon
          strokeWidth={1.75}
          className={cn(
            "size-10 origin-right transform-gpu transition-transform duration-300 ease-in-out group-hover:scale-75",
            dark ? "text-primary" : "text-primary-text",
          )}
        />
        <h3 className="font-display text-xl font-bold">{name}</h3>
        <p className={cn("max-w-md text-[15px] leading-7", dark ? "text-ink-foreground/75" : "text-muted-foreground")}>{description}</p>
      </div>

      <div className="relative z-10 flex px-6 pb-5 transition-all duration-300 [@media(hover:hover)]:absolute [@media(hover:hover)]:bottom-0 [@media(hover:hover)]:translate-y-8 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-focus-within:translate-y-0 [@media(hover:hover)]:group-focus-within:opacity-100 [@media(hover:hover)]:group-hover:translate-y-0 [@media(hover:hover)]:group-hover:opacity-100">
        {/* The link covers the whole card; its text sits here. */}
        <a
          href={href}
          className={cn(
            "inline-flex items-center gap-1.5 text-sm font-semibold outline-none after:absolute after:inset-0 after:rounded-2xl after:content-[''] focus-visible:after:ring-2 focus-visible:after:ring-primary",
            dark ? "text-primary" : "text-primary-text",
          )}
        >
          {cta}
          <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-1" />
        </a>
      </div>

      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-0 transform-gpu transition-colors duration-300",
          dark ? "group-hover:bg-ink-foreground/[0.03]" : "group-hover:bg-ink/[0.02]",
        )}
      />
    </li>
  );
}

export { BentoCard, BentoGrid };
