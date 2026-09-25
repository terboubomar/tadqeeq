export type OnboardingStatus =
  | "pending_details"
  | "meeting_booked"
  | "awaiting_payment"
  | "onboarding"
  | "active"
  | "suspended";

export const ONBOARDING_STATUS_LABELS: Record<OnboardingStatus, string> = {
  pending_details: "بانتظار بيانات الشركة",
  meeting_booked: "تم حجز الاجتماع",
  awaiting_payment: "بانتظار التحويل",
  onboarding: "جاري التهيئة",
  active: "مفعّل",
  suspended: "موقوف",
};

export const ONBOARDING_STEPS: OnboardingStatus[] = [
  "pending_details",
  "meeting_booked",
  "awaiting_payment",
  "onboarding",
  "active",
];

export interface OnboardingRecord {
  workspaceId: string;
  workspaceName: string;
  status: OnboardingStatus;
  legalName: string | null;
  brandName: string | null;
  crNumber: string | null;
  vatNumber: string | null;
  contactName: string | null;
  contactMobile: string | null;
  contactNationalId: string | null;
  contactEmail: string | null;
  branchCount: number | null;
  logoUrl: string | null;
  meetingAt: string | null;
  meetingNote: string | null;
  adminNote: string | null;
  submittedAt: string | null;
  paidAt: string | null;
  activatedAt: string | null;
  createdAt: string;
}

const toAsciiDigits = (value: string) =>
  value.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[\s-]/g, "");

export function normalizeDigits(value: string): string {
  return toAsciiDigits(value.trim());
}

export function isValidCr(value: string): boolean {
  return /^[1-7]\d{9}$/.test(normalizeDigits(value));
}

export function isValidVat(value: string): boolean {
  return /^3\d{13}3$/.test(normalizeDigits(value));
}

export function normalizeSaudiMobile(value: string): string | null {
  let v = normalizeDigits(value).replace(/^\+/, "");
  if (v.startsWith("00966")) v = v.slice(5);
  else if (v.startsWith("966")) v = v.slice(3);
  else if (v.startsWith("0")) v = v.slice(1);
  return /^5\d{8}$/.test(v) ? `+966${v}` : null;
}

export function isValidNationalId(value: string): boolean {
  return /^[12]\d{9}$/.test(normalizeDigits(value));
}

/** Sun–Thu, 10:00–17:00 Riyadh time (UTC+3). */
export function isValidMeetingSlot(iso: string): boolean {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return false;
  if (date.getTime() < Date.now() + 60 * 60 * 1000) return false;
  const riyadh = new Date(date.getTime() + 3 * 60 * 60 * 1000);
  const day = riyadh.getUTCDay();
  const hour = riyadh.getUTCHours();
  return day >= 0 && day <= 4 && hour >= 10 && hour < 17;
}

export const MEETING_HOURS = [10, 11, 12, 13, 14, 15, 16];
