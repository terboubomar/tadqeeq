import { describe, expect, test } from "bun:test";

import type { BranchRow } from "./analysis/types";
import { buildHungerStationMappingReview } from "./hungerstation-branch-review";

function branch(overrides: Partial<BranchRow>): BranchRow {
  return {
    branch: "Branch",
    branchId: "1",
    orders: 1,
    grossSales: 100,
    netSales: 100,
    commission: 10,
    commissionPct: 0.1,
    ccSuccess: 0,
    ccRejected: 0,
    walletAmount: 0,
    riderWallet: 0,
    rdfCampaigns: 0,
    freeDeliveryOrders: 0,
    compensation: 0,
    jokerFees: 0,
    hsFoodDiscount: 0,
    rewardsDiscount: 0,
    restaurantFoodDiscount: 0,
    totalFoodDiscount: 0,
    partialRefund: 0,
    fulfillmentMods: 0,
    approvedRefunds: 0,
    waitingTimeFees: 0,
    bankFeeSuccess: 0,
    bankFeeRefunded: 0,
    totalCharges: 10,
    ...overrides,
  };
}

describe("buildHungerStationMappingReview", () => {
  test("prompts for a deterministic residual rename so it can be confirmed once", () => {
    const review = buildHungerStationMappingReview([
      branch({
        branch: "Current Name",
        branchId: "100",
        invoiceBranchName: "Legacy Invoice Name",
        branchAuditStatus: "matched",
        branchAuditNote:
          "تمت مطابقة الفرع المتبقي بشكل حتمي بعد مطابقة جميع الفروع الأخرى؛ لم تُستخدم القيم المالية لتحديد الهوية.",
      }),
    ]);

    expect(review?.branches).toEqual([
      {
        branch: "Current Name",
        branchId: "100",
        suggestedInvoiceBranchName: "Legacy Invoice Name",
      },
    ]);
    expect(review?.invoiceBranchNames).toEqual(["Legacy Invoice Name"]);
  });

  test("offers operational invoice-only rows for unresolved multi-branch matching", () => {
    const review = buildHungerStationMappingReview([
      branch({
        branch: "Current Name",
        branchId: "100",
        branchAuditStatus: "unmatched",
      }),
      branch({
        branch: "Old Invoice Name",
        branchId: "",
        invoiceBranchName: "Old Invoice Name",
        branchAuditStatus: "invoice_only",
        orders: 4,
      }),
    ]);

    expect(review?.branches[0]?.branchId).toBe("100");
    expect(review?.invoiceBranchNames).toEqual(["Old Invoice Name"]);
  });

  test("does not prompt for normal name matches or already-confirmed mappings", () => {
    expect(
      buildHungerStationMappingReview([
        branch({
          invoiceBranchName: "Branch",
          branchAuditStatus: "matched",
          branchAuditNote: "مطابق.",
        }),
        branch({
          branch: "Current Name",
          branchId: "200",
          invoiceBranchName: "Legacy Name",
          branchAuditStatus: "matched",
          branchAuditNote:
            "تمت مطابقة الفرع عبر ربط مؤكد ومحفوظ باستخدام HS Branch ID؛ لم تُستخدم القيم المالية لتحديد الهوية.",
        }),
      ]),
    ).toBeNull();
  });
});
