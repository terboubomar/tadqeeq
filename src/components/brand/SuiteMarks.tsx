import { cn } from "@/lib/utils";

type MarkProps = {
  className?: string;
  /** Accessible name. Omit when the mark sits next to visible text that already names it. */
  title?: string;
};

/**
 * «ميزان»: a balance scale with a level beam (the invoice weighed against what it should be) under Tadqeeq's
 * amber checkmark (verified). Same rounded, heavy geometry and accent as the ت logo mark; the scale follows the
 * text colour, the checkmark is always amber.
 */
export function MizanMark({ className, title }: MarkProps) {
  return (
    <svg
      viewBox="0 0 64 64"
      className={cn("size-8 shrink-0", className)}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      <g fill="currentColor">
        <rect x="8" y="20" width="48" height="5" rx="2.5" />
        <rect x="29.5" y="22" width="5" height="28" rx="2.5" />
        <rect x="17" y="49" width="30" height="6" rx="3" />
        <path d="M3.5 39h17a8.5 8.5 0 0 1-17 0Z" />
        <path d="M43.5 39h17a8.5 8.5 0 0 1-17 0Z" />
      </g>
      <g fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <path d="M12 25 6 39M12 25l6 14M52 25l-6 14M52 25l6 14" />
      </g>
      <path
        className="stroke-brand-mark"
        fill="none"
        strokeWidth="4.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m25 10.5 5 5 10-10"
      />
    </svg>
  );
}
