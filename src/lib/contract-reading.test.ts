import { describe, expect, test } from "bun:test";

import { contractReadingSchema, contractTextForModel, draftRulesFromReading, type ContractTerm } from "./contract-reading";

const term = (input: Partial<ContractTerm>): ContractTerm => ({
  ruleType: "commission_rate",
  ruleKey: "commission_rate",
  valueKind: "percentage",
  value: 16,
  textValue: null,
  vatIncluded: true,
  fundingSource: "merchant",
  scopeType: "all",
  scopeKey: null,
  label: "عمولة التوصيل",
  quote: "Total Commission [16]%",
  notes: "",
  ...input,
});

// The Keeta contract SAWM-SE-D8-00281916 as Tadqeeq AI would report it.
const keeta = contractReadingSchema.parse({
  platform: "keeta",
  contractTitle: "اتفاقية تاجر كيتا",
  reference: "SAWM-SE-D8-00281916",
  counterparty: "Keeta Technologies Arabia Limited",
  effectiveFrom: "2025-10-08",
  effectiveTo: "2026-10-08",
  summary: "عقد كيتا",
  warnings: ["ينتهي الخصم في 2026-10-08 وتصبح العمولة 23%."],
  terms: [
    term({}),
    term({ ruleType: "minimum_fee", ruleKey: "minimum_fee", valueKind: "amount", value: 5, quote: "Minimum Service Fee Per Order ([5] SAR" }),
    term({ ruleType: "free_delivery_funding", ruleKey: "Free delivery funding 25-35", valueKind: "amount", value: 5, vatIncluded: null }),
    term({ ruleType: "free_delivery_funding", ruleKey: "free_delivery_funding_35_plus", valueKind: "amount", value: 9, vatIncluded: null }),
    term({ ruleType: "payment_fee", ruleKey: "bank_fee", value: 2.5, vatIncluded: false }),
    term({ ruleType: "other_fee", ruleKey: "pickup_commission_rate", value: 3 }),
  ],
});

describe("draftRulesFromReading", () => {
  test("Keeta: a VAT-inclusive commission becomes the rate before VAT the check compares on", () => {
    const [commission] = draftRulesFromReading(keeta, "keeta");
    expect(commission).toMatchObject({ ruleKey: "commission_rate", ruleType: "commission_rate", numericValue: 13.913 });
    expect(commission!.notes).toContain("في العقد 16% شامل الضريبة = 13.913% بدون الضريبة");
  });

  test("checked rates keep their canonical keys; other keys are cleaned; amounts carry SAR", () => {
    const rules = draftRulesFromReading(keeta, "keeta");
    expect(rules.map((rule) => rule.ruleKey)).toEqual([
      "commission_rate",
      "minimum_fee",
      "free_delivery_funding_25_35",
      "free_delivery_funding_35_plus",
      "payment_fee",
      "pickup_commission_rate",
    ]);
    expect(rules.find((rule) => rule.ruleKey === "payment_fee")?.numericValue).toBe(2.5);
    expect(rules.find((rule) => rule.ruleKey === "free_delivery_funding_35_plus")).toMatchObject({ valueKind: "amount", numericValue: 9, currency: "SAR" });
  });

  test("Jahez commission is compared including VAT; HungerStation keeps the contract's figure with a note", () => {
    const reading = { ...keeta, terms: [term({ vatIncluded: false, value: 18 })] };
    expect(draftRulesFromReading(reading, "jahez")[0]?.numericValue).toBe(20.7);
    const hs = draftRulesFromReading(reading, "hungerstation")[0]!;
    expect(hs.numericValue).toBe(18);
    expect(hs.notes).toContain("تأكد");
  });

  test("drops values the check cannot use and keeps keys unique", () => {
    const reading = {
      ...keeta,
      terms: [term({ value: null }), term({ value: 140 }), term({ scopeType: "branch", scopeKey: " " }), term({}), term({ value: 15 })],
    };
    expect(draftRulesFromReading(reading, "keeta").map((rule) => rule.ruleKey)).toEqual(["commission_rate", "commission_rate_2"]);
  });
});

test("contractTextForModel turns Arabic presentation forms into plain letters", () => {
  expect(contractTextForModel("ﺍﺗﻔﺎﻗﻴﺔ   ﺍﻟﺘﺎﺟﺮ")).toBe("اتفاقية التاجر");
});
