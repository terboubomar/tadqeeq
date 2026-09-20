import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

interface StatCardProps {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: "default" | "positive" | "negative" | "gold";
  className?: string;
}

const toneText: Record<NonNullable<StatCardProps["tone"]>, string> = {
  default: "text-foreground",
  positive: "text-success",
  negative: "text-destructive",
  gold: "text-primary",
};

export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "rounded-[10px] border border-border bg-white px-[18px] py-[15px]",
        className,
      )}
    >
      <p className="text-[11.5px] font-medium leading-5 text-muted-foreground">{label}</p>
      <p className={cn("num mt-1.5 text-[21px] font-semibold tracking-[-0.01em]", toneText[tone])}>
        {value}
      </p>
      {hint ? <p className="mt-1 text-[11.5px] leading-5 text-muted-foreground">{hint}</p> : null}
    </div>
  );
}
