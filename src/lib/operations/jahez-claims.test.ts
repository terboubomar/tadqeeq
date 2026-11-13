import { describe, expect, test } from "bun:test";

import { jahezClaimsFromAdjustments, jahezClaimText } from "./jahez-claims";
import type { OperationAdjustment } from "./types";

const line = (partial: Partial<OperationAdjustment>): OperationAdjustment => ({
  fingerprint: Math.random().toString(16),
  orderId: "J-1001",
  businessDate: "2026-10-05",
  branchName: "الملقا",
  transactionType: "debit",
  reason: "Missing Item(s)",
  amount: 45,
  comment: null,
  rawData: {},
  ...partial,
});

describe("Jahez claims from the daily adjustments file", () => {
  test("one claim per order with its deductions added up; credits are left out", () => {
    const claims = jahezClaimsFromAdjustments([
      line({ amount: 45 }),
      line({ amount: 12.5, reason: "Adjustment", comment: "late" }),
      line({ orderId: "J-2002", transactionType: "credit", amount: 30 }),
      line({ orderId: "J-3003", amount: 0 }),
      line({ orderId: "J-4004", branchName: "العليا", amount: 20 }),
    ]);
    expect(claims.map((c) => c.orderId)).toEqual(["J-1001", "J-4004"]);
    expect(claims[0]).toMatchObject({ amount: 57.5, reasons: ["Missing Item(s)", "Adjustment"], comments: ["late"], branchName: "الملقا" });
  });

  test("the case text names Jahez's reasons in Arabic and keeps the file's words", () => {
    const [claim] = jahezClaimsFromAdjustments([line({ amount: 45 }), line({ amount: 12.5, reason: "Adjustment", comment: "late" })]);
    const text = jahezClaimText(claim!);
    expect(text.reason).toBe("خصم من جاهز: نقص أصناف (Missing Item(s))، تعديل من جاهز (Adjustment)");
    expect(text.explanation).toContain("57.50 ر.س");
    expect(text.explanation).toContain("2026-10-05");
    expect(text.explanation).toContain("ملاحظة جاهز: late");
  });
});
