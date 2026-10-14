import type { StoredPeriod } from "./periods";

/**
 * Jahez compensations whose order number was not in any order file Tadqeeq had when the period was analysed: which
 * order file is needed to match each one, and whether an order file uploaded since then already holds the order (so
 * re-running the period's analysis will match it). Display only: matching itself stays in the engine and runs again
 * through «إعادة التحليل», which reads every other saved Jahez period.
 */
export interface UnmatchedCompensation {
  orderId: string;
  sequence: string;
  branch: string;
  amount: number;
  creationDate: string;
  /** Months whose Jahez order file could hold the order ("YYYY-MM"), newest first, not already uploaded. */
  neededMonths: string[];
  /** A saved Jahez period, other than this one, whose order file has the order. */
  foundIn: { periodId: string; periodLabel: string } | null;
}

const ARABIC_MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

export function monthLabel(key: string): string {
  const [year, month] = key.split("-").map(Number);
  return `${ARABIC_MONTHS[(month ?? 1) - 1]} ${year}`;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

/** "YYYY-MM" of every month a period touches. */
function coveredMonths(period: StoredPeriod): Set<string> {
  const out = new Set<string>();
  if (!period.period_start || !period.period_end) return out;
  const cursor = new Date(period.period_start.slice(0, 7) + "-01T00:00:00Z");
  const end = period.period_end.slice(0, 7);
  for (let guard = 0; guard < 36 && monthKey(cursor) <= end; guard++) {
    out.add(monthKey(cursor));
    cursor.setUTCMonth(cursor.getUTCMonth() + 1);
  }
  return out;
}

/** Parses Jahez dates such as "2026-09-14 13:05", "14/09/2026" or ISO; null when unreadable. */
function parseDate(value: string): Date | null {
  const iso = value.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return new Date(Date.UTC(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3])));
  const dmy = value.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  if (dmy) return new Date(Date.UTC(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])));
  return null;
}

/**
 * The compensation's month and the one before (an order is compensated after it is delivered), minus months already
 * covered by a saved Jahez period, since those order files were already searched.
 */
function neededMonths(creationDate: string, searched: Set<string>, period: StoredPeriod): string[] {
  const date = parseDate(creationDate) ?? (period.period_start ? new Date(period.period_start.slice(0, 10) + "T00:00:00Z") : null);
  if (!date) return [];
  const months: string[] = [];
  const cursor = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  for (let i = 0; i < 2; i++) {
    const key = monthKey(cursor);
    if (!searched.has(key)) months.push(key);
    cursor.setUTCMonth(cursor.getUTCMonth() - 1);
  }
  return months;
}

export function unmatchedJahezCompensations(period: StoredPeriod, periods: StoredPeriod[]): UnmatchedCompensation[] {
  if (period.platform !== "jahez") return [];
  const transactions = period.invoice?.jahezCompensation?.transactions ?? [];
  const others = periods.filter((other) => other.platform === "jahez" && other.id !== period.id);
  const searched = new Set<string>([...coveredMonths(period), ...others.flatMap((other) => [...coveredMonths(other)])]);
  return transactions
    .filter((transaction) => transaction.match === "unknown" && transaction.orderId)
    .map((transaction) => {
      const holder = others.find((other) => other.invoice?.jahezOrderIndex?.[transaction.orderId]);
      return {
        orderId: transaction.orderId,
        sequence: transaction.sequence,
        branch: transaction.branch,
        amount: transaction.amount,
        creationDate: transaction.creationDate,
        neededMonths: holder ? [] : neededMonths(transaction.creationDate, searched, period),
        foundIn: holder ? { periodId: holder.id, periodLabel: holder.label } : null,
      };
    });
}

/** The unmatched compensation behind a JAHEZ_COMPENSATION_UNKNOWN_ORDER exception (its id is "jahez-comp:<order>:<seq>:unknown"). */
export function unmatchedForException(
  branchId: string | undefined,
  unmatched: UnmatchedCompensation[],
): UnmatchedCompensation | undefined {
  const match = branchId?.match(/^jahez-comp:(.+):([^:]+):unknown$/);
  if (!match) return undefined;
  return unmatched.find((item) => item.orderId === match[1] && item.sequence === match[2]);
}
