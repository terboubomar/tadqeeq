import { Info } from "lucide-react";

import { PLATFORM_COST_DEFINITION_AR } from "@/lib/reporting-metrics";
import { cn } from "@/lib/utils";

/** How platform cost % is worked out, stated next to wherever the % is shown. */
export function CostDefinitionNote({ className }: { className?: string }) {
  return (
    <p className={cn("flex items-start gap-1.5 text-[11.5px] leading-5 text-muted-foreground", className)}>
      <Info className="mt-0.5 size-3.5 shrink-0" />
      <span>{PLATFORM_COST_DEFINITION_AR}</span>
    </p>
  );
}
