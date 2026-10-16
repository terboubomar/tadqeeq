import { describe, expect, test } from "bun:test";

import { missingAccountCodes, qoyodJournalEntry, type SendableEntry } from "./qoyod";
import { openSecret, sealSecret } from "./secret-box.server";

const accounts = [
  { id: 13, code: "1101" },
  { id: 21, code: "4101" },
  { id: 22, code: "2201" },
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

describe("Qoyod journal entries", () => {
  test("maps codes to Qoyod account ids, rounds to halalas and puts the reference in the description", () => {
    expect(qoyodJournalEntry(entry, accounts)).toEqual({
      description: "هنقرستيشن · سبتمبر 2026 · PAST - Uhud · TDQ-202609-01",
      date: "2026-09-30",
      debit_amounts: [{ account_id: 13, amount: 1150, comment: "صافي المستحق" }],
      credit_amounts: [
        { account_id: 21, amount: 1000 },
        { account_id: 22, amount: 150 },
      ],
    });
  });

  test("lists codes Qoyod does not have, ignoring zero lines", () => {
    expect(missingAccountCodes([entry], accounts)).toEqual([]);
    expect(missingAccountCodes([entry], accounts.slice(0, 2))).toEqual(["2201"]);
    const noCode = { ...entry, lines: [{ ...entry.lines[0]!, code: "" }, entry.lines[1]!] };
    expect(missingAccountCodes([noCode], accounts)).toEqual(["ذمم المنصة"]);
  });

  test("refuses an entry whose debits and credits differ", () => {
    const unbalanced = { ...entry, lines: [entry.lines[0]!, entry.lines[1]!] };
    expect(() => qoyodJournalEntry(unbalanced, accounts)).toThrow("غير متوازن");
  });
});

describe("secret box", () => {
  const secret = "x".repeat(40);
  test("seals and opens a key, and a different secret cannot open it", () => {
    const sealed = sealSecret("qoyod-api-key-1234", secret);
    expect(sealed.startsWith("v1.")).toBe(true);
    expect(sealed).not.toContain("qoyod-api-key");
    expect(openSecret(sealed, secret)).toBe("qoyod-api-key-1234");
    expect(() => openSecret(sealed, "y".repeat(40))).toThrow();
  });

  test("refuses to work without a long enough server secret", () => {
    expect(() => sealSecret("k", "short")).toThrow("INTEGRATIONS_ENCRYPTION_KEY");
  });
});
