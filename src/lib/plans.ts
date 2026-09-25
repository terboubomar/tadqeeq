import type { WorkspacePermission } from "./workspace-access";

export type PlanFeature = "invoice_audit" | "exceptions" | "compensation" | "contracts" | "ai";

export const PLAN_FEATURES: Array<{ key: PlanFeature; label: string }> = [
  { key: "invoice_audit", label: "مطابقة الفاتورة وخريطة الرسوم وتحليل العروض" },
  { key: "exceptions", label: "مركز الاستثناءات" },
  { key: "compensation", label: "مركز التعويضات وأدلة Telegram" },
  { key: "contracts", label: "العقود وشروط المنصات" },
  { key: "ai", label: "Tadqeeq AI" },
];

/** Always included in every plan. */
export const CORE_FEATURE_LABELS = [
  "اللوحة التنفيذية وتقارير الفروع واليوم",
  "رفع ملفات هنقرستيشن وكيتا وجاهز",
  "المستخدمون والصلاحيات",
];

const FEATURE_PERMISSIONS: Record<PlanFeature, WorkspacePermission[]> = {
  invoice_audit: ["financials.read"],
  exceptions: ["exceptions.read", "exceptions.manage"],
  compensation: ["compensation.read", "compensation.manage", "telegram.read", "telegram.manage", "recovery.read", "recovery.manage"],
  contracts: ["contracts.read", "contracts.manage"],
  ai: ["ai.use"],
};

export function isPlanFeature(value: unknown): value is PlanFeature {
  return typeof value === "string" && value in FEATURE_PERMISSIONS;
}

/** features === null means no plan assigned → everything allowed. */
export function filterPermissionsByPlan(
  permissions: readonly WorkspacePermission[],
  features: readonly PlanFeature[] | null,
): WorkspacePermission[] {
  if (!features) return [...permissions];
  const blocked = new Set<WorkspacePermission>();
  for (const [key, perms] of Object.entries(FEATURE_PERMISSIONS) as Array<[PlanFeature, WorkspacePermission[]]>) {
    if (!features.includes(key)) perms.forEach((p) => blocked.add(p));
  }
  return permissions.filter((p) => !blocked.has(p));
}

export interface PublicPlan {
  id: string;
  name: string;
  price: number;
  cycle: "monthly" | "yearly";
  features: PlanFeature[];
  uploadLimit: number | null;
  description: string | null;
  highlighted: boolean;
}
