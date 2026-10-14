import { describe, expect, test } from "bun:test";

import { applyClassificationRules, disputeLetter, requiredEvidence, type ClassificationRule } from "./exception-recovery";
import { claimableAmountFor, isOpenException, summarizeExceptions, type AuditException } from "./exceptions";
import type { StoredPeriod } from "./periods";

const period = { id: "p", platform: "hungerstation", label: "HS Sept", period_start: "2026-09-01", period_end: "2026-09-30" } as unknown as StoredPeriod;

const item = (over: Partial<AuditException>): AuditException =>
  ({
    id: over.label ?? "x",
    code: "X",
    periodId: "p",
    periodLabel: "HS Sept",
    platform: "hungerstation",
    periodStart: "2026-09-01",
    periodEnd: "2026-09-30",
    sourceLevel: "branch",
    category: "other_fee",
    categoryLabel: "رسوم أخرى",
    label: "Printers",
    tolerance: 0,
    reviewAmount: 500,
    potentialRecovery: 0,
    severity: "medium",
    status: "new",
    recoveredAmount: 0,
    attachments: [],
    claimableAmount: 0,
    rollup: false,
    ...over,
  }) as AuditException;

/** HungerStation Sept: 2,287.83 SAR of invoice-only charges, status new, potential recovery 0 (Gap 3). */
const printers = item({ label: "بند من الفاتورة فقط · Printers", branch: "PAST - al mazrua", evidence: "invoice_only" });
const subscription = item({ label: "بند من الفاتورة فقط · Monthly subscription fees", branch: "Motto - Uhud", reviewAmount: 200, evidence: "invoice_only" });
const freeDelivery = item({ label: "بند من الفاتورة فقط · Free Delivery fee campaign Charges", reviewAmount: 587.83, evidence: "invoice_only" });

describe("requiredEvidence", () => {
  test("names the document, the amount and the branch", () => {
    expect(requiredEvidence(printers)).toMatchObject({ expectedAmount: 500, branch: "PAST - al mazrua" });
    expect(requiredEvidence(printers).document).toContain("فاتورة الجهاز");
    expect(requiredEvidence(freeDelivery).branch).toBeNull();
  });
});

describe("classification rules", () => {
  const rules: ClassificationRule[] = [
    { id: "r1", platform: null, match_text: "printers", classification: "أجهزة", commissionable: false, claimable: false, note: null },
    { id: "r2", platform: "hungerstation", match_text: "Free Delivery fee", classification: "حملة غير موافق عليها", commissionable: false, claimable: true, note: null },
  ];
  const [p, s, f] = applyClassificationRules([printers, subscription, freeDelivery], rules);

  test("a matching new item is classified, or claimable when the rule says so", () => {
    expect(p).toMatchObject({ status: "classified", classification: "أجهزة، غير خاضع للعمولة", claimableAmount: 0 });
    expect(f).toMatchObject({ status: "claimable", claimableAmount: 587.83 });
    expect(s!.status).toBe("new");
  });

  test("a person's own status wins over a rule", () => {
    const [kept] = applyClassificationRules([{ ...printers, status: "disputed" }], rules);
    expect(kept!.status).toBe("disputed");
  });
});

describe("claimable amounts", () => {
  test("only while a claim stands, using the entered amount first", () => {
    expect(claimableAmountFor({ status: "claimable", potentialRecovery: 0, reviewAmount: 200 })).toBe(200);
    expect(claimableAmountFor({ status: "disputed", potentialRecovery: 150, reviewAmount: 200 })).toBe(150);
    expect(claimableAmountFor({ status: "claimable", potentialRecovery: 150, reviewAmount: 200 }, 120)).toBe(120);
    expect(claimableAmountFor({ status: "reviewing", potentialRecovery: 150, reviewAmount: 200 })).toBe(0);
  });

  test("rejected items are closed and claimable amounts reach the summary", () => {
    expect(isOpenException({ status: "rejected" })).toBe(false);
    const summary = summarizeExceptions([{ ...subscription, status: "claimable", claimableAmount: 200 }, { ...printers, status: "rejected" }]);
    expect(summary).toMatchObject({ claimable: 200, openCount: 1 });
  });
});

describe("disputeLetter", () => {
  test("lists each claimable item with branch, amount and attachments, in Arabic and English", () => {
    const claims = [
      { ...subscription, status: "claimable" as const, claimableAmount: 200, attachments: [{ path: "w/p/a.pdf", name: "a.pdf" }] },
      { ...freeDelivery, status: "claimable" as const, claimableAmount: 587.83 },
      printers,
    ];
    const letter = disputeLetter(period, claims)!;
    expect(letter.total).toBe(787.83);
    expect(letter.items).toHaveLength(2);
    expect(letter.arabic).toContain("هنقرستيشن");
    expect(letter.arabic).toContain("Motto - Uhud");
    expect(letter.arabic).toContain("787.83 ر.س");
    expect(letter.english).toContain("SAR 787.83");
    expect(letter.english).toContain("attached: a.pdf");
  });

  test("nothing claimable, no letter", () => {
    expect(disputeLetter(period, [printers])).toBeNull();
  });
});

describe("rules on the combined «unclassified charges» exception", () => {
  // HungerStation Sept: one exception of 2,287.83 SAR made of these invoice-only lines.
  const combined = item({
    label: "بنود خصم غير مصنفة في خريطة الرسوم",
    category: "unsupported_charge" as AuditException["category"],
    reviewAmount: 2287.83,
    lines: [
      { label: "Printers", amount: 1500 },
      { label: "Monthly subscription fees", amount: 200 },
      { label: "Free Delivery fee campaign Charges", amount: 587.83 },
    ],
  });
  const rule = (match_text: string, claimable: boolean): ClassificationRule => ({
    id: match_text,
    platform: null,
    match_text,
    classification: claimable ? "غير مستحق" : "رسم مستحق",
    commissionable: false,
    claimable,
    note: null,
  });

  test("every line covered: claimable for the part owed back only", () => {
    const [result] = applyClassificationRules([combined], [rule("printers", false), rule("subscription", false), rule("free delivery", true)]);
    expect(result).toMatchObject({ status: "claimable", claimableAmount: 587.83 });
    expect(result!.classification).toContain("Printers: رسم مستحق");
    expect(disputeLetter(period, [result!])!.english).toContain("1. Free Delivery fee campaign Charges: SAR 587.83");
  });

  test("some lines without a rule: stays new, covered lines noted", () => {
    const [result] = applyClassificationRules([combined], [rule("printers", false)]);
    expect(result!.status).toBe("new");
    expect(result!.classification).toContain("2 بند بلا قاعدة");
  });

  test("every line a legitimate charge: classified, nothing claimable", () => {
    const [result] = applyClassificationRules([combined], [rule("printers", false), rule("subscription", false), rule("free delivery", false)]);
    expect(result).toMatchObject({ status: "classified", claimableAmount: 0 });
  });
});
