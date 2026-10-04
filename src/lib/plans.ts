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
  /** Price per `cycle` (monthly for order-based plans). */
  price: number;
  cycle: "monthly" | "yearly";
  features: PlanFeature[];
  uploadLimit: number | null;
  description: string | null;
  highlighted: boolean;
  /** Stable key of the order-based plans (start, growth, unlimited; older: scale, groups, enterprise); null for older plans. */
  code: string | null;
  /** Orders checked per month the plan is sized for (soft limit); null = no limit. */
  orderLimit: number | null;
  /** Yearly price of the same plan, when it has one. */
  priceYearly: number | null;
  /** Priced by agreement (no public price). */
  customPrice: boolean;
}

/** Order-based plans (they carry a code); older plans are shown only when none exist. */
export function orderBasedPlans(plans: PublicPlan[]): PublicPlan[] {
  return plans.filter((plan) => plan.code !== null);
}

/** The smallest order-based plan sized for `orders` a month; above every limit, the unlimited plan (or the one priced by agreement). */
export function recommendPlan(plans: PublicPlan[], orders: number): PublicPlan | null {
  const coded = orderBasedPlans(plans);
  const sized = coded.filter((plan) => !plan.customPrice && plan.orderLimit !== null);
  const fit = sized.filter((plan) => orders <= (plan.orderLimit ?? 0)).sort((a, b) => (a.orderLimit ?? 0) - (b.orderLimit ?? 0))[0];
  return fit ?? coded.find((plan) => !plan.customPrice && plan.orderLimit === null) ?? coded.find((plan) => plan.customPrice) ?? null;
}

const ARABIC_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

/** "طلبات سبتمبر" for the month monthly orders are counted from (YYYY-MM-01); "طلبات آخر شهر" before any upload. */
export function ordersMonthLabel(month: string | null): string {
  const index = month ? Number(month.slice(5, 7)) - 1 : -1;
  return ARABIC_MONTHS[index] ? `طلبات ${ARABIC_MONTHS[index]}` : "طلبات آخر شهر";
}

export type PlanAddon = "compensation_ai";

/** Paid on top of a plan that does not include it. The one package: compensation center with the Telegram bot, Tadqeeq AI, and Tadqeeq in Claude and ChatGPT. */
export const PLAN_ADDONS: Array<{ key: PlanAddon; label: string; features: PlanFeature[]; price: number; months: number }> = [
  {
    key: "compensation_ai",
    label: "مركز التعويضات مع بوت Telegram، و Tadqeeq AI",
    features: ["compensation", "ai"],
    price: 399,
    months: 4,
  },
];

/** Tadqeeq in Claude and ChatGPT (the MCP) comes with Tadqeeq AI: in الشاملة, or with the add-on on any plan. */
export function planHasAssistant(features: readonly PlanFeature[]): boolean {
  return features.includes("ai");
}

/** The plan already includes everything the add-on unlocks (the unlimited plan includes the package). */
export function planIncludesAddon(features: readonly PlanFeature[], addon: PlanAddon): boolean {
  const unlocks = PLAN_ADDONS.find((item) => item.key === addon)?.features ?? [];
  return unlocks.length > 0 && unlocks.every((feature) => features.includes(feature));
}

export function isPlanAddon(value: unknown): value is PlanAddon {
  return PLAN_ADDONS.some((addon) => addon.key === value);
}

/** A subscription's features: the plan's plus those its add-ons unlock (null plan stays null = everything). */
export function featuresWithAddons(features: readonly PlanFeature[] | null, addons: readonly PlanAddon[]): PlanFeature[] | null {
  if (!features) return null;
  const all = new Set(features);
  for (const addon of PLAN_ADDONS) if (addons.includes(addon.key)) addon.features.forEach((feature) => all.add(feature));
  return [...all];
}

export type ComparisonCell = { kind: "yes" } | { kind: "no" } | { kind: "addon"; text: string } | { kind: "text"; text: string };
export interface ComparisonRow {
  label: string;
  cells: ComparisonCell[];
}

const count = (n: number) => n.toLocaleString("en-US");

/** A plan feature's cell: included, available as the paid add-on, or not available. */
function featureCell(plan: PublicPlan, feature: PlanFeature): ComparisonCell {
  if (plan.features.includes(feature)) return { kind: "yes" };
  const addon = PLAN_ADDONS.find((item) => item.features.includes(feature));
  return addon ? { kind: "addon", text: `إضافة · ${count(addon.price)} ر.س / ${addon.months} أشهر` } : { kind: "no" };
}

/**
 * The plan comparison shown on the pricing section (cards and table), built from the plans themselves so a
 * change in the ops console shows up here. Rows are in the order a restaurant reads them.
 */
