import { BellRing, FileText, HandCoins, PlayCircle } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "@/lib/utils";
import type { ProductKey } from "@/lib/products";

/**
 * Small animated drawings for the product bento on the homepage, one per product. They are decoration (hidden from
 * screen readers), drawn with Tadqeeq's tokens, and stop with the rest of the landing page's motion under reduced
 * motion (`.lp-root` rule in styles.css). Figures in them are illustrative.
 */
export function ProductIllustration({ product }: { product: ProductKey }) {
  switch (product) {
    case "mutabiq":
      return <InvoiceCheck />;
    case "kashif":
      return <FeeDonut />;
    case "radar":
      return <RadarSweep />;
    case "istirdad":
      return <ClaimFlow />;
    case "aaid":
      return <RoiLine />;
    case "nabd":
      return <PulseLine />;
    case "raqeeb":
      return <AlertBell />;
    default:
      return null;
  }
}

/** The drawing area: the top of the card, fading out before the text. */
function Stage({ children, className, dark = false }: { children: ReactNode; className?: string; dark?: boolean }) {
  return (
    <div
      className={cn(
        "absolute inset-x-0 top-0 flex h-[58%] items-center justify-center px-6 pt-6",
        dark
          ? "[mask-image:linear-gradient(to_bottom,black_70%,transparent)]"
          : "[mask-image:linear-gradient(to_bottom,black_65%,transparent)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** «مُطابِق»: invoice lines checked one by one against the contract, the difference highlighted. */
function InvoiceCheck() {
  const rows = [
    ["العمولة", "2,840.00", true],
    ["رسوم الدفع", "412.30", false],
    ["التوصيل", "1,105.00", false],
    ["التعويضات", "142.50", true],
    ["الضريبة", "558.20", false],
  ] as const;
  return (
    <Stage dark className="h-[62%] items-start pt-7">
      <div className="w-full max-w-sm rounded-xl border border-ink-foreground/10 bg-ink-foreground/[0.04] p-3">
        <div className="flex items-center gap-2 border-b border-ink-foreground/10 pb-2 text-[11px] text-ink-foreground/60">
          <FileText className="size-3.5" />
          فاتورة المنصة · سبتمبر
        </div>
        <ul className="mt-1.5 space-y-0.5">
          {rows.map(([label, amount, flagged], i) => (
            <li
              key={label}
              className={cn("lp-scan-dark flex items-center justify-between rounded-md px-2 py-1.5 text-[12px]", i >= 2 && "max-md:hidden")}
              style={{ animationDelay: `${i * 0.9}s` }}
            >
              <span className="text-ink-foreground/80">{label}</span>
              <span className="flex items-center gap-2">
                <span className="num text-ink-foreground/90">{amount}</span>
                <span
                  className={cn("size-1.5 rounded-full", flagged ? "lp-blink-dot bg-primary" : "bg-success")}
                  style={flagged ? { animationDelay: `${i * 0.3}s` } : undefined}
                />
              </span>
            </li>
          ))}
        </ul>
      </div>
      <span className="lp-float absolute end-4 top-3 rounded-full bg-primary px-3 py-1 text-xs font-bold text-primary-foreground shadow-lg md:end-auto md:start-8 md:top-auto md:bottom-[22%]">
        الفرق <span className="num">1,659.00</span>
      </span>
    </Stage>
  );
}

/** «كاشِف»: where each riyal goes, as a slowly turning ring of fee shares. */
function FeeDonut() {
  const parts = [
    [42, "var(--primary)"],
    [24, "var(--ink)"],
    [18, "oklch(0.75 0.06 210)"],
    [16, "oklch(0.86 0.03 85)"],
  ] as const;
  let offset = 0;
  return (
    <Stage>
      <div className="relative">
        <svg viewBox="0 0 42 42" className="size-28 animate-spin [animation-duration:24s]">
          {parts.map(([share, color]) => {
            const el = (
              <circle
                key={color}
                cx="21"
                cy="21"
                r="15.915"
                fill="none"
                stroke={color}
                strokeWidth="6"
                strokeDasharray={`${share - 1.2} ${100 - share + 1.2}`}
                strokeDashoffset={25 - offset}
              />
            );
            offset += share;
            return el;
          })}
        </svg>
        <span className="absolute inset-0 grid place-items-center text-center text-[11px] font-semibold leading-tight text-muted-foreground">
          <span>
            <span className="num block text-base text-foreground">42%</span>
            عمولة
          </span>
        </span>
      </div>
    </Stage>
  );
}

/** «رادار»: a sweep that finds the open differences. */
function RadarSweep() {
  return (
    <Stage>
      <div className="relative size-32 rounded-full border border-border bg-background/60">
        <span className="absolute inset-4 rounded-full border border-border" />
        <span className="absolute inset-9 rounded-full border border-border" />
        <span className="absolute inset-0 animate-spin rounded-full bg-[conic-gradient(from_0deg,oklch(0.66_0.13_70/0.35),transparent_30%)] [animation-duration:3.2s]" />
        <span className="absolute start-[28%] top-[30%] size-2 animate-ping rounded-full bg-primary [animation-duration:2.4s]" />
        <span className="absolute start-[28%] top-[30%] size-2 rounded-full bg-primary" />
        <span className="absolute bottom-[26%] end-[24%] size-2 rounded-full bg-destructive" />
        <span className="absolute bottom-[26%] end-[24%] size-2 animate-ping rounded-full bg-destructive [animation-delay:1.1s] [animation-duration:2.4s]" />
      </div>
    </Stage>
  );
}

/** «استرداد»: the branch's video evidence travelling to the claim, money coming back. */
function ClaimFlow() {
  return (
    <Stage className="gap-4">
      <span className="grid size-14 place-items-center rounded-2xl border border-border bg-background text-muted-foreground">
        <PlayCircle className="size-6" strokeWidth={1.75} />
      </span>
      <svg viewBox="0 0 120 12" className="h-3 w-24 sm:w-40" preserveAspectRatio="none">
        <line x1="0" y1="6" x2="120" y2="6" stroke="var(--border)" strokeWidth="2" strokeLinecap="round" />
        <line x1="0" y1="6" x2="120" y2="6" stroke="var(--primary)" strokeWidth="2" strokeLinecap="round" strokeDasharray="10 14" className="lp-dash" />
      </svg>
      <span className="relative grid size-14 place-items-center rounded-2xl bg-success-soft text-success">
        <HandCoins className="size-6" strokeWidth={1.75} />
        <span className="lp-pop absolute inset-x-0 -top-3 mx-auto w-fit rounded-full bg-success px-2 py-0.5 text-[10px] font-bold whitespace-nowrap text-white">
          + <span className="num">142.50</span>
        </span>
      </span>
    </Stage>
  );
}

/** «عائد»: a campaign's real return, drawn as a rising line. */
function RoiLine() {
  return (
    <Stage>
      <svg viewBox="0 0 160 80" className="h-24 w-full max-w-[220px] overflow-visible">
        <path d="M0 70 H160" stroke="var(--border)" strokeWidth="1" />
        <path d="M0 64 L32 58 L64 60 L96 38 L128 30 L160 12" fill="none" stroke="var(--primary)" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" pathLength={1} className="lp-draw" />
        <circle cx="160" cy="12" r="4" fill="var(--primary)" className="lp-blink-dot" />
      </svg>
      <span className="absolute end-7 top-7 rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-primary-text">
        عائد <span className="num">1.8x</span>
      </span>
    </Stage>
  );
}

/** «نَبْض»: the day's platform cost as a live pulse. */
function PulseLine() {
  return (
    <Stage>
      <svg viewBox="0 0 200 60" className="h-20 w-full max-w-[240px]">
        <path d="M0 30 H60 L72 10 L84 50 L96 22 L104 30 H200" fill="none" stroke="var(--border)" strokeWidth="2" strokeLinejoin="round" />
        <path
          d="M0 30 H60 L72 10 L84 50 L96 22 L104 30 H200"
          fill="none"
          stroke="var(--primary)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray="0.22 0.78"
          className="lp-run"
        />
      </svg>
    </Stage>
  );
}

/** «رقيب»: an unusual charge rings the bell. */
function AlertBell() {
  return (
    <Stage className="gap-5">
      <span className="relative grid size-14 place-items-center rounded-full bg-secondary text-primary-text">
        <span className="absolute inset-0 animate-ping rounded-full bg-primary/25 [animation-duration:2.2s]" />
        <BellRing className="lp-ring size-6" strokeWidth={1.75} />
      </span>
      <span className="lp-pop rounded-xl border border-border bg-background px-3 py-2 text-[12px] shadow-sm">
        <span className="block font-semibold">رسم غير معتاد</span>
        <span className="text-muted-foreground">
          فرع النخيل · <span className="num">350.00</span>
        </span>
      </span>
    </Stage>
  );
}
