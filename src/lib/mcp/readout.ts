import { buildPeriodSummaryAiPacket } from "@/lib/ai/period-summary-ai";
import { buildPeriodExceptions, isOpenException } from "@/lib/exceptions";
import { requiredEvidence } from "@/lib/exception-recovery";
import { ALLOCATION_RULE_EN, invoiceOnlyAllocation } from "@/lib/invoice-only-allocation";
import type { StoredPeriod } from "@/lib/periods";
import {
  displayBranchName,
  PLATFORM_COST_DEFINITION,
  PLATFORM_COST_FORMULA,
  advertisingExVat,
  branchPlatformCharges,
  periodPlatformCharges,
  periodPlatformChargesExclAds,
  platformCostPct,
  vatBreakdown,
} from "@/lib/reporting-metrics";

/**
 * What the MCP tools return about a period: the engine's numbers, shaped so an AI assistant can explain
 * them without reading the raw stored record. Nothing here computes money; it only selects and rounds.
 */

const PLATFORM_NAMES: Record<StoredPeriod["platform"], string> = {
  hungerstation: "HungerStation (هنقرستيشن)",
  keeta: "Keeta (كيتا)",
  jahez: "Jahez (جاهز)",
};

const round = (value: number | undefined | null) => (typeof value === "number" && Number.isFinite(value) ? Math.round(value * 100) / 100 : null);
/** Ratios keep four decimals (0.2397), money keeps two. */
const ratio = (value: number | undefined | null) => (typeof value === "number" && Number.isFinite(value) ? Math.round(value * 10000) / 10000 : null);

/** One line per period for lists: dates and the headline numbers. */
export function periodHeadline(
  period: Pick<StoredPeriod, "id" | "label" | "platform" | "period_start" | "period_end" | "created_at"> & {
    summary?: Partial<StoredPeriod["summary"]> | null;
    invoice?: Partial<Pick<StoredPeriod["invoice"], "cpc" | "cpcBranches">> | null;
  },
) {
  const s = period.summary ?? {};
  return {
    id: period.id,
    label: period.label,
    platform: period.platform,
    platform_name: PLATFORM_NAMES[period.platform],
    period_start: period.period_start,
    period_end: period.period_end,
    uploaded_at: period.created_at,
    orders: round(s.orders),
    gross_sales_sar: round(s.grossSales),
    commission_sar: round(s.commission),
    commission_pct: round(s.commissionPct),
    total_platform_charges_sar: round(periodPlatformCharges(period)),
    platform_cost_pct: ratio(platformCostPct(periodPlatformCharges(period), s.grossSales)),
    advertising_ex_vat_sar: round(advertisingExVat(period)),
    platform_cost_pct_excl_ads: ratio(platformCostPct(periodPlatformChargesExclAds(period), s.grossSales)),
    platform_cost_pct_formula: PLATFORM_COST_FORMULA,
    platform_cost_pct_definition: PLATFORM_COST_DEFINITION,
    ...(period.platform === "keeta" ? { platform_cost_pct_of_net: ratio(s.keetaPlatformCostPct) } : {}),
    branches: round(s.branchCount),
  };
}

/** Charges excluding VAT, the VAT and the total including it, labelled by where they come from. */
function chargesVat(period: StoredPeriod) {
  const breakdown = vatBreakdown(period);
  if (!breakdown) return null;
  return {
    total_charges_ex_vat_sar: round(breakdown.totalChargesExVat),
    vat_15_pct_sar: round(breakdown.vat15Pct),
    total_charges_inc_vat_sar: round(breakdown.totalChargesIncVat),
    source: breakdown.source,
  };
}

/** The invoice comparison: what Tadqeeq recalculated against what the platform invoiced, line by line. */
function invoiceChecks(period: StoredPeriod) {
  return (period.invoice?.checks ?? [])
    .filter((check) => !check.controlOnly)
    .map((check) => {
      const difference = check.invoiced === undefined ? null : round(check.computed - check.invoiced);
      return {
        line: check.label,
        recalculated_sar: round(check.computed),
        invoiced_sar: round(check.invoiced),
        difference_sar: difference,
        within_tolerance: difference === null ? null : Math.abs(difference) <= (check.tolerance ?? 1),
        ...(check.invoiceOnly ? { invoice_only: true } : {}),
      };
    });
}

