import { describe, expect, test } from "bun:test";

import { signState, verifyState } from "./secret-box.server";
import type { SendableEntry } from "./sendable";
import { parseZohoCredentials, zohoAccountsServer, zohoApiDomain, zohoJournal } from "./zoho";

const accounts = [
  { id: "460000000000361", code: "1101" },
  { id: "460000000000362", code: "4101" },
  { id: "460000000000363", code: "2201" },
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

describe("Zoho Books journals", () => {
  test("one line per side, the reference in its own field, rounded to halalas", () => {
    expect(zohoJournal(entry, accounts)).toEqual({
      journal_date: "2026-09-30",
      reference_number: "TDQ-202609-01",
      notes: "هنقرستيشن · سبتمبر 2026 · PAST - Uhud",
      status: "published",
      line_items: [
        { account_id: "460000000000361", debit_or_credit: "debit", amount: 1150, description: "صافي المستحق" },
        { account_id: "460000000000362", debit_or_credit: "credit", amount: 1000 },
        { account_id: "460000000000363", debit_or_credit: "credit", amount: 150 },
      ],
    });
  });

  test("refuses an unbalanced entry", () => {
    expect(() => zohoJournal({ ...entry, lines: [entry.lines[0]!, entry.lines[1]!] }, accounts)).toThrow("غير متوازن");
  });
});

describe("Zoho data centers", () => {
  test("accepts only Zoho's own accounts servers and API domains", () => {
    expect(zohoAccountsServer("https://accounts.zoho.sa")).toBe("https://accounts.zoho.sa");
    expect(zohoAccountsServer("https://accounts.zoho.com/")).toBe("https://accounts.zoho.com");
    expect(zohoApiDomain("https://www.zohoapis.sa")).toBe("https://www.zohoapis.sa");
    for (const bad of ["https://accounts.zoho.sa.evil.com", "http://accounts.zoho.sa", "https://evil.com", "", null]) {
      expect(zohoAccountsServer(bad)).toBeNull();
      expect(zohoApiDomain(bad)).toBeNull();
    }
  });

  test("saved credentials must point at Zoho", () => {
    const good = { refreshToken: "1000.x", accountsServer: "https://accounts.zoho.sa", apiDomain: "https://www.zohoapis.sa", organizationId: "123" };
    expect(parseZohoCredentials(JSON.stringify(good))).toEqual(good);
    expect(() => parseZohoCredentials(JSON.stringify({ ...good, apiDomain: "https://evil.com" }))).toThrow();
  });
});

describe("signed state", () => {
  const secret = "s".repeat(40);
  test("round-trips, and any change or another secret is refused", () => {
    const state = signState({ w: "ws", u: "user", e: 123 }, secret);
    expect(verifyState(state, secret)).toEqual({ w: "ws", u: "user", e: 123 });
    expect(verifyState(state, "t".repeat(40))).toBeNull();
    const [body, mac] = state.split(".");
    const forged = Buffer.from(JSON.stringify({ w: "other", u: "user", e: 123 })).toString("base64url");
    expect(verifyState(`${forged}.${mac}`, secret)).toBeNull();
    expect(verifyState(`${body}`, secret)).toBeNull();
  });
});
