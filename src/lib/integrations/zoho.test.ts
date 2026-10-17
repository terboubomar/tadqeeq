import { describe, expect, test } from "bun:test";

import { signState, verifyState } from "./secret-box.server";
import type { SendableEntry } from "./sendable";
import { parseZohoCredentials, zohoAccountsServer, zohoApiDomain, zohoJournal, zohoTagFor, zohoTagOptions } from "./zoho";

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

  test("the branch's cost center goes as its reporting tag option on every line", () => {
    const tag = { tagId: "4600001", optionId: "4600011", name: "Uhud" };
    const lines = zohoJournal(entry, accounts, tag).line_items;
    expect(lines).toHaveLength(3);
    for (const line of lines) expect(line.tags).toEqual([{ tag_id: "4600001", tag_option_id: "4600011" }]);
    expect(zohoJournal(entry, accounts).line_items[0]).not.toHaveProperty("tags");
  });

  test("refuses an unbalanced entry", () => {
    expect(() => zohoJournal({ ...entry, lines: [entry.lines[0]!, entry.lines[1]!] }, accounts)).toThrow("غير متوازن");
  });
});

describe("Zoho reporting tags as cost centers", () => {
  const options = zohoTagOptions("4600001", [
    { option_id: "11", option_name: "Uhud ", is_active: true, children: [{ option_id: "12", option_name: "Uhud - Drive", is_active: true }] },
    { option_id: "13", option_name: "Olaya", is_active: false },
  ]);

  test("reads active options, children included", () => {
    expect(options).toEqual([
      { tagId: "4600001", optionId: "11", name: "Uhud" },
      { tagId: "4600001", optionId: "12", name: "Uhud - Drive" },
    ]);
  });

  test("matches the cost center by option name, ignoring case", () => {
    expect(zohoTagFor(" uhud", options)?.optionId).toBe("11");
    expect(zohoTagFor("Uhud - Drive", options)?.optionId).toBe("12");
    expect(zohoTagFor("Olaya", options)).toBeUndefined();
    expect(zohoTagFor("", options)).toBeNull();
    expect(zohoTagFor(undefined, options)).toBeNull();
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
