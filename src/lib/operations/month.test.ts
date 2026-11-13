import { describe, expect, test } from "bun:test";

import { buildOperationMonth, type OperationImportRow } from "./month";
import type { OperationImportSummary } from "./types";

const summary = (partial: Partial<OperationImportSummary>): OperationImportSummary => ({
  orderCount: 0, grossSales: 0, deliveryAmount: 0, complaintCount: 0, refundCount: 0, refundAmount: 0, discountAmount: 0,
  merchantFundedDiscountAmount: 0, merchantFundedVoucherAmount: 0, commissionAmount: 0, paymentFeeAmount: 0,
  estimatedEarningsAmount: 0, cancellationCount: 0, chargesTotal: 0, settlementAmount: 0, adjustmentDebit: 0,
  adjustmentCredit: 0, matchedAdjustments: 0, unmatchedAdjustments: 0, ...partial,
});

const row = (id: string, partial: Partial<OperationImportRow>): OperationImportRow => ({
  id, source_kind: "jahez_orders", platform: "jahez", business_date: "2026-11-01", original_name: id + ".xlsx", row_count: 1,
  summary: summary({}), created_at: "2026-11-02T00:00:00Z", superseded_at: null, ...partial,
});

describe("daily operations month", () => {
  test("counts each source and day once, skips replaced uploads, and folds in Jahez adjustments", () => {
    const month = buildOperationMonth("2026-11", [
      row("new", { summary: summary({ orderCount: 10, grossSales: 1000, chargesTotal: 200, settlementAmount: 800 }) }),
      row("old", { superseded_at: "2026-11-02T01:00:00Z", summary: summary({ orderCount: 99, grossSales: 9999 }) }),
      row("day2", { business_date: "2026-11-02", summary: summary({ orderCount: 5, grossSales: 500, chargesTotal: 100, settlementAmount: 400 }) }),
      row("adj", { source_kind: "jahez_adjustments", summary: summary({ adjustmentDebit: 30, adjustmentCredit: 10, matchedAdjustments: 2 }) }),
    ]);
    const jahez = month.platforms.find((p) => p.platform === "jahez")!;
    expect(month.daysInMonth).toBe(30);
    expect(jahez.coveredDays).toBe(2);
    expect(jahez.orderCount).toBe(15);
    expect(jahez.grossSales).toBe(1500);
    expect(jahez.chargesToDate).toBe(320);
    expect(jahez.settlementToDate).toBe(1180);
    expect(jahez.refundCount).toBe(2);
    expect(jahez.days.map((d) => d.date)).toEqual(["2026-11-01", "2026-11-02"]);
    expect(month.imports).toHaveLength(4);
  });

  test("rejects an invalid month", () => {
    expect(() => buildOperationMonth("2026-13", [])).toThrow();
  });
});
