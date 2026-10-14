import {
  Activity,
  BookText,
  CalendarClock,
  CalendarDays,
  ChartLine,
  FileCheck2,
  HandCoins,
  History,
  LayoutDashboard,
  ListTree,
  Megaphone,
  Radar,
  ReceiptText,
  Sparkles,
  Store,
  Upload,
  Users,
  type LucideIcon,
} from "lucide-react";

import { PRODUCTS } from "@/lib/products";

/** The icon for each app page, shared by the sidebar, the phone menu and the page titles (Lucide, one stroke throughout). */
export const NAV_ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/ai": Sparkles,
  [PRODUCTS.nabd.path]: Activity,
  [PRODUCTS.mutabiq.path]: FileCheck2,
  [PRODUCTS.kashif.path]: ReceiptText,
  [PRODUCTS.aaid.path]: Megaphone,
  [PRODUCTS.radar.path]: Radar,
  [PRODUCTS.istirdad.path]: HandCoins,
  "/trends": ChartLine,
  "/branches": Store,
  "/journal": BookText,
  "/daily": CalendarDays,
  "/breakdown": ListTree,
  "/history": History,
  "/report-schedules": CalendarClock,
  "/import": Upload,
  "/team": Users,
};
