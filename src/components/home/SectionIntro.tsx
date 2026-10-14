import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

/** Eyebrow, title and lead of a public-page section. */
export function SectionIntro({
  eyebrow,
  title,
  tone = "primary",
  heading = "h2",
  children,
}: {
  eyebrow: string;
  title: string;
  tone?: "primary" | "success";
  /** "aria" keeps heading semantics without a second <h2> when a section renders its intro twice (desktop + phone). */
  heading?: "h1" | "h2" | "aria";
  children?: ReactNode;
}) {
  const titleClass = "mt-3 font-display text-3xl font-extrabold leading-[1.4] sm:text-[2.6rem]";
  return (
    <div data-reveal className="flex flex-col">
      <p className={cn("flex items-center gap-2 text-[13px] font-semibold", tone === "success" ? "text-success" : "text-primary-text")}>
        <span className={cn("size-1.5 rounded-full", tone === "success" ? "bg-success" : "bg-primary")} />
        {eyebrow}
      </p>
      {heading === "h1" ? (
        <h1 className={titleClass}>{title}</h1>
      ) : heading === "h2" ? (
        <h2 className={titleClass}>{title}</h2>
      ) : (
        <p role="heading" aria-level={2} className={titleClass}>
          {title}
        </p>
      )}
      {children ? <div className="mt-4 flex flex-col text-base leading-8 text-muted-foreground sm:text-[17px]">{children}</div> : null}
    </div>
  );
}
