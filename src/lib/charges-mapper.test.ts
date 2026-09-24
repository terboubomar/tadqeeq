import { describe, expect, test } from "bun:test";

import { buildMarketplaceChargeMap } from "./charges-mapper";
import { buildPeriodExceptions } from "./exceptions";
import type { StoredPeriod } from "./periods";

function period(
  platform: StoredPeriod["platform"],
  input: {
    summary: Partial<StoredPeriod["summary"]>;
    invoice?: Partial<StoredPeriod["invoice"]>;
  },
): StoredPeriod {
  return {
    id: "period-1",
    label: "September",
    platform,
    period_start: "2026-09-01",
    period_end: "2026-09-30",
    created_at: "2026-09-30T00:00:00.000Z",
    engine_version: "1.1.0",
    format_ids: [],
    summary: {
      platform,
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
      bankRate: 0,
      bankRateSource: "none",
      bankFeeSuccess: 0,
      bankFeeRefunded: 0,
      invoiceOnlyExtras: 0,
      totalCharges: 0,
      branchCount: 0,
      statusCounts: {},
      periodStart: "2026-09-01",
      periodEnd: "2026-09-30",
      ...input.summary,
    },
    branches: [],
    daily: [],
    invoice: {
      lines: [],
      checks: [],
      ...input.invoice,
    },
  };
}

describe("marketplace charges mapper", () => {
  test("classifies HungerStation audit charges and fails loud on invoice-only extras", () => {
    const map = buildMarketplaceChargeMap(
      period("hungerstation", {
        summary: {
          commission: 100,
          bankFeeSuccess: 20,
          walletFee: 5,
          rdfCampaigns: 10,
          invoiceOnlyExtras: 25,
          totalCharges: 160,
        },
        invoice: {
          extras: [{ label: "رسوم غير معروفة", amount: 25 }],
          cpc: 12,
        },
      }),
    );

    expect(map.auditTotalCharges).toBe(160);
    expect(map.unmappedAuditAmount).toBe(25);
    expect(map.mappedAuditAmount).toBe(135);
    expect(map.coveragePct).toBeCloseTo(0.84375);
    expect(map.reconciliationVariance).toBe(0);
    expect(
      map.lines.find((line) => line.id === "hs-cpc")?.scope,
    ).toBe("outside_audit_total");

    const exceptions = buildPeriodExceptions(
      period("hungerstation", {
        summary: {
          commission: 100,
          bankFeeSuccess: 20,
          walletFee: 5,
          rdfCampaigns: 10,
          invoiceOnlyExtras: 25,
          totalCharges: 160,
        },
        invoice: {
          extras: [{ label: "رسوم غير معروفة", amount: 25 }],
        },
      }),
    );

    const unmapped = exceptions.find(
      (item) => item.code === "MARKETPLACE_UNMAPPED_CHARGES",
    );
    expect(unmapped?.reviewAmount).toBe(25);
    expect(unmapped?.potentialRecovery).toBe(0);
  });

  test("does not hide Keeta Other Expenses behind a generic mapped bucket", () => {
    const map = buildMarketplaceChargeMap(
      period("keeta", {
        summary: {
          totalCharges: 200,
          keetaCommissionExVat: 80,
          keetaBankFeesExVat: 20,
          keetaDeliveryCampaignExVat: 30,
          keetaProductCampaignExVat: 20,
          keetaMerchantAdExVat: 10,
          keetaCompensationExVat: 10,
          keetaPosFeesExVat: 5,
          keetaOtherExpensesExVat: 30,
        },
      }),
    );

    expect(map.reconciliationVariance).toBe(0);
    expect(map.unmappedAuditAmount).toBe(25);
    expect(
      map.lines.find((line) => line.id === "keeta-unmapped-other")?.mapped,
    ).toBe(false);
  });

  test("fully maps the current Jahez audit-total fee model", () => {
    const map = buildMarketplaceChargeMap(
      period("jahez", {
        summary: {
          totalCharges: 100,
          commission: 60,
          jahezCommissionInvoiceExVat: 60,
          jahezPaymentFeesExVat: 20,
          jahezDeliveryOfferInvoiceExVat: 20,
          jahezOfferAmount: 15,
          jahezPaymentFeesVat: 3,
        },
      }),
    );

    expect(map.unmappedAuditAmount).toBe(0);
    expect(map.coveragePct).toBe(1);
    expect(map.reconciliationVariance).toBe(0);
    expect(
      map.lines.find((line) => line.id === "jahez-offer-amount")?.scope,
    ).toBe("outside_audit_total");
  });

  test("creates an explicit unmapped residual instead of guessing", () => {
    const map = buildMarketplaceChargeMap(
      period("jahez", {
        summary: {
          totalCharges: 110,
          commission: 60,
          jahezCommissionInvoiceExVat: 60,
          jahezPaymentFeesExVat: 20,
          jahezDeliveryOfferInvoiceExVat: 20,
        },
      }),
    );

    expect(map.unmappedAuditAmount).toBe(10);
    expect(map.reconciliationVariance).toBe(0);
    expect(
      map.lines.some(
        (line) => line.id === "jahez-unmapped-reconciliation-residual",
      ),
    ).toBe(true);
  });
});
