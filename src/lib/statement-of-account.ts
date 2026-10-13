import type { StoredPeriod } from "./periods";

type Statement = NonNullable<StoredPeriod["invoice"]["statementOfAccount"]>;

/**
 * The platform's statement of account, read as printed. Sign convention, from the statement itself: a positive
 * balance is owed by the restaurant to the platform, a negative one by the platform to the restaurant. Invoices add
 * to what the restaurant owes; online sales the platform collected reduce it. Display only: nothing here feeds the
 * audit figures or platform charges.
 */
export type BalanceDirection = "restaurant_owes" | "platform_owes" | "settled";

export const BALANCE_DIRECTION_AR: Record<BalanceDirection, string> = {
  restaurant_owes: "مستحق على المطعم للمنصة",
  platform_owes: "مستحق من المنصة للمطعم",
  settled: "لا رصيد مستحق",
};

export function balanceDirection(value: number): BalanceDirection {
  if (Math.abs(value) < 0.005) return "settled";
  return value > 0 ? "restaurant_owes" : "platform_owes";
}

export interface StatementTerm {
  label: string;
  sign: 1 | -1;
  amount: number;
  /** Worked out from the printed figures rather than printed on the statement. */
  derived?: boolean;
}

export interface StatementFormula {
  terms: StatementTerm[];
  /** The closing balance the terms add up to. */
  computed: number;
  /** The closing balance printed on the statement. */
  printed: number;
  difference: number;
  matches: boolean;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/**
 * opening + invoices − online sales collected by the platform = closing. When the statement's online sales were not
 * read, the remaining movement (payments and collections) is shown as one derived line so the formula still closes.
 */
export function statementFormula(soa: Statement): StatementFormula | null {
  if (typeof soa.openingBalance !== "number" || typeof soa.netMonthlyDueBalance !== "number") return null;
  const terms: StatementTerm[] = [{ label: "الرصيد الافتتاحي", sign: 1, amount: soa.openingBalance }];
  const invoices: Array<[string, number | undefined]> = [
    ["فاتورة العمولة", soa.commissionInvoice],
    ["فاتورة الخدمات الإعلانية", soa.advertisingServicesInvoice],
    ["فاتورة أقساط القرض", soa.loanInstallmentInvoice],
  ];
  for (const [label, amount] of invoices) if (typeof amount === "number" && amount !== 0) terms.push({ label, sign: 1, amount });

  const printed = soa.netMonthlyDueBalance;
  if (typeof soa.totalOnlineSales === "number") {
    terms.push({ label: "المبيعات الإلكترونية التي حصّلتها المنصة", sign: -1, amount: soa.totalOnlineSales });
  } else {
    const beforeMovements = terms.reduce((sum, term) => sum + term.sign * term.amount, 0);
    const movements = round2(beforeMovements - printed);
    if (movements !== 0) terms.push({ label: "مدفوعات وتحصيلات الشهر (محسوبة من الكشف)", sign: -1, amount: movements, derived: true });
  }

  const computed = round2(terms.reduce((sum, term) => sum + term.sign * term.amount, 0));
  const difference = round2(printed - computed);
  return { terms, computed, printed, difference, matches: Math.abs(difference) < 0.01 };
}