export function planComparison(plans: PublicPlan[]): ComparisonRow[] {
  const all = (text: string): ComparisonCell[] => plans.map(() => ({ kind: "text", text }));
  const yes = (): ComparisonCell[] => plans.map(() => ({ kind: "yes" }));
  const largest = Math.max(0, ...plans.map((plan) => plan.orderLimit ?? 0));
  return [
    {
      label: "الطلبات المدققة شهرياً",
      cells: plans.map((plan) => ({
        kind: "text",
        text: plan.orderLimit !== null ? `حتى ${count(plan.orderLimit)}` : plan.customPrice ? `أكثر من ${count(largest)}` : "بلا حدود",
      })),
    },
    { label: "الفروع والمنصات والمستخدمون", cells: all("بلا حدود") },
    { label: "رفع ملفات هنقرستيشن وكيتا وجاهز", cells: all("بلا حدود") },
    { label: "اللوحة التنفيذية وتقارير الفروع والأيام", cells: yes() },
    { label: "مطابقة الفاتورة وخريطة الرسوم", cells: plans.map((plan) => featureCell(plan, "invoice_audit")) },
    { label: "عائد الإعلانات الحقيقي وتحليل العروض", cells: plans.map((plan) => featureCell(plan, "invoice_audit")) },
    { label: "مركز الاستثناءات", cells: plans.map((plan) => featureCell(plan, "exceptions")) },
    { label: "العقود وشروط المنصات", cells: plans.map((plan) => featureCell(plan, "contracts")) },
    { label: "المراقب الذكي والقراءة الذكية للملفات", cells: yes() },
    { label: "مركز التعويضات وبوت Telegram", cells: plans.map((plan) => featureCell(plan, "compensation")) },
    { label: "Tadqeeq AI للأسئلة عن أرقامك", cells: plans.map((plan) => featureCell(plan, "ai")) },
    {
      label: "التدقيق من داخل Claude و ChatGPT",
      cells: plans.map((plan) => featureCell(plan, "ai")),
    },
  ];
}

/**
 * What a plan card lists: the first plan's own items, then "everything in <previous>" plus what changes.
 * The order limit is left out because the card shows it above the price.
 */
export function planCardItems(plans: PublicPlan[], index: number): { basedOn: string | null; items: string[] } {
  const rows = planComparison(plans).slice(1);
  const describe = (row: ComparisonRow, cell: ComparisonCell) => (cell.kind === "text" ? `${row.label}: ${cell.text}` : row.label);
  const offered = (cell: ComparisonCell | undefined) => cell?.kind === "yes" || cell?.kind === "text";
  if (index === 0) {
    return { basedOn: null, items: rows.filter((row) => offered(row.cells[0])).map((row) => describe(row, row.cells[0]!)) };
  }
  const same = (a: ComparisonCell | undefined, b: ComparisonCell | undefined) => JSON.stringify(a) === JSON.stringify(b);
  return {
    basedOn: plans[index - 1]?.name ?? null,
    items: rows
      .filter((row) => offered(row.cells[index]) && !same(row.cells[index], row.cells[index - 1]))
      .map((row) => describe(row, row.cells[index]!)),
  };
}

/** Shown on every price: what the price excludes and how plans are paid and cancelled. */
export const PRICING_TERMS = [
  "الأسعار بالريال السعودي ولا تشمل ضريبة القيمة المضافة",
  "الاشتراك الشهري يُلغى في أي وقت، والسنوي التزام لمدة سنة",
  "الدفع بتحويل بنكي بعد إصدار الفاتورة",
];

/** Onboarding statuses that mean "signed up, not activated yet" — these workspaces run as a free trial. */
const TRIAL_STATUSES = new Set(["pending_details", "meeting_booked", "awaiting_payment", "onboarding"]);

/** A trial analyses one upload (one platform's files) with the invoice-analysis screens only. */
export const TRIAL_FEATURES: PlanFeature[] = ["invoice_audit"];
export const TRIAL_UPLOAD_LIMIT = 1;
/** Audit event written for every trial upload, so deleting the period does not reset the trial. */
export const TRIAL_UPLOAD_EVENT = "trial.upload";
/** Audit event for a plan the customer requested from the app (metadata: planId, cycle, addons). */
export const PLAN_REQUEST_EVENT = "plan.request";

const MINUTE = 60_000;
/** Each plan request notifies the team, so repeats are limited (docs/SECURITY_BUILD_SPEC.md, L2). */
export const PLAN_REQUEST_REPEAT_MS = 10 * MINUTE;
export const PLAN_REQUEST_HOURLY_LIMIT = 3;

export interface PlanRequestChoice {
  planId: string;
  cycle: "monthly" | "yearly";
  addons: string[];
}

export type PlanRequestThrottle =
  | { kind: "allow" }
  | { kind: "reuse"; requestedAt: string }
  | { kind: "blocked"; retryInMinutes: number };

/**
 * `recent` holds the workspace's plan requests from the last hour, newest first.
 * The same choice again within 10 minutes returns the earlier request; a different choice is allowed
 * (to fix a mistake) up to 3 requests an hour.
 */
export function planRequestThrottle(
  recent: (PlanRequestChoice & { requestedAt: string })[],
  next: PlanRequestChoice,
  now: Date,
): PlanRequestThrottle {
  const latest = recent[0];
  const sameChoice = (a: PlanRequestChoice) =>
    a.planId === next.planId && a.cycle === next.cycle && [...a.addons].sort().join() === [...next.addons].sort().join();
  if (latest && sameChoice(latest) && now.getTime() - Date.parse(latest.requestedAt) < PLAN_REQUEST_REPEAT_MS) {
    return { kind: "reuse", requestedAt: latest.requestedAt };
  }
  const inHour = recent.filter((r) => now.getTime() - Date.parse(r.requestedAt) < 60 * MINUTE);
  if (inHour.length >= PLAN_REQUEST_HOURLY_LIMIT) {
    const oldest = Date.parse(inHour[PLAN_REQUEST_HOURLY_LIMIT - 1]!.requestedAt);
    return { kind: "blocked", retryInMinutes: Math.max(1, Math.ceil((oldest + 60 * MINUTE - now.getTime()) / MINUTE)) };
  }
  return { kind: "allow" };
}
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
