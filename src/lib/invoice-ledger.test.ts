import { describe, expect, test } from "bun:test";

import { invoiceLedgerSummary, ledgerNeedsReview, ledgerVerdict, type LedgerCheck } from "./invoice-ledger";
import type { StoredPeriod } from "./periods";

const check = (partial: Partial<LedgerCheck>): LedgerCheck =>
  ({ code: "X", category: "commission", label: "عمولة المبيعات", computed: 1000, invoiced: 1000, tolerance: 1, evidence: "data", ...partial }) as LedgerCheck;

describe("مُطابِق ledger rules", () => {
  test("differences of 10 SAR or less match and show no amount", () => {
    expect(ledgerVerdict(check({ invoiced: 1009 }))).toEqual({ label: "مطابق", tone: "good" });
    expect(ledgerNeedsReview(check({ invoiced: 1009 }))).toBe(false);
  });

  test("a charge invoiced above the recalculation is the bad side; money owed to the restaurant is the reverse", () => {
    expect(ledgerVerdict(check({ invoiced: 1050 }))).toEqual({ label: "زيادة في الفاتورة", tone: "bad", amount: 50 });
    expect(ledgerVerdict(check({ category: "settlement", invoiced: 950 }))).toEqual({ label: "أقل من المحتسب", tone: "bad", amount: -50 });
  });

  test("invoice-only lines need a document; lines not read are muted and need review", () => {
    expect(ledgerVerdict(check({ evidence: "invoice_only" })).tone).toBe("warn");
    expect(ledgerVerdict(check({ invoiced: undefined })).label).toBe("لم يُقرأ من الفاتورة");
    expect(ledgerNeedsReview(check({ invoiced: undefined }))).toBe(true);
  });

  test("the headline uses HungerStation's independent lines only and the counts add up", () => {
    const period = {
      platform: "hungerstation",
      invoice: {
        lines: [{ label: "x" }],
        checks: [
          check({ invoiced: 1100 }),
          check({ label: "رسوم الدفع الإلكتروني", computed: 200, invoiced: 205 }),
          check({ label: "بند آخر", computed: 50, invoiced: 90 }),
          check({ label: "مفقود", invoiced: undefined }),
          check({ label: "فاتورة فقط", evidence: "invoice_only" }),
        ],
      },
    } as unknown as StoredPeriod;
    const s = invoiceLedgerSummary(period);
    expect(s.hasOfficialControl).toBe(true);
    expect(s.totalDiff).toBe(100);
    expect(s.flaggedCount).toBe(3);
    expect(s.flaggedPresent).toBe(2);
    expect(s.missingCount).toBe(1);
    expect(s.invoiceOnlyCount).toBe(1);
    expect(s.matchedCount).toBe(1);
  });
});
