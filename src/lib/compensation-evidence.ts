export type CompensationPlatform = "hungerstation" | "keeta" | "jahez";

export interface CompensationDisputeDraftInput {
  platform: CompensationPlatform;
  orderNumber: string;
  branchName?: string | null;
  compensationAmount: number;
  compensationReason: string;
  employeeExplanation: string;
  evidenceCapturedAt?: string | null;
  evidenceSenderName?: string | null;
}

const PLATFORM_LABELS: Record<CompensationPlatform, { ar: string; en: string }> = {
  hungerstation: { ar: "هنقرستيشن", en: "HungerStation" },
  keeta: { ar: "كيتا", en: "Keeta" },
  jahez: { ar: "جاهز", en: "Jahez" },
};

export function normalizeOrderLookupKey(value: string): string {
  return value.trim().replace(/^#\s*/, "").replace(/\s+/g, "").toUpperCase();
}

export function extractOrderNumber(value: string | null | undefined): string | null {
  if (!value) return null;
  const firstLine = value.trim().split(/\r?\n/, 1)[0]?.trim() ?? "";
  if (!firstLine) return null;

  const labeled = firstLine.match(
    /^(?:#?\s*)?(?:order\s*(?:id|no\.?|number)|order(?=\s*[:#-])|رقم\s*الطلب)\s*[:#-]?\s*([^\s]+)\s*$/iu,
  );
  const bare = /^#?[^\s]+$/u.test(firstLine)
    ? firstLine.replace(/^#/, "")
    : null;
  const candidate = labeled?.[1] ?? bare ?? "";

  if (candidate.length < 3 || candidate.length > 120) return null;
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._/-]*$/u.test(candidate)) return null;
  return candidate;
}

export function telegramMessageUrl(
  chatId: number | string,
  messageId: number,
): string | null {
  const raw = String(chatId);
  if (!raw.startsWith("-100") || !Number.isInteger(messageId) || messageId <= 0) {
    return null;
  }
  return `https://t.me/c/${raw.slice(4)}/${messageId}`;
}

function formatAmount(value: number): string {
  if (!Number.isFinite(value) || value < 0) return "0.00";
  return (Math.round(value * 100) / 100).toFixed(2);
}

function formatEvidenceTime(value: string | null | undefined, locale: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Riyadh",
  }).format(date);
}

export function buildCompensationDisputeDraft(
  input: CompensationDisputeDraftInput,
): { ar: string; en: string } {
  const platform = PLATFORM_LABELS[input.platform];
  const amount = formatAmount(input.compensationAmount);
  const branch = input.branchName?.trim() || null;
  const reason = input.compensationReason.trim();
  const explanation = input.employeeExplanation.trim();
  const evidenceAr = formatEvidenceTime(input.evidenceCapturedAt, "ar-SA-u-ca-gregory-nu-latn");
  const evidenceEn = formatEvidenceTime(input.evidenceCapturedAt, "en-GB");
  const sender = input.evidenceSenderName?.trim() || null;

  const arLines = [
    `إلى فريق ${platform.ar}،`,
    "",
    `نطلب مراجعة التعويض المرتبط بالطلب رقم ${input.orderNumber} بقيمة ${amount} ر.س.`,
    ...(branch ? [`الفرع: ${branch}.`] : []),
    `سبب التعويض المسجل: ${reason}.`,
    `إفادة الفرع: ${explanation}`,
    ...(evidenceAr
      ? [
          `يتوفر دليل (فيديو أو صورة) من الفرع تم تسجيله في ${evidenceAr}${sender ? ` بواسطة ${sender}` : ""}، ويمكن تقديمه للتحقق من حالة الطلب.`,
        ]
      : []),
    "",
    "نرجو مراجعة الحالة بالاعتماد على بيانات الطلب والدليل المرفق، وإعادة مبلغ التعويض إذا أكدت المراجعة أن الخصم غير مستحق.",
    "",
    "شكراً لكم.",
  ];

  const enLines = [
    `Dear ${platform.en} Support,`,
    "",
    `We request a review of the compensation applied to order ${input.orderNumber} for SAR ${amount}.`,
    ...(branch ? [`Branch: ${branch}.`] : []),
    `Recorded compensation reason: ${reason}.`,
    `Branch statement: ${explanation}`,
    ...(evidenceEn
      ? [
          `Branch video evidence is available, captured on ${evidenceEn}${sender ? ` by ${sender}` : ""}, and can be provided for verification.`,
        ]
      : []),
    "",
    "Please review the case against the order data and attached evidence, and reverse the compensation if your review confirms that the deduction was not due.",
    "",
    "Thank you.",
  ];

  return {
    ar: arLines.join("\n"),
    en: enLines.join("\n"),
  };
}
