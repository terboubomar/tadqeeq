/**
 * Tadqeeq's two platforms, picked after signing in: «ميزان», the invoice audit and performance center (the main
 * app), and «استرداد», the compensation center. Subscribed clients who can use both choose one; everyone else
 * goes straight to the one they can open.
 */
import { PRODUCTS } from "./products";
import type { WorkspacePermission } from "./workspace-access";

export type SuiteKey = "mizan" | "istirdad";

export interface Suite {
  key: SuiteKey;
  name: string;
  nameEn: string;
  descriptor: string;
  descriptorEn: string;
  /** Where the platform opens. */
  path: "/dashboard" | "/compensation";
  /** What is inside, in a few words each, for the picker. */
  highlights: string[];
}

export const SUITES: Record<SuiteKey, Suite> = {
  mizan: {
    key: "mizan",
    name: "ميزان",
    nameEn: "Mizan",
    descriptor: "مركز تدقيق الفواتير والأداء",
    descriptorEn: "Invoice audit & performance center",
    path: "/dashboard",
    highlights: ["مطابقة فواتير المنصات وكشف الفروقات", "المتابعة اليومية والتقارير", "العروض والإعلانات والاستثناءات"],
  },
  istirdad: {
    key: "istirdad",
    name: PRODUCTS.istirdad.name,
    nameEn: PRODUCTS.istirdad.nameEn,
    descriptor: PRODUCTS.istirdad.descriptor,
    descriptorEn: PRODUCTS.istirdad.descriptorEn,
    path: "/compensation",
    highlights: ["حالات التعويض والمبالغ المستردة", "الأدلة وبناء ملف الاعتراض", "ربط الفروع عبر Telegram"],
  },
};

export const SUITE_ORDER: SuiteKey[] = ["mizan", "istirdad"];

/** Permissions that open «ميزان»: any of its reports or audit screens. */
const MIZAN_PERMISSIONS: WorkspacePermission[] = ["reports.read", "financials.read", "periods.read"];

export interface SuiteAccessInput {
  onboardingStatus: string;
  trial: boolean;
  isPlatformAdmin: boolean;
  can: (permission: WorkspacePermission) => boolean;
}

/** Which platforms this person can open, and whether they are a subscribed client (the picker is for them). */
export function suiteAccess(input: SuiteAccessInput): { mizan: boolean; istirdad: boolean; subscribed: boolean } {
  return {
    mizan: MIZAN_PERMISSIONS.some((permission) => input.can(permission)),
    istirdad: input.can("compensation.read"),
    subscribed: input.isPlatformAdmin || (input.onboardingStatus === "active" && !input.trial),
  };
}

/** Where to go after signing in: a platform's path, or null to show the picker (subscribed, both open). */
export function startDestination(access: ReturnType<typeof suiteAccess>): Suite["path"] | null {
  if (access.subscribed && access.mizan && access.istirdad) return null;
  if (!access.mizan && access.istirdad) return SUITES.istirdad.path;
  return SUITES.mizan.path;
}
