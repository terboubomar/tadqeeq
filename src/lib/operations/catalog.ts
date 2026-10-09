import type { OperationPlatform, OperationSourceKind } from "./types";

export const OPERATION_PLATFORMS: Array<{ id: OperationPlatform; description: string }> = [
  { id: "hungerstation", description: "المبيعات، الخصومات، العمولات والتحويلات" },
  { id: "keeta", description: "الطلبات، العروض، العمولات والمصروفات" },
  { id: "jahez", description: "الطلبات مع الاستردادات والتعويضات المنفصلة" },
];

export const OPERATION_SOURCES: Array<{
  kind: OperationSourceKind;
  platform: OperationPlatform;
  title: string;
  note: string;
  accept: string;
}> = [
  {
    kind: "hungerstation_orders",
    platform: "hungerstation",
    title: "طلبات هنقرستيشن",
    note: "ملف Orders اليومي",
    accept: ".csv,.xlsx,.xls",
  },
  {
    kind: "keeta_orders",
    platform: "keeta",
    title: "طلبات كيتا",
    note: "ملف Recent Orders اليومي",
    accept: ".xlsx,.xls",
  },
  {
    kind: "jahez_orders",
    platform: "jahez",
    title: "طلبات جاهز",
    note: "تقرير الطلبات المالي اليومي",
    accept: ".csv",
  },
  {
    kind: "jahez_adjustments",
    platform: "jahez",
    title: "استردادات جاهز",
    note: "ملف الخصومات والتعويضات المنفصل",
    accept: ".csv",
  },
];

export const operationSourceLabels = Object.fromEntries(
  OPERATION_SOURCES.map((source) => [source.kind, source.title]),
) as Record<OperationSourceKind, string>;

export function currentOperationMonth(): string {
  const today = new Date();
  return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}`;
}

export function operationPlatformLabel(platform: OperationPlatform): string {
  if (platform === "hungerstation") return "هنقرستيشن";
  if (platform === "keeta") return "كيتا";
  return "جاهز";
}
