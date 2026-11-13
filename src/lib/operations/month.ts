import { isIncompleteDay } from "./completeness";
import { forecastFromCompleteMonthToDate } from "./forecast";
import type {
  OperationBranchSummary,
  OperationDay,
  OperationImportHistoryItem,
  OperationImportSummary,
  OperationMonthOverview,
  OperationPlatform,
  OperationPlatformMonth,
  OperationSourceKind,
} from "./types";

/**
 * One month of daily operations (نبض) from its uploads: totals per platform, days, branches and the forecast.
 * Shared by the operations page's server function and the MCP. Adds up the stored daily summaries; recalculates
 * nothing from the orders.
 */

export interface OperationImportRow {
  id: string;
  source_kind: OperationSourceKind;
  platform: OperationPlatform;
  business_date: string;
  original_name: string;
  row_count: number;
  summary: OperationImportSummary;
  created_at: string;
  superseded_at: string | null;
}

const rounded = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function monthBounds(month: string): { start: string; end: string; days: number } {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("الشهر غير صالح.");
  const [year, monthNumber] = month.split("-").map(Number);
  if (!year || !monthNumber || monthNumber < 1 || monthNumber > 12)
    throw new Error("الشهر غير صالح.");
  const days = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(days).padStart(2, "0")}`, days };
}

export const zeroPlatform = (platform: OperationPlatform): OperationPlatformMonth => ({
  platform,
  coveredDays: 0,
  orderCount: 0,
  grossSales: 0,
  deliveryAmount: 0,
  complaintCount: 0,
  refundCount: 0,
  refundAmount: 0,
  discountAmount: 0,
  merchantFundedDiscountAmount: 0,
  merchantFundedVoucherAmount: 0,
  commissionAmount: 0,
  paymentFeeAmount: 0,
  estimatedEarningsAmount: 0,
  cancellationCount: 0,
  cancelledEarningsAmount: 0,
  chargesToDate: 0,
  settlementToDate: 0,
  forecastCharges: null,
  forecastSettlement: null,
  forecastMissingDays: [],
  days: [],
  branches: [],
  branchesComplete: true,
});

/** Adds one upload's branch totals into the month's, keyed like the uploads. */
export function addBranches(target: Map<string, OperationBranchSummary>, branches: OperationBranchSummary[]) {
  for (const branch of branches) {
    const current = target.get(branch.key);
    if (!current) {
      target.set(branch.key, { ...branch });
      continue;
    }
    current.branchName ??= branch.branchName;
    for (const key of [
      "orderCount",
      "grossSales",
      "chargesTotal",
      "commissionAmount",
      "settlementAmount",
      "cancellationCount",
      "complaintCount",
      "refundCount",
    ] as const) {
      current[key] += branch[key];
    }
  }
}


/** The month's overview from its uploads, newest upload first (as the operations query returns them). */
export function buildOperationMonth(month: string, imports: OperationImportRow[]): OperationMonthOverview {
  const bounds = monthBounds(month);
  // Only the upload that owns a source/day's rows counts (migration 0056). Superseded uploads stay in the history,
  // and a day whose current upload was deleted counts nothing rather than an older summary without rows.
  const latest = new Map<string, OperationImportRow>();
  for (const item of imports) {
    if (item.superseded_at) continue;
    const key = `${item.source_kind}:${item.business_date}`;
    if (!latest.has(key)) latest.set(key, item);
  }
  const platforms = new Map<OperationPlatform, OperationPlatformMonth>([
    ["hungerstation", zeroPlatform("hungerstation")],
    ["keeta", zeroPlatform("keeta")],
    ["jahez", zeroPlatform("jahez")],
  ]);
  const monthBranches = new Map<OperationPlatform, Map<string, OperationBranchSummary>>([
    ["hungerstation", new Map()],
    ["keeta", new Map()],
    ["jahez", new Map()],
  ]);
  const days = new Map<OperationPlatform, Map<string, OperationDay>>([
    ["hungerstation", new Map()],
    ["keeta", new Map()],
    ["jahez", new Map()],
  ]);
  const covered = new Map<OperationPlatform, Set<string>>([
    ["hungerstation", new Set()],
    ["keeta", new Set()],
    ["jahez", new Set()],
  ]);
  for (const item of latest.values()) {
    const target = platforms.get(item.platform)!;
    const summary = item.summary;
    if (item.source_kind !== "jahez_adjustments") {
      covered.get(item.platform)!.add(item.business_date);
      target.orderCount += summary.orderCount;
      target.grossSales += summary.grossSales;
      target.deliveryAmount += summary.deliveryAmount;
      target.complaintCount += summary.complaintCount;
      target.refundCount += summary.refundCount;
      target.refundAmount += summary.refundAmount;
      target.discountAmount += summary.discountAmount ?? 0;
      target.merchantFundedDiscountAmount += summary.merchantFundedDiscountAmount ?? 0;
      target.merchantFundedVoucherAmount += summary.merchantFundedVoucherAmount ?? 0;
      target.commissionAmount += summary.commissionAmount ?? 0;
      target.paymentFeeAmount += summary.paymentFeeAmount ?? 0;
      target.estimatedEarningsAmount += summary.estimatedEarningsAmount ?? 0;
      target.cancellationCount += summary.cancellationCount;
      target.cancelledEarningsAmount += summary.cancelledEarningsAmount ?? 0;
      target.chargesToDate += summary.chargesTotal;
      target.settlementToDate += summary.settlementAmount;
      days.get(item.platform)!.set(item.business_date, {
        date: item.business_date,
        incomplete: isIncompleteDay(summary),
        unsettledOrderCount: summary.unsettledOrderCount ?? 0,
        orderCount: summary.orderCount,
        grossSales: summary.grossSales,
        chargesTotal: Math.abs(summary.chargesTotal),
        settlementAmount: summary.settlementAmount,
      });
      if (summary.branches) addBranches(monthBranches.get(item.platform)!, summary.branches);
      else if (summary.orderCount > 0) target.branchesComplete = false;
    } else {
      target.refundCount += summary.matchedAdjustments + summary.unmatchedAdjustments;
      target.refundAmount += summary.adjustmentDebit;
      target.chargesToDate += summary.adjustmentDebit - summary.adjustmentCredit;
      target.settlementToDate += summary.adjustmentCredit - summary.adjustmentDebit;
    }
  }
  for (const target of platforms.values()) {
    target.coveredDays = covered.get(target.platform)!.size;
    for (const key of [
      "grossSales",
      "deliveryAmount",
      "refundAmount",
      "discountAmount",
      "merchantFundedDiscountAmount",
      "merchantFundedVoucherAmount",
      "commissionAmount",
      "paymentFeeAmount",
      "estimatedEarningsAmount",
      "cancelledEarningsAmount",
      "chargesToDate",
      "settlementToDate",
    ] as const)
      target[key] = rounded(target[key]);
    const forecast = forecastFromCompleteMonthToDate({
      businessDates: covered.get(target.platform)!,
      daysInMonth: bounds.days,
      chargesToDate: target.chargesToDate,
      settlementToDate: target.settlementToDate,
    });
    target.forecastCharges = forecast.charges;
    target.forecastSettlement = forecast.settlement;
    target.forecastMissingDays = forecast.missingDays;
    target.days = [...days.get(target.platform)!.values()].sort((a, b) => a.date.localeCompare(b.date));
    target.branches = [...monthBranches.get(target.platform)!.values()]
      .map((branch) => ({
        ...branch,
        grossSales: rounded(branch.grossSales),
        chargesTotal: rounded(branch.chargesTotal),
        commissionAmount: rounded(branch.commissionAmount),
        settlementAmount: rounded(branch.settlementAmount),
      }))
      .sort((a, b) => b.grossSales - a.grossSales);
  }
  const history: OperationImportHistoryItem[] = imports.map((item) => ({
    id: item.id,
    sourceKind: item.source_kind,
    platform: item.platform,
    businessDate: item.business_date,
    originalName: item.original_name,
    rowCount: item.row_count,
    summary: item.summary,
    createdAt: item.created_at,
    current: !item.superseded_at,
  }));
  return { month, daysInMonth: bounds.days, platforms: [...platforms.values()], imports: history };
}