/** Every row of the invoice's Invoice Details summary with what was counted, the rate and the amount. */
function invoiceLines(period: StoredPeriod) {
  return (period.invoice?.lineDetails ?? []).map((row) => ({
    key: row.key,
    line: row.label,
    quantity: row.quantity,
    unit: row.unit,
    avg_rate: row.avgRate,
    rate_kind: row.rateKind,
    amount_sar: round(row.amount),
  }));
}

/** Invoice-only charges the invoice prints only in its consolidated summary: on no branch. */
export function unallocatedCharges(period: StoredPeriod) {
  return (period.invoice?.unallocatedCharges ?? []).map((item) => ({
    line: item.label,
    amount_sar: round(item.amount),
    allocation: "unallocated" as const,
    allocation_rule: ALLOCATION_RULE_EN.platform_level,
  }));
}

/** Branch invoice-only charges plus platform-level ones reconcile to the invoice-only total, with any residual. */
function allocationSummary(period: StoredPeriod) {
  const allocation = invoiceOnlyAllocation(period);
  if (!allocation.rows.length) return null;
  return {
    allocated_to_branches_sar: allocation.allocated,
    unallocated_sar: allocation.unallocated,
    total_sar: allocation.total,
    invoice_only_total_sar: allocation.invoiceTotal,
    residual_sar: allocation.residual,
    rules: ALLOCATION_RULE_EN,
  };
}

/** The statement of account as printed; the advertising invoice is verified against the CPC invoice when one was uploaded. */
function statementOfAccount(period: StoredPeriod) {
  const soa = period.invoice?.statementOfAccount;
  if (!soa) return null;
  const advertising = soa.advertisingServicesInvoice;
  const cpc = period.invoice?.cpc;
  const verified = typeof advertising === "number" && typeof cpc === "number" && Math.abs(advertising - cpc) < 0.01;
  return {
    opening_balance: round(soa.openingBalance),
    commission_invoice: round(soa.commissionInvoice),
    advertising_services_invoice: round(advertising),
    advertising_status: advertising === undefined ? null : verified ? ("verified" as const) : ("not_verified" as const),
    ...(verified ? { advertising_verified_against: "CPC invoice (incl. VAT)" } : {}),
    loan_installment_invoice: round(soa.loanInstallmentInvoice),
    net_monthly_due_balance: round(soa.netMonthlyDueBalance),
    note: "Separate from the commission invoice. The advertising invoice, without its VAT, is counted in platform charges and platform cost %.",
  };
}

/** Customer compensation: what the invoice bills against what Tadqeeq recalculated from the order data. */
function compensationComparison(period: StoredPeriod) {
  const invoiced = period.invoice?.lineDetails?.find((row) => row.key === "customer_compensation")?.amount;
  const recalculated = period.platform === "hungerstation" ? period.summary?.compensation : undefined;
  if (typeof invoiced !== "number" || typeof recalculated !== "number") return null;
  const difference = Math.round((recalculated - invoiced) * 100) / 100;
  return {
    invoiced: round(invoiced),
    recalculated: round(recalculated),
    recalculated_source: "Compensated Orders sheet (incl. VAT) per branch ÷ 1.15, each branch rounded to halalas before adding, as the invoice does",
    tolerance_rule: "Within tolerance when |recalculated − invoiced| < 0.01 SAR",
    difference,
    // Strictly under one halala, on the unrounded figures (0.0139 is a real difference, not rounding).
    within_tolerance: Math.abs(recalculated - invoiced) < 0.01,
  };
}

/** Things the person should still check that are not audit differences: unverified invoices. */
function openItems(period: StoredPeriod) {
  const soa = statementOfAccount(period);
  return soa?.advertising_status === "not_verified"
    ? [{ what: "Advertising services invoice (statement of account)", amount_sar: soa.advertising_services_invoice, status: "not_verified", hint: "Upload the CPC invoice for this period to verify it." }]
    : [];
}

