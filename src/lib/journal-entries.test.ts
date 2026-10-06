import { describe, expect, test } from "bun:test";

import { analyzeFixture, FIXTURE_DIRS, type FixturePlatform } from "./analysis/fixtures/load";
import type { AnalysisResult } from "./analysis/types";
import {
  branchJournalEntry,
  DEFAULT_JOURNAL_ACCOUNTS,
  periodJournalEntry,
  resolveJournalAccounts,
  type JournalEntry,
} from "./journal-entries";
import type { StoredPeriod } from "./periods";

function stored(result: AnalysisResult): StoredPeriod {
  return {
    id: "p",
    label: result.label,
    platform: result.platform,
    period_start: result.summary.periodStart,
    period_end: result.summary.periodEnd,
    created_at: "2026-01-01T00:00:00.000Z",
    summary: result.summary,
    branches: result.branches,
    daily: result.daily,
    invoice: { ...result.invoice, checks: result.checks },
  } as unknown as StoredPeriod;
}

const amount = (entry: JournalEntry, key: string) => {
  const line = entry.lines.find((l) => l.account.key === key);
  return line ? line.debit - line.credit : 0;
};

describe("journal entries from the engine fixtures", () => {
  for (const platform of Object.keys(FIXTURE_DIRS) as FixturePlatform[]) {
    test(platform + ": every branch entry and the period entry balance", async () => {
      const period = stored(await analyzeFixture(platform));
      expect(period.branches.length).toBeGreaterThan(0);
      for (const branch of period.branches) {
        const entry = branchJournalEntry(period, branch);
        expect(entry.totalDebit).toBeCloseTo(entry.totalCredit, 2);
        expect(entry.lines.every((line) => line.debit >= 0 && line.credit >= 0)).toBe(true);
        expect(entry.lines.every((line) => !(line.debit > 0 && line.credit > 0))).toBe(true);
      }
      const whole = periodJournalEntry(period);
      expect(whole.totalDebit).toBeCloseTo(whole.totalCredit, 2);
    });

    test(platform + ": the period entry is the sum of the branch entries", async () => {
      const period = stored(await analyzeFixture(platform));
      const whole = periodJournalEntry(period);
      for (const line of whole.lines) {
        const sum = period.branches.reduce((total, branch) => total + amount(branchJournalEntry(period, branch), line.account.key), 0);
        expect(line.debit - line.credit).toBeCloseTo(sum, 1);
      }
    });
  }

  test("HungerStation: revenue is net sales without VAT and charges are expenses", async () => {
    const period = stored(await analyzeFixture("hungerstation"));
    const branch = period.branches[0]!;
    const entry = branchJournalEntry(period, branch);
    expect(-amount(entry, "sales_revenue")).toBeCloseTo(branch.netSales, 2);
    expect(-amount(entry, "output_vat")).toBeCloseTo(branch.grossSales - branch.netSales, 2);
    expect(amount(entry, "commission_expense")).toBeCloseTo(branch.commission, 2);
    // The receivable is the balancing figure, so there is no settlement difference line.
    expect(amount(entry, "settlement_difference")).toBe(0);
  });

  test("Keeta: the receivable is the computed payable and the entry closes without a difference", async () => {
    const period = stored(await analyzeFixture("keeta"));
    for (const branch of period.branches) {
      const entry = branchJournalEntry(period, branch);
      expect(amount(entry, "platform_receivable")).toBeCloseTo(branch.netSales, 2);
      expect(Math.abs(amount(entry, "settlement_difference"))).toBeLessThan(0.05);
    }
  });
});

describe("chart of accounts", () => {
  test("saved codes and names override the defaults; blanks fall back", () => {
    const accounts = resolveJournalAccounts({
      sales_revenue: { code: "4101", name: "مبيعات التطبيقات" },
      output_vat: { code: "2301", name: "  " },
    });
    expect(accounts.sales_revenue).toEqual({ key: "sales_revenue", code: "4101", name: "مبيعات التطبيقات" });
    expect(accounts.output_vat.name).toBe(DEFAULT_JOURNAL_ACCOUNTS.output_vat.name);
    expect(accounts.output_vat.code).toBe("2301");
    expect(accounts.commission_expense).toEqual(DEFAULT_JOURNAL_ACCOUNTS.commission_expense);
  });
});
