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

/** Onboarding statuses that mean "signed up, not activated yet" — these workspaces run as a free trial. */
const TRIAL_STATUSES = new Set(["pending_details", "meeting_booked", "awaiting_payment", "onboarding"]);

/** A trial analyses one upload (one platform's files) with the invoice-analysis screens only. */
export const TRIAL_FEATURES: PlanFeature[] = ["invoice_audit"];
export const TRIAL_UPLOAD_LIMIT = 1;
/** Audit event written for every trial upload, so deleting the period does not reset the trial. */
export const TRIAL_UPLOAD_EVENT = "trial.upload";
/** Core permissions that are still closed during the trial. */
export const TRIAL_BLOCKED_PERMISSIONS: WorkspacePermission[] = ["users.manage"];

export function isTrialStatus(status: string): boolean {
  return TRIAL_STATUSES.has(status);
}

export interface PlanAccess {
  trial: boolean;
  /** What the member can do after role, plan and trial limits are applied. */
  permissions: WorkspacePermission[];
  /** Allowed by the member's role but closed by the plan or trial — shown locked with an upgrade prompt. */
  planLockedPermissions: WorkspacePermission[];
  uploadLimit: number | null;
  /** Uploads counted against uploadLimit: this month on a plan, all-time during the trial. */
  uploadsUsed: number;
}

export function resolvePlanAccess(input: {
  rolePermissions: readonly WorkspacePermission[];
  onboardingStatus: string;
  isPlatformAdmin: boolean;
  planFeatures: readonly PlanFeature[] | null;
  uploadLimit: number | null;
  uploadsThisMonth: number;
  trialUploads: number;
}): PlanAccess {
  const trial = !input.isPlatformAdmin && isTrialStatus(input.onboardingStatus);
  let permissions = filterPermissionsByPlan(input.rolePermissions, trial ? TRIAL_FEATURES : input.planFeatures);
  if (trial) permissions = permissions.filter((p) => !TRIAL_BLOCKED_PERMISSIONS.includes(p));
  const allowed = new Set(permissions);
  return {
    trial,
    permissions,
    planLockedPermissions: input.rolePermissions.filter((p) => !allowed.has(p)),
    uploadLimit: trial ? TRIAL_UPLOAD_LIMIT : input.uploadLimit,
    uploadsUsed: trial ? input.trialUploads : input.uploadsThisMonth,
  };
}

/** The plan feature that unlocks a permission, for upgrade prompts. */
export function featureForPermission(permission: WorkspacePermission): PlanFeature | null {
  for (const [key, perms] of Object.entries(FEATURE_PERMISSIONS) as Array<[PlanFeature, WorkspacePermission[]]>) {
    if (perms.includes(permission)) return key;
  }
  return null;
}

const EXTRA_LOCK_LABELS: Partial<Record<WorkspacePermission, string>> = {
  "users.manage": "المستخدمون والصلاحيات",
};

/** Human label for the section a locked permission belongs to. */
export function lockedFeatureLabel(permission: WorkspacePermission): string {
  const feature = featureForPermission(permission);
  return (feature && PLAN_FEATURES.find((f) => f.key === feature)?.label) || EXTRA_LOCK_LABELS[permission] || "هذا القسم";
}
