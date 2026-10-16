import { describe, expect, test } from "bun:test";

import { daftraJournal, daftraSite } from "./daftra";
import type { SendableEntry } from "./sendable";

const accounts = [
  { id: 125, code: "1101" },
  { id: 373, code: "4101" },
  { id: 374, code: "2201" },
];

const entry: SendableEntry = {
  key: "hs:PAST - Uhud",
  reference: "TDQ-202609-01",
  description: "هنقرستيشن · سبتمبر 2026 · PAST - Uhud",
  date: "2026-09-30",
  lines: [
    { code: "1101", name: "ذمم المنصة", debit: 1150.004, credit: 0, memo: "صافي المستحق" },
    { code: "4101", name: "إيراد المبيعات", debit: 0, credit: 1000, memo: "" },
    { code: "2201", name: "ضريبة المخرجات", debit: 0, credit: 150, memo: "" },
    { code: "", name: "سطر صفري", debit: 0, credit: 0, memo: "" },
  ],
};

describe("Daftra journals", () => {
  test("maps codes to Daftra account ids in SAR, rounds to halalas and puts the reference in the description", () => {
    expect(daftraJournal(entry, accounts)).toEqual({
      Journal: {
        date: "2026-09-30",
        description: "هنقرستيشن · سبتمبر 2026 · PAST - Uhud · TDQ-202609-01",
        currency_code: "SAR",
        draft: 0,
        JournalTransaction: [
          { journal_account_id: 125, currency_debit: 1150, currency_credit: 0, description: "صافي المستحق" },
          { journal_account_id: 373, currency_debit: 0, currency_credit: 1000 },
          { journal_account_id: 374, currency_debit: 0, currency_credit: 150 },
        ],
      },
    });
  });

  test("refuses an unbalanced entry and an unknown code", () => {
    expect(() => daftraJournal({ ...entry, lines: [entry.lines[0]!, entry.lines[1]!] }, accounts)).toThrow("غير متوازن");
    expect(() => daftraJournal(entry, accounts.slice(0, 2))).toThrow("2201");
  });
});

describe("Daftra site", () => {
  test("accepts a subdomain, a host or a link to any page", () => {
    expect(daftraSite("mystore")).toBe("mystore.daftra.com");
    expect(daftraSite(" MyStore.Daftra.com ")).toBe("mystore.daftra.com");
    expect(daftraSite("https://mystore.daftra.com/owner/journals/index?x=1")).toBe("mystore.daftra.com");
    expect(daftraSite("mystore.daftara.com")).toBe("mystore.daftara.com");
  });

  test("never accepts a host outside Daftra", () => {
    for (const bad of ["", "evil.com", "mystore.daftra.com.evil.com", "a.b.daftra.com", "https://evil.com/mystore.daftra.com", "my_store.daftra.com", "127.0.0.1"]) {
      expect(() => daftraSite(bad)).toThrow();
    }
  });
});