/** Full readout of one period: headline numbers, invoice comparison, open differences and costliest branches. */
export function periodReadout(period: StoredPeriod, appUrl: string) {
  const packet = buildPeriodSummaryAiPacket(period);
  return {
    period: periodHeadline(period),
    open_in_tadqeeq: `${appUrl}/history`,
    invoice_check: invoiceChecks(period),
    invoice_lines: invoiceLines(period),
    unallocated_charges: unallocatedCharges(period),
    invoice_only_allocation: allocationSummary(period),
    statement_of_account: statementOfAccount(period),
    compensation: compensationComparison(period),
    charges_vat: chargesVat(period),
    differences: {
      open_count: packet.exceptions.openCount,
      critical_count: packet.exceptions.criticalCount,
      amount_to_review_sar: round(packet.exceptions.underReview),
      potential_recovery_sar: round(packet.exceptions.potentialRecovery),
      claimable_sar: round(packet.exceptions.claimable),
      already_recovered_sar: round(packet.exceptions.recovered),
      by_category: packet.categoryExposure.map((c) => ({
        category: c.category,
        count: c.count,
        amount_to_review_sar: round(c.reviewAmount),
        potential_recovery_sar: round(c.potentialRecovery),
      })),
      top: packet.topExceptions.map((e) => ({
        what: e.label,
        category: e.category,
        ...(e.branch ? { branch: e.branch } : {}),
        severity: e.severity,
        difference_sar: round(e.difference),
        potential_recovery_sar: round(e.potentialRecovery),
      })),
    },
    costliest_branches: packet.topBranches.map((b) => ({
      branch: b.branch,
      display_name: displayBranchName(b.branch),
      orders: b.orders,
      gross_sales_sar: round(b.grossSales),
      platform_cost_sar: round(b.platformCost),
      commission_pct: round(b.commissionPct),
    })),
    platform_details: Object.fromEntries(Object.entries(packet.platformMetrics).map(([key, value]) => [key, round(value)])),
    open_items: openItems(period),
    note: "All numbers come from Tadqeeq's accounting engine (SAR). Explain them; do not recalculate or change them.",
  };
}

/** Every branch in a period, largest platform cost first. */
export function branchPerformance(period: StoredPeriod) {
  const itemsByInvoiceName = new Map(
    (period.invoice?.branches ?? []).map((branch) => [branch.branch ?? "", branch.invoiceOnlyItems ?? []]),
  );
  return (period.branches ?? [])
    .map((b) => {
      const cost = branchPlatformCharges(period, b);
      return {
        branch: b.branch,
        display_name: displayBranchName(b.branch),
        orders: b.orders,
        gross_sales_sar: round(b.grossSales),
        net_sales_sar: round(b.netSales),
        commission_sar: round(b.commission),
        commission_pct: round(b.commissionPct),
        platform_cost_sar: round(cost),
        platform_cost_pct: ratio(platformCostPct(cost, b.grossSales)),
        ...(period.platform === "keeta" ? { platform_cost_pct_of_net: ratio(b.keetaPlatformCostPct) } : {}),
        compensation_sar: round(b.compensation),
        invoice_only_charges: (b.invoiceBranchName ? (itemsByInvoiceName.get(b.invoiceBranchName) ?? []) : []).map((item) => ({
          line: item.label,
          amount_sar: round(item.amount),
          allocation_rule: ALLOCATION_RULE_EN.direct,
        })),
      };
    })
    .sort((left, right) => (right.platform_cost_sar ?? 0) - (left.platform_cost_sar ?? 0));
}

/** Differences found in a period, open ones first and largest first; closed ones only when asked. */
export function exceptionList(period: StoredPeriod, includeClosed: boolean) {
  return buildPeriodExceptions(period)
    .filter((e) => includeClosed || isOpenException(e))
    .sort((left, right) => right.reviewAmount - left.reviewAmount)
    .map((e) => ({
      what: e.label,
      category: e.categoryLabel,
      ...(e.branch ? { branch: e.branch } : {}),
      severity: e.severity,
      status: e.status,
      recalculated_sar: round(e.computed),
      invoiced_sar: round(e.invoiced),
      difference_sar: round(e.difference),
      amount_to_review_sar: round(e.reviewAmount),
      potential_recovery_sar: round(e.potentialRecovery),
      claimable_sar: round(e.claimableAmount),
      recovered_sar: round(e.recoveredAmount),
      required_evidence: requiredEvidence(e).document,
      ...(e.owner ? { owner: e.owner } : {}),
      ...(e.classification ? { classification: e.classification } : {}),
      ...(e.attachments.length ? { attached_documents: e.attachments.map((a) => a.name) } : {}),
      ...(e.lines?.length
        ? {
            items: e.lines.map((line) => {
              const decision = e.items.find((entry) => entry.line === line.label);
              return {
                line: line.label,
                amount_sar: round(line.amount),
                status: decision?.status ?? "pending",
                document_ref: decision?.documentRef ?? null,
              };
            }),
          }
        : {}),
      ...(e.hint ? { hint: e.hint } : {}),
    }));
}
