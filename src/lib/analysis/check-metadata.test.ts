import { describe, expect, test } from "bun:test";

import type { BranchRow, CheckRow } from "./types";
import { normalizeCheckMetadata } from "./check-metadata";

function branch(overrides: Partial<BranchRow> = {}): BranchRow {
  return {
    branch: "Branch A",
    branchId: "100",
    orders: 0,
    grossSales: 0,
    netSales: 0,
    commission: 0,
    commissionPct: 0,
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
    totalCharges: 0,
    ...overrides,
  };
}

describe("legacy check metadata", () => {
  test("upgrades a known historical check to its stable code and category", () => {
    const legacy = {
      label: "عمولة المبيعات",
      computed: 100,
      invoiced: 110,
      evidence: "data",
    } as unknown as CheckRow;

    const [normalized] = normalizeCheckMetadata(
      "hungerstation",
      [],
      [legacy],
    );

    expect(normalized?.code).toBe("HS_SALES_COMMISSION");
    expect(normalized?.category).toBe("commission");
    expect(normalized?.controlOnly).toBeUndefined();
  });

  test("derives branch coverage from structured branch fields, not the display label", () => {
    const legacy = {
      label: "عمولة المبيعات",
      computed: 100,
      invoiced: 110,
      evidence: "data",
    } as unknown as CheckRow;

    const [normalized] = normalizeCheckMetadata(
      "hungerstation",
      [branch({ invoiceCommission: 110 })],
      [legacy],
    );

    expect(normalized?.coveredByBranches).toBe(true);
  });

  test("keeps unknown historical checks non-actionable instead of guessing a category", () => {
    const legacy = {
      label: "Unknown old control",
      computed: 100,
      invoiced: 150,
      evidence: "data",
    } as unknown as CheckRow;

    const [normalized] = normalizeCheckMetadata("jahez", [], [legacy]);

    expect(normalized?.code).toContain("JAHEZ_LEGACY_UNKNOWN_");
    expect(normalized?.category).toBe("other");
    expect(normalized?.controlOnly).toBe(true);
  });
});
