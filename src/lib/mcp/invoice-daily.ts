import { ToolError, type ToolContext } from "@lovable.dev/mcp-js";

import { DEFAULT_TOLERANCE, EVIDENCE_CHIP, invoiceLedgerSummary, ledgerNeedsReview, ledgerVerdict } from "@/lib/invoice-ledger";
import { operationPlatformLabel } from "@/lib/operations/catalog";
import { buildOperationMonth, monthBounds, type OperationImportRow } from "@/lib/operations/month";
import { operationOverviewTotals } from "@/lib/operations/overview";
import type { OperationMonthOverview, OperationPlatform } from "@/lib/operations/types";
import type { StoredPeriod } from "@/lib/periods";

import { periodHeadline } from "./readout";
import { supabaseForUser } from "./supabase";

/**
 * مُطابِق (invoice check) and نبض (daily operations) for the MCP tools, from the same shared modules as the app's
 * pages. Nothing here computes fees; it only selects, labels and rounds.
 */

const round = (value: number | null | undefined) => (typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 + 0 : null);

/** The invoice ledger: each line recalculated vs invoiced, its verdict, and the headline claim difference. */
export function invoiceCheckReadout(period: StoredPeriod, flaggedOnly = false) {
  const ledger = invoiceLedgerSummary(period);
  const lines = (flaggedOnly ? ledger.checks.filter(ledgerNeedsReview) : ledger.checks).map((check) => {
    const verdict = ledgerVerdict(check);
    return {
      line: check.label,
      category: check.category,
      recalculated_sar: round(check.computed),
      invoiced_sar: check.invoiced === undefined ? null : round(check.invoiced),
      result: verdict.label,
      // Shown only above the rounding threshold, as on the page: invoice − recalculated.
      difference_sar: verdict.amount === undefined ? null : round(verdict.amount),
      basis: EVIDENCE_CHIP[check.evidence ?? "data"] ?? "إعادة احتساب من بيانات الطلبات",
      needs_review: ledgerNeedsReview(check),
    };
  });
  const diff = ledger.totalDiff;
  return {
    period: periodHeadline(period),
    official_invoice_uploaded: ledger.hasOfficialControl,
    keeta_excel_only: ledger.keetaExcelOnly,
    claim_difference_sar: round(diff),
    claim_direction:
      diff > DEFAULT_TOLERANCE ? "invoice above recalculation" : diff < -DEFAULT_TOLERANCE ? "invoice below recalculation" : "within tolerance",
    counts: {
      lines: ledger.checks.length,
      matched: ledger.matchedCount,
      needs_review: ledger.flaggedPresent,
      not_read_from_invoice: ledger.missingCount,
      invoice_only: ledger.invoiceOnlyCount,
    },
    rule: "difference = invoice − recalculated; differences of 10 SAR or less count as matched",
    lines,
  };
}

/** The month's uploads as the signed-in user can read them (row-level security: active workspace, financials.read). */
export async function loadOperationMonth(ctx: ToolContext, month: string): Promise<OperationMonthOverview> {
  let bounds: ReturnType<typeof monthBounds>;
  try {
    bounds = monthBounds(month);
  } catch {
    throw new ToolError("الشهر غير صالح؛ استخدم YYYY-MM. / Invalid month; use YYYY-MM.");
  }
  const { data, error } = await supabaseForUser(ctx)
    .from("operation_imports")
    .select("id,source_kind,platform,business_date,original_name,row_count,summary,created_at,superseded_at")
    .gte("business_date", bounds.start)
    .lte("business_date", bounds.end)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw new ToolError(error.message);
  return buildOperationMonth(month, (data ?? []) as unknown as OperationImportRow[]);
}

/** The month per platform: totals so far, forecast, incomplete or missing days and the top branches. */
export function dailyOperationsReadout(overview: OperationMonthOverview, options: { platform?: OperationPlatform; includeDays?: boolean } = {}) {
  const platforms = overview.platforms.filter((p) => !options.platform || p.platform === options.platform);
  const totals = operationOverviewTotals(overview.platforms);
  return {
    month: overview.month,
    days_in_month: overview.daysInMonth,
    all_platforms: options.platform
      ? undefined
      : {
          orders: totals.orderCount,
          gross_sales_sar: round(totals.grossSales),
          platform_charges_sar: round(totals.charges),
          settlement_sar: round(totals.settlement),
        },
    platforms: platforms.map((p) => ({
      platform: operationPlatformLabel(p.platform),
      days_uploaded: p.coveredDays,
      orders: p.orderCount,
      gross_sales_sar: round(p.grossSales),
      platform_charges_to_date_sar: round(p.chargesToDate),
      settlement_to_date_sar: round(p.settlementToDate),
      commission_sar: round(p.commissionAmount),
      payment_fees_sar: round(p.paymentFeeAmount),
      refunds: { count: p.refundCount, amount_sar: round(p.refundAmount) },
      cancellations: p.cancellationCount,
      complaints: p.complaintCount,
      forecast_month_charges_sar: round(p.forecastCharges),
      forecast_month_settlement_sar: round(p.forecastSettlement),
      missing_days: p.forecastMissingDays,
      incomplete_days: p.days.filter((d) => d.incomplete).map((d) => d.date),
      top_branches: p.branches.slice(0, 5).map((b) => ({
        branch: b.branchName ?? b.key,
        orders: b.orderCount,
        gross_sales_sar: round(b.grossSales),
        charges_sar: round(b.chargesTotal),
      })),
      ...(options.includeDays
        ? {
            days: p.days.map((d) => ({
              date: d.date,
              orders: d.orderCount,
              gross_sales_sar: round(d.grossSales),
              charges_sar: round(d.chargesTotal),
              settlement_sar: round(d.settlementAmount),
              incomplete: d.incomplete,
            })),
          }
        : {}),
    })),
  };
}
