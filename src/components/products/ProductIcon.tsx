import { Activity, AlertTriangle, Eye, FileSpreadsheet, Megaphone, PieChart, Sparkles, Video, type LucideIcon } from "lucide-react";

import type { ProductKey } from "@/lib/products";
import { cn } from "@/lib/utils";

const ICONS: Record<ProductKey, LucideIcon> = {
  mutabiq: FileSpreadsheet,
  kashif: PieChart,
  radar: AlertTriangle,
  istirdad: Video,
  aaid: Megaphone,
  raqeeb: Eye,
  nabd: Activity,
  ai: Sparkles,
};

/** The product's icon in a soft rounded tile; the same icons the homepage tour uses. */
export function ProductIcon({ product, className }: { product: ProductKey; className?: string }) {
  const Icon = ICONS[product];
  return (
    <span aria-hidden="true" className={cn("grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary-text", className)}>
      <Icon className="size-[18px]" />
    </span>
  );
}
