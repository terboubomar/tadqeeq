import { describe, expect, test } from "bun:test";

import type { StoredPeriod } from "@/lib/periods";

import { branchPerformance, exceptionList, periodHeadline, periodReadout } from "./readout";

const period = {
  id: "11111111-1111-4111-8111-111111111111",
  label: "أغسطس",
  platform: "jahez",
  period_start: "2026-08-01",
  period_end: "2026-08-31",
  created_at: "2026-09-01T00:00:00Z",
  summary: { orders: 100, branchCount: 2, grossSales: 10000.456, netSales: 7600, commission: 1800, commissionPct: 18, totalCharges: 2400 },
  branches: [
    { branch: "فرع العليا", branchId: "a", orders: 40, grossSales: 4000, netSales: 3100, commission: 720, commissionPct: 18, totalCharges: 900 },
    { branch: "فرع النرجس", branchId: "b", orders: 60, grossSales: 6000, netSales: 4500, commission: 1080, commissionPct: 18, totalCharges: 1500 },
  ],
  daily: [],
  invoice: {
    checks: [
      { code: "COMMISSION", category: "commission", label: "العمولة", computed: 1800, invoiced: 1850, tolerance: 1, evidence: "data" },
      { code: "ROLLUP", category: "settlement", label: "ضابط إجمالي", computed: 5, invoiced: 0, controlOnly: true },
    ],
    exceptionWorkflow: { hidden: { status: "reviewing", note: "Private internal note" } },
  },
} as unknown as StoredPeriod;

describe("MCP readouts", () => {
  test("headline rounds money to halalas and names the platform", () => {
    expect(periodHeadline(period)).toMatchObject({ platform_name: "Jahez (جاهز)", orders: 100, gross_sales_sar: 10000.46, commission_pct: 18, branches: 2 });
  });

  test("the invoice comparison skips roll-up controls and shows each line's difference", () => {
    const readout = periodReadout(period, "https://tadqeeq.app");
    expect(readout.invoice_check).toEqual([
      { line: "العمولة", recalculated_sar: 1800, invoiced_sar: 1850, difference_sar: -50, within_tolerance: false },
    ]);
    expect(readout.differences.open_count).toBeGreaterThan(0);
    expect(readout.costliest_branches[0]?.branch).toBe("فرع النرجس");
    // Workflow notes stay inside Tadqeeq.
    expect(JSON.stringify(readout)).not.toContain("Private internal note");
  });

  test("branches are ordered by platform cost", () => {
    expect(branchPerformance(period).map((b) => [b.branch, b.platform_cost_sar])).toEqual([
      ["فرع النرجس", 1500],
      ["فرع العليا", 900],
    ]);
  });

  test("differences list open items largest first", () => {
    const list = exceptionList(period, false);
    expect(list.length).toBeGreaterThan(0);
    expect(list.every((e) => e.status !== "closed" && e.status !== "recovered")).toBe(true);
    for (let i = 1; i < list.length; i++) expect(list[i - 1]!.amount_to_review_sar! >= list[i]!.amount_to_review_sar!).toBe(true);
  });
});

describe("reporting clarity (cost %, VAT, branch names)", () => {
  const hungerstation = {
    ...period,
    platform: "hungerstation",
    summary: { ...period.summary, grossSales: 1327130.543999998, totalCharges: 318103.3101630429 },
    invoice: { checks: [], totalExVat: 318103.4, vat: 47715.51, totalIncVat: 365818.91 },
  } as unknown as StoredPeriod;
  const keeta = {
    ...period,
    platform: "keeta",
    summary: { ...period.summary, grossSales: 1860493.84, totalCharges: 587849.58, keetaTotalCostExVat: 587849.58, keetaPlatformCostPct: 0.36335891 },
    branches: [{ branch: "Past Al Malqa Riyadh (🔥Free Delivery 🔥)", branchId: "k1", orders: 10, grossSales: 1000, netSales: 800, commission: 100, commissionPct: 0.1, totalCharges: 300, keetaTotalCostExVat: 300, keetaPlatformCostPct: 0.35 }],
    invoice: null,
  } as unknown as StoredPeriod;

  test("platform cost % is charges ÷ gross sales and states its formula", () => {
    expect(periodHeadline(hungerstation)).toMatchObject({ platform_cost_pct: 0.2397, platform_cost_pct_formula: "total_platform_charges / gross_sales" });
    expect(periodHeadline(keeta)).toMatchObject({ platform_cost_pct: 0.316, platform_cost_pct_of_net: 0.3634 });
    expect(periodHeadline(hungerstation)).not.toHaveProperty("platform_cost_pct_of_net");
  });

  test("platform cost % includes HungerStation's CPC advertising without VAT, with the excl-ads figure beside it", () => {
    const withCpc = { ...hungerstation, invoice: { ...hungerstation.invoice, cpc: 70624.35 } } as StoredPeriod;
    expect(periodHeadline(withCpc)).toMatchObject({
      total_platform_charges_sar: 379515.79,
      platform_cost_pct: 0.286,
      advertising_ex_vat_sar: 61412.48,
      platform_cost_pct_excl_ads: 0.2397,
    });
    expect(periodHeadline({ ...keeta, summary: { ...keeta.summary, keetaMerchantAdExVat: 31229.18 } } as StoredPeriod)).toMatchObject({
      platform_cost_pct: 0.316,
      advertising_ex_vat_sar: 31229.18,
      platform_cost_pct_excl_ads: 0.2992,
    });
  });

  test("VAT is shown separately, from the invoice or marked computed", () => {
    expect(periodReadout(hungerstation, "https://tadqeeq.app").charges_vat).toEqual({
      total_charges_ex_vat_sar: 318103.4,
      vat_15_pct_sar: 47715.51,
      total_charges_inc_vat_sar: 365818.91,
      source: "invoice",
    });
    expect(periodReadout(keeta, "https://tadqeeq.app").charges_vat).toMatchObject({ source: "computed", vat_15_pct_sar: 88177.44 });
  });

  test("branches carry a clean display name next to the raw one", () => {
    const [branch] = branchPerformance(keeta);
    expect(branch).toMatchObject({
      branch: "Past Al Malqa Riyadh (🔥Free Delivery 🔥)",
      display_name: "Past Al Malqa Riyadh",
      platform_cost_pct: 0.3,
      platform_cost_pct_of_net: 0.35,
    });
  });
});

