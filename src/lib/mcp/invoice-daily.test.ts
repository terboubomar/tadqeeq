import { describe, expect, test } from "bun:test";

import { buildOperationMonth } from "@/lib/operations/month";
import type { StoredPeriod } from "@/lib/periods";

import { dailyOperationsReadout, invoiceCheckReadout } from "./invoice-daily";

const period = {
  id: "11111111-1111-4111-8111-111111111111",
  label: "Aug",
  platform: "jahez",
  period_start: "2026-08-01",
  period_end: "2026-08-31",
  created_at: "2026-09-01T00:00:00Z",
  summary: { orders: 100, grossSales: 10000, netSales: 8000, commission: 1800, totalCharges: 2400 },
  invoice: {
    totalIncVat: 2500,
    checks: [
      { code: "TOTAL", category: "commission", label: "إجمالي فاتورة جاهز شامل الضريبة", computed: 2400, invoiced: 2460, tolerance: 1, evidence: "data" },
      { code: "FEE", category: "payment_fees", label: "رسوم الدفع", computed: 100, invoiced: 104, tolerance: 1, evidence: "data" },
    ],
  },
} as unknown as StoredPeriod;

describe("MCP invoice check", () => {
  test("gives each line the page's verdict and the headline claim difference", () => {
    const r = invoiceCheckReadout(period);
    expect(r.official_invoice_uploaded).toBe(true);
    expect(r.claim_difference_sar).toBe(60);
    expect(r.claim_direction).toBe("invoice above recalculation");
    expect(r.lines[0]).toMatchObject({ result: "زيادة في الفاتورة", difference_sar: 60, needs_review: true });
    expect(r.lines[1]).toMatchObject({ result: "مطابق", difference_sar: null, needs_review: false });
    expect(invoiceCheckReadout(period, true).lines).toHaveLength(1);
  });
});

describe("MCP daily operations", () => {
  test("reports the month per platform from the shared aggregation", () => {
    const month = buildOperationMonth("2026-11", [
      {
        id: "a", source_kind: "keeta_orders", platform: "keeta", business_date: "2026-11-03", original_name: "a", row_count: 3, created_at: "2026-11-04T00:00:00Z", superseded_at: null,
        summary: {
          orderCount: 3, grossSales: 300, deliveryAmount: 0, complaintCount: 0, refundCount: 0, refundAmount: 0, discountAmount: 0, merchantFundedDiscountAmount: 0,
          merchantFundedVoucherAmount: 0, commissionAmount: 45, paymentFeeAmount: 6, estimatedEarningsAmount: 0, cancellationCount: 0, chargesTotal: 60, settlementAmount: 240,
          adjustmentDebit: 0, adjustmentCredit: 0, matchedAdjustments: 0, unmatchedAdjustments: 0,
          branches: [{ key: "b1", branchId: "1", branchName: "الملقا", orderCount: 3, grossSales: 300, chargesTotal: 60, commissionAmount: 45, settlementAmount: 240, cancellationCount: 0, complaintCount: 0, refundCount: 0 }],
        },
      },
    ]);
    const all = dailyOperationsReadout(month, { includeDays: true });
    expect(all.all_platforms).toEqual({ orders: 3, gross_sales_sar: 300, platform_charges_sar: 60, settlement_sar: 240 });
    const keeta = all.platforms.find((p) => p.days_uploaded === 1)!;
    expect(keeta.top_branches[0]).toEqual({ branch: "الملقا", orders: 3, gross_sales_sar: 300, charges_sar: 60 });
    expect(keeta.days).toHaveLength(1);
    expect(dailyOperationsReadout(month, { platform: "keeta" }).platforms).toHaveLength(1);
  });
});
