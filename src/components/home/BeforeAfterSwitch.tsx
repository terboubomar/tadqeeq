import { Check, X } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * One card with a «مع تدقيق» switch: off lists the month without Tadqeeq, on lists it with Tadqeeq. Both lists stay in
 * the page (stacked in one grid cell) so the text is always readable by search engines; only the active one shows.
 */
export function BeforeAfterSwitch({ before, after }: { before: string[]; after: string[] }) {
  const [on, setOn] = useState(false);
  const list = (items: string[], active: boolean, good: boolean) => (
    <ul
      aria-hidden={!active}
      className={cn(
        "space-y-3.5 text-[15px] transition-[opacity,transform] duration-300 [grid-area:1/1]",
        active ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-1.5 opacity-0",
      )}
    >
      {items.map((item) => (
        <li key={item} className="flex items-center gap-2.5">
          <span className={cn("grid size-5 shrink-0 place-items-center rounded-full", good ? "bg-primary text-primary-foreground" : "bg-destructive/12 text-destructive")}>
            {good ? <Check className="size-3" /> : <X className="size-3" />}
          </span>
          {item}
        </li>
      ))}
    </ul>
  );

  return (
    <div
      data-reveal
      className={cn(
        "rounded-[22px] border p-6 transition-colors duration-300 sm:p-7",
        on ? "border-transparent bg-ink text-ink-foreground shadow-[0_30px_60px_-30px_rgb(19_35_43/0.45)]" : "border-border bg-card",
      )}
    >
      <div className="flex items-center justify-between gap-4">
        <p className={cn("text-sm font-bold", on ? "text-primary" : "text-destructive")}>{on ? "شهرك مع تدقيق" : "شهرك من دون تدقيق"}</p>
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => setOn((value) => !value)}
          className={cn(
            "flex h-10 shrink-0 items-center gap-2.5 rounded-full ps-3.5 pe-1.5 text-[13px] font-semibold transition-colors",
            on ? "bg-ink-foreground/10" : "bg-secondary text-primary-text",
          )}
        >
          مع تدقيق
          <span className={cn("relative h-7 w-12 rounded-full transition-colors", on ? "bg-primary" : "bg-foreground/20")}>
            <span
              aria-hidden="true"
              className={cn("absolute top-1 size-5 rounded-full bg-white shadow transition-[inset-inline-start] duration-300", on ? "start-6" : "start-1")}
            />
          </span>
        </button>
      </div>
      <div className="mt-6 grid">
        {list(before, !on, false)}
        {list(after, on, true)}
      </div>
    </div>
  );
}