describe("invoice detail (lines, branch charges, statement of account, compensation)", () => {
  const detailed = {
    ...period,
    platform: "hungerstation",
    summary: { ...period.summary, compensation: 2612.173913043478 },
    branches: [
      { branch: "Motto - Uhud", branchId: "m", invoiceBranchName: "Motto - Uhud ' - ' /", orders: 5, grossSales: 500, netSales: 400, commission: 50, commissionPct: 0.1, totalCharges: 260 },
      { branch: "PAST - Al Nasim", branchId: "n", invoiceBranchName: "PAST - Al Nasim", orders: 5, grossSales: 500, netSales: 400, commission: 50, commissionPct: 0.1, totalCharges: 60 },
    ],
    invoice: {
      checks: [],
      cpc: 70624.35,
      lineDetails: [
        { key: "free_delivery_campaign", label: "رسوم حملات التوصيل المجاني", quantity: 338, unit: "orders", avgRate: 1.74, rateKind: "per_unit", amount: 587.83 },
        { key: "customer_compensation", label: "تعويضات العملاء", quantity: 2612.17, unit: "sar_base", avgRate: 100, rateKind: "percent", amount: 2612.16 },
      ],
      unallocatedCharges: [{ label: "رسوم حملات التوصيل المجاني", amount: 587.83 }],
      branches: [{ branch: "Motto - Uhud ' - ' /", invoiceOnlyCharges: 200, invoiceOnlyItems: [{ label: "الاشتراك الشهري", amount: 200 }] }],
      statementOfAccount: { openingBalance: 442433.03, commissionInvoice: 365818.91, advertisingServicesInvoice: 70624.35, loanInstallmentInvoice: 0, netMonthlyDueBalance: -448341.54 },
    },
  } as unknown as StoredPeriod;
  const readout = periodReadout(detailed, "https://tadqeeq.app");

  test("invoice lines carry quantity, unit and average rate", () => {
    expect(readout.invoice_lines[0]).toEqual({ key: "free_delivery_campaign", line: "رسوم حملات التوصيل المجاني", quantity: 338, unit: "orders", avg_rate: 1.74, rate_kind: "per_unit", amount_sar: 587.83 });
  });

  test("branch charges stay on their branch; summary-only charges are unallocated", () => {
    const branches = branchPerformance(detailed);
    expect(branches.find((b) => b.branch === "Motto - Uhud")?.invoice_only_charges).toEqual([
      { line: "الاشتراك الشهري", amount_sar: 200, allocation_rule: "direct_to_branch: printed in that branch's invoice section" },
    ]);
    expect(branches.find((b) => b.branch === "PAST - Al Nasim")?.invoice_only_charges).toEqual([]);
    expect(readout.unallocated_charges).toEqual([
      {
        line: "رسوم حملات التوصيل المجاني",
        amount_sar: 587.83,
        allocation: "unallocated",
        allocation_rule: "platform_level: printed only in the consolidated summary, not allocated",
      },
    ]);
    // Branch charges plus platform-level ones add up to the invoice-only total.
    expect(readout.invoice_only_allocation).toMatchObject({ allocated_to_branches_sar: 200, unallocated_sar: 587.83, total_sar: 787.83 });
  });

  test("the statement of account is separate and the advertising invoice is verified against CPC", () => {
    expect(readout.statement_of_account).toMatchObject({
      advertising_services_invoice: 70624.35,
      advertising_status: "verified",
      opening_balance: 442433.03,
      net_monthly_due_balance: -448341.54,
    });
    expect(readout.open_items).toEqual([]);
    const withoutCpc = periodReadout({ ...detailed, invoice: { ...detailed.invoice, cpc: undefined } } as unknown as StoredPeriod, "x");
    expect(withoutCpc.statement_of_account?.advertising_status).toBe("not_verified");
    expect(withoutCpc.open_items).toHaveLength(1);
  });

  test("compensation shows invoiced, recalculated with its source, and the exact difference", () => {
    // 2612.1739 against 2612.16 is 0.0139 apart: shown as 0.01, but not within the strict under-one-halala tolerance.
    expect(readout.compensation).toMatchObject({ invoiced: 2612.16, recalculated: 2612.17, difference: 0.01, within_tolerance: false });
    expect(readout.compensation?.recalculated_source).toContain("Compensated Orders");
  });

  test("compensation under one halala apart is within tolerance", () => {
    const close = periodReadout({ ...detailed, summary: { ...detailed.summary, compensation: 2612.165 } } as unknown as StoredPeriod, "x");
    expect(close.compensation).toMatchObject({ within_tolerance: true });
  });
});
