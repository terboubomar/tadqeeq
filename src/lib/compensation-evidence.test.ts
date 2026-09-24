import { describe, expect, test } from "bun:test";

import {
  buildCompensationDisputeDraft,
  extractOrderNumber,
  normalizeOrderLookupKey,
  telegramMessageUrl,
} from "./compensation-evidence";

describe("compensation evidence helpers", () => {
  test("extracts order numbers from cashier captions", () => {
    expect(extractOrderNumber("784512963")).toBe("784512963");
    expect(extractOrderNumber("Order ID: 784512963")).toBe("784512963");
    expect(extractOrderNumber("رقم الطلب: 784512963")).toBe("784512963");
    expect(extractOrderNumber("")).toBeNull();
    expect(extractOrderNumber("order missing id")).toBeNull();
  });

  test("normalizes exact search keys without inventing an order", () => {
    expect(normalizeOrderLookupKey(" #ab-123 ")).toBe("AB-123");
  });

  test("builds Telegram private-supergroup links only when valid", () => {
    expect(telegramMessageUrl("-1001234567890", 77)).toBe(
      "https://t.me/c/1234567890/77",
    );
    expect(telegramMessageUrl("-12345", 77)).toBeNull();
  });

  test("draft remains a review request instead of asserting recoverability", () => {
    const draft = buildCompensationDisputeDraft({
      platform: "jahez",
      orderNumber: "784512963",
      branchName: "Past Al Rakah",
      compensationAmount: 43,
      compensationReason: "Missing item",
      employeeExplanation: "The branch states that the full order was packed.",
      evidenceCapturedAt: "2026-09-23T18:43:00.000Z",
      evidenceSenderName: "Ahmed",
    });

    expect(draft.en).toContain("SAR 43.00");
    expect(draft.en).toContain("request a review");
    expect(draft.en).toContain("reverse the compensation if");
    expect(draft.ar).toContain("نطلب مراجعة");
    expect(draft.ar).not.toContain("مستحق لنا");
  });
});
