import { describe, expect, test } from "bun:test";

import type { JournalEntry } from "@/lib/journal-entries";

import { dayFirst, entryReference, odooRows, qoyodRows, quickBooksRows, zohoRows, daftraRows, missingCodes } from "./accounting-formats";

const account = (key: string, code: string, name: string) => ({ key, code, name }) as JournalEntry["lines"][number]["account"];

const entry: JournalEntry = {
  description: "هنقرستيشن · HS Sept · فرع الشمال",
  date: "2026-09-30",
  lines: [
    { account: account("platform_receivable", "1201", "ذمم هنقرستيشن"), debit: 900, credit: 0, memo: "صافي" },
    { account: account("commission_expense", "", "مصروف العمولة"), debit: 100, credit: 0, memo: "عمولة" },
    { account: account("sales_revenue", "4101", "إيراد"), debit: 0, credit: 1000, memo: "" },
  ],
  totalDebit: 1000,
  totalCredit: 1000,
  notes: [],
};
const journals = [{ branch: "فرع الشمال", entry, number: 3 }];

describe("journal export layouts", () => {
  test("references and dates", () => {
    expect(entryReference(entry, 3)).toBe("TDQ-202609-03");
    expect(dayFirst("2026-09-30")).toBe("30/09/2026");
  });

  test("Odoo: journal, reference and date on the first line of the entry only; accounts by code, else name", () => {
    const rows = odooRows(journals);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({ journal: "MISC", date: "2026-09-30", account: "1201", debit: 900 });
    expect(rows[1]).toMatchObject({ journal: "", ref: "", date: "", account: "مصروف العمولة", debit: 100 });
    expect(rows[2]).toMatchObject({ account: "4101", credit: 1000, debit: undefined });
  });

  test("Zoho and QuickBooks: every row carries the entry's reference and date", () => {
    expect(zohoRows(journals).every((row) => row.ref === "TDQ-202609-03" && row.date === "2026-09-30" && row.currency === "SAR")).toBe(true);
    expect(quickBooksRows(journals).every((row) => row.no === "TDQ-202609-03" && row.date === "30/09/2026")).toBe(true);
  });

  test("Qoyod: date and description on the first row, G/L account type, an empty row after each entry", () => {
    const rows = qoyodRows(journals);
    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({ seq: "3", date: "30/09/2026", description: entry.description, type: "G/L Accounts", code: "1201" });
    expect(rows[1]).toMatchObject({ date: "", description: "" });
    expect(rows[3]).toMatchObject({ seq: "", code: "" });
  });

  test("Daftra: account, description, debit, credit", () => {
    expect(daftraRows(entry)[0]).toEqual({ account: "1201", description: entry.description + " · صافي", debit: 900, credit: undefined });
  });

  test("debits equal credits in every layout", () => {
    const sum = (rows: Array<{ debit?: number; credit?: number }>) =>
      rows.reduce((total, row) => total + (row.debit ?? 0) - (row.credit ?? 0), 0);
    for (const rows of [odooRows(journals), zohoRows(journals), quickBooksRows(journals), qoyodRows(journals), daftraRows(entry)]) {
      expect(sum(rows)).toBeCloseTo(0, 2);
    }
  });

  test("flags accounts without a code", () => {
    expect(missingCodes(journals)).toBe(true);
  });
});
