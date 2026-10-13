import { describe, expect, test } from "bun:test";

import { balanceDirection, statementFormula } from "./statement-of-account";

// HungerStation, September: the figures printed on the statement.
const september = {
  openingBalance: 442433.03,
  commissionInvoice: 365818.91,
  advertisingServicesInvoice: 70624.35,
  loanInstallmentInvoice: 0,
  netMonthlyDueBalance: -448341.54,
};

describe("balanceDirection", () => {
  test("positive is owed by the restaurant, negative by the platform", () => {
    expect(balanceDirection(442433.03)).toBe("restaurant_owes");
    expect(balanceDirection(-448341.54)).toBe("platform_owes");
    expect(balanceDirection(0.001)).toBe("settled");
  });
});

describe("statementFormula", () => {
  test("opening + invoices − online sales closes on the printed balance", () => {
    const formula = statementFormula({ ...september, totalOnlineSales: 1327217.83 })!;
    expect(formula.terms.map((term) => [term.label, term.sign])).toEqual([
      ["الرصيد الافتتاحي", 1],
      ["فاتورة العمولة", 1],
      ["فاتورة الخدمات الإعلانية", 1],
      ["المبيعات الإلكترونية التي حصّلتها المنصة", -1],
    ]);
    expect(formula.computed).toBe(-448341.54);
    expect(formula.matches).toBe(true);
  });

  test("shows a difference when the printed figures do not close", () => {
    const formula = statementFormula({ ...september, totalOnlineSales: 1327000 })!;
    expect(formula.matches).toBe(false);
    expect(formula.difference).toBe(-217.83);
  });

  test("without online sales, the month's movements are one derived line", () => {
    const formula = statementFormula(september)!;
    expect(formula.terms.at(-1)).toEqual({ label: "مدفوعات وتحصيلات الشهر (محسوبة من الكشف)", sign: -1, amount: 1327217.83, derived: true });
    expect(formula.matches).toBe(true);
  });

  test("needs the opening and closing balances", () => {
    expect(statementFormula({ commissionInvoice: 1 })).toBeNull();
  });
});
