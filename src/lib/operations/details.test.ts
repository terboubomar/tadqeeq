import { describe, expect, test } from "bun:test";

import {
  mapStoredOperationOrder,
  operationCommissionRatio,
  operationCostRatio,
  type StoredOperationOrder,
} from "./details";

const base: StoredOperationOrder = {
  order_id: "ORDER-1",
  business_date: "2026-10-08",
  branch_id: "BR-1",
  branch_name: "الفرع الأول",
  status: "completed",
  delivery_mode: "delivery",
  gross_sales: "120.00",
  delivery_amount: "8.00",
  complaint: false,
  complaint_reason: null,
  refund_amount: null,
  charges_total: "28.00",
  settlement_amount: "92.00",
  raw_data: {},
};

describe("daily operations details", () => {
  test("calculates cost and commission percentages from sales", () => {
    expect(operationCostRatio(25, 100)).toBe(0.25);
    expect(operationCommissionRatio(15, 100)).toBe(0.15);
    expect(operationCostRatio(25, 0)).toBeNull();
  });

  test("maps HungerStation raw financial columns without losing branch and date", () => {
    const detail = mapStoredOperationOrder("hungerstation", {
      ...base,
      raw_data: {
        Subtotal: 110,
        "Packaging charges": 10,
        "Discount Funded by you": -5,
        "Voucher Funded by you": -3,
        Commission: -18,
        "Online payment fee": -2,
        "Operational charges": -1,
        "Estimated earnings": 91,
      },
    });

    expect(detail.businessDate).toBe("2026-10-08");
    expect(detail.branchName).toBe("الفرع الأول");
    expect(detail.subtotalAmount).toBe(110);
    expect(detail.packagingAmount).toBe(10);
    expect(detail.discountAmount).toBe(8);
    expect(detail.commissionAmount).toBe(18);
    expect(detail.paymentFeeAmount).toBe(2);
    expect(detail.otherFeeAmount).toBe(1);
    expect(detail.settlementAmount).toBe(92);
  });

  test("keeps current Keeta other expenses separate from payment fees", () => {
    const detail = mapStoredOperationOrder("keeta", {
      ...base,
      raw_data: {
        Sales: 120,
        "Promotion expense": 7,
        Commission: 15,
        "Other expenses": 2.5,
        Earnings: 95.5,
      },
    });

    expect(detail.discountAmount).toBe(7);
    expect(detail.commissionAmount).toBe(15);
    expect(detail.paymentFeeAmount).toBe(0);
    expect(detail.otherFeeAmount).toBe(2.5);
    expect(detail.estimatedEarningsAmount).toBe(95.5);
  });
});
