import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import { classFor, parseQuickBooksCredentials, quickBooksAccountKeys, quickBooksChart, quickBooksJournal, quickBooksRealm } from "./quickbooks";
import { quickBooksAdapter } from "./quickbooks.server";
import { missingAccountCodes, type SendableEntry } from "./sendable";

const entry: SendableEntry = {
  key: "hs:PAST - Uhud",
  reference: "TDQ-202609-01",
  description: "هنقرستيشن · سبتمبر 2026 · PAST - Uhud",
  date: "2026-09-30",
  costCenter: "Uhud",
  lines: [
    { code: "1101", name: "ذمم المنصة", debit: 1150.004, credit: 0, memo: "صافي المستحق" },
    { code: "", name: "Sales", debit: 0, credit: 1000, memo: "" },
    { code: "2201", name: "ضريبة المخرجات", debit: 0, credit: 150, memo: "" },
    { code: "", name: "سطر صفري", debit: 0, credit: 0, memo: "" },
  ],
};

const qbAccounts = [
  { Id: "35", AcctNum: "1101", Name: "Platform receivable", Active: true },
  { Id: "79", Name: "Sales", FullyQualifiedName: "Sales", Active: true },
  { Id: "88", AcctNum: "2201", Name: "VAT payable", Active: true },
  { Id: "99", AcctNum: "9999", Name: "Old", Active: false },
];

describe("QuickBooks journal entries", () => {
  test("accounts by number when they have one, otherwise by name, as in the export", () => {
    const chart = quickBooksChart(qbAccounts);
    const [prepared] = quickBooksAccountKeys([entry]);
    expect(missingAccountCodes([prepared!], chart)).toEqual([]);
    expect(quickBooksJournal(prepared!, chart, "5")).toEqual({
      TxnDate: "2026-09-30",
      DocNumber: "TDQ-202609-01",
      PrivateNote: entry.description,
      Line: [
        { DetailType: "JournalEntryLineDetail", Amount: 1150, Description: `${entry.description} · صافي المستحق`, JournalEntryLineDetail: { PostingType: "Debit", AccountRef: { value: "35" }, ClassRef: { value: "5" } } },
        { DetailType: "JournalEntryLineDetail", Amount: 1000, Description: entry.description, JournalEntryLineDetail: { PostingType: "Credit", AccountRef: { value: "79" }, ClassRef: { value: "5" } } },
        { DetailType: "JournalEntryLineDetail", Amount: 150, Description: entry.description, JournalEntryLineDetail: { PostingType: "Credit", AccountRef: { value: "88" }, ClassRef: { value: "5" } } },
      ],
    });
  });

  test("an inactive account does not match, and an unbalanced entry is refused", () => {
    expect(missingAccountCodes(quickBooksAccountKeys([{ ...entry, lines: [{ ...entry.lines[0]!, code: "9999" }] }]), quickBooksChart(qbAccounts))).toEqual(["9999"]);
    expect(() => quickBooksJournal({ ...entry, lines: [entry.lines[0]!, entry.lines[2]!] }, quickBooksChart(qbAccounts), null)).toThrow("غير متوازن");
  });

  test("cost centers are Classes by name; company ids are digits only", () => {
    expect(classFor("Uhud", [{ Id: "5", Name: "Uhud" }])).toBe("5");
    expect(classFor("", [])).toBeNull();
    expect(classFor("Malqa", [{ Id: "5", Name: "Uhud" }])).toBeUndefined();
    expect(quickBooksRealm("9130350000000000")).toBe("9130350000000000");
    expect(quickBooksRealm("91303/../x")).toBeNull();
    expect(() => parseQuickBooksCredentials(JSON.stringify({ refreshToken: "r", realmId: "1", environment: "other" }))).toThrow();
  });
});

describe("QuickBooks adapter", () => {
  const realFetch = globalThis.fetch;
  const env = { ...process.env };
  beforeEach(() => {
    process.env["QUICKBOOKS_CLIENT_ID"] = "client";
    process.env["QUICKBOOKS_CLIENT_SECRET"] = "secret";
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
    process.env = { ...env };
  });

  test("saves the new refresh token before posting, and posts with the Class", async () => {
    const calls: string[] = [];
    let posted: unknown;
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      const url = String(input);
      const json = (data: unknown) => new Response(JSON.stringify(data), { status: 200, headers: { "Content-Type": "application/json" } });
      if (url.includes("/oauth2/v1/tokens/bearer")) {
        calls.push("token");
        expect(String(init?.body)).toContain("refresh_token=old-refresh");
        return json({ access_token: "access", refresh_token: "new-refresh" });
      }
      const query = new URL(url).searchParams.get("query") ?? "";
      if (query.includes("from Account")) return json({ QueryResponse: { Account: qbAccounts } });
      if (query.includes("from Class")) return json({ QueryResponse: { Class: [{ Id: "5", Name: "Uhud" }] } });
      if (url.includes("/journalentry")) {
        posted = JSON.parse(String(init?.body));
        return json({ JournalEntry: { Id: "146" } });
      }
      return new Response("{}", { status: 404 });
    }) as typeof fetch;

    const saved: string[] = [];
    const connection = {
      apiKey: JSON.stringify({ refreshToken: "old-refresh", realmId: "9130350000000000", environment: "sandbox" }),
      site: null,
      saveSecret: async (secret: string) => {
        saved.push(secret);
        calls.push("save");
      },
    };
    const prepared = quickBooksAdapter.prepare!([entry]);
    const chart = await quickBooksAdapter.accounts(connection);
    await quickBooksAdapter.precheck!(connection, prepared);
    const result = await quickBooksAdapter.post(connection, prepared[0]!, chart);

    expect(result).toEqual({ externalId: "146", total: 1150 });
    expect(calls.slice(0, 2)).toEqual(["token", "save"]);
    expect(calls.filter((call) => call === "token")).toHaveLength(1);
    expect(JSON.parse(saved[0]!).refreshToken).toBe("new-refresh");
    expect((posted as { Line: Array<{ JournalEntryLineDetail: { ClassRef?: { value: string } } }> }).Line[0]!.JournalEntryLineDetail.ClassRef).toEqual({ value: "5" });
  });

  test("an expired connection stops the send", async () => {
    globalThis.fetch = (async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })) as typeof fetch;
    const connection = { apiKey: JSON.stringify({ refreshToken: "dead", realmId: "1", environment: "production" }), site: null };
    await expect(quickBooksAdapter.accounts(connection)).rejects.toThrow("انتهى ربط");
  });
});
