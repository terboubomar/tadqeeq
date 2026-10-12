import { Activity, Eye, FileCheck2, HandCoins, Megaphone, Radar, ReceiptText, Sparkles, type LucideIcon } from "lucide-react";

import type { ProductKey } from "@/lib/products";
import { cn } from "@/lib/utils";

const ICONS: Record<ProductKey, LucideIcon> = {
  mutabiq: FileCheck2,
  kashif: ReceiptText,
  radar: Radar,
  istirdad: HandCoins,
  aaid: Megaphone,
  raqeeb: Eye,
  nabd: Activity,
  ai: Sparkles,
};

/** The product's icon in a soft rounded tile; the same icons as the homepage product cards and the app sidebar. */
export function ProductIcon({ product, className }: { product: ProductKey; className?: string }) {
  const Icon = ICONS[product];
  return (
    <span aria-hidden="true" className={cn("grid size-10 shrink-0 place-items-center rounded-xl bg-secondary text-primary-text", className)}>
      <Icon strokeWidth={1.75} className="size-[45%]" />
    </span>
  );
}
