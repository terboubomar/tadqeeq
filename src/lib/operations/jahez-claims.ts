import type { OperationAdjustment } from "./types";

/**
 * Jahez has no appeal form, so its deductions are tracked as cases in «استرداد». Each order with deductions
 * (debit lines) in a day's adjustments file becomes one claim; credits are money Jahez paid and are left out.
 * This only groups the file's own lines; it computes nothing new.
 */

export interface JahezClaim {
  orderId: string;
  businessDate: string;
  branchName: string | null;
  /** The order's debit lines added up, SAR. */
  amount: number;
  reasons: string[];
  comments: string[];
}

const REASON_AR: Record<string, string> = {
  "missing item(s)": "نقص أصناف",
  adjustment: "تعديل من جاهز",
};

export function jahezClaimsFromAdjustments(adjustments: readonly OperationAdjustment[]): JahezClaim[] {
  const byOrder = new Map<string, JahezClaim>();
  for (const line of adjustments) {
    if (line.transactionType !== "debit" || !(line.amount > 0)) continue;
    const orderId = line.orderId.trim();
    if (!orderId) continue;
    const claim = byOrder.get(orderId) ?? {
      orderId,
      businessDate: line.businessDate,
      branchName: line.branchName,
      amount: 0,
      reasons: [],
      comments: [],
    };
    claim.amount = Math.round((claim.amount + line.amount) * 100) / 100;
    claim.branchName ??= line.branchName;
    const reason = line.reason?.trim();
    if (reason && !claim.reasons.includes(reason)) claim.reasons.push(reason);
    const comment = line.comment?.trim();
    if (comment && !claim.comments.includes(comment)) claim.comments.push(comment);
    byOrder.set(orderId, claim);
  }
  return [...byOrder.values()];
}

/** The case's reason and explanation, in Arabic, from the file's own words. */
export function jahezClaimText(claim: JahezClaim): { reason: string; explanation: string } {
  const reasons = claim.reasons.length ? claim.reasons : ["Adjustment"];
  const reason = reasons.map((r) => `${REASON_AR[r.toLowerCase()] ?? r} (${r})`).join("، ");
  const note = claim.comments.length ? ` ملاحظة جاهز: ${claim.comments.join(" / ")}.` : "";
  return {
    reason: `خصم من جاهز: ${reason}`,
    explanation:
      `خصمت جاهز ${claim.amount.toFixed(2)} ر.س من هذا الطلب في ملف التعديلات ليوم ${claim.businessDate}.${note} ` +
      "أُنشئت الحالة تلقائياً من الملف اليومي؛ أكمل شرح الفرع قبل المطالبة.",
  };
}
