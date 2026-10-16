import { afterEach, describe, expect, test } from "bun:test";

import { analyticFor, odooDatabase, odooMove, odooSite } from "./odoo";
import { odooAdapter } from "./odoo.server";
import type { SendableEntry } from "./sendable";

const accounts = [
  { id: 11, code: "1101" },
  { id: 12, code: "4101" },
  { id: 13, code: "2201" },
];

const entry: SendableEntry = {
  key: "hs:PAST - Uhud",
  reference: "TDQ-202609-01",
  description: "هنقرستيشن · سبتمبر 2026 · PAST - Uhud",
  date: "2026-09-30",
  costCenter: "CC-101",
  lines: [
    { code: "1101", name: "ذمم المنصة", debit: 1150.004, credit: 0, memo: "صافي المستحق" },
    { code: "4101", name: "إيراد المبيعات", debit: 0, credit: 1000, memo: "" },
    { code: "2201", name: "ضريبة المخرجات", debit: 0, credit: 150, memo: "" },
    { code: "", name: "سطر صفري", debit: 0, credit: 0, memo: "" },
  ],
};

describe("Odoo journal entries", () => {
  test("laid out like the Odoo export: reference and description on the entry, the analytic on every line", () => {
    expect(odooMove(entry, accounts, 7, 42)).toEqual({
      move_type: "entry",
      journal_id: 7,
      date: "2026-09-30",
      ref: "TDQ-202609-01 · هنقرستيشن · سبتمبر 2026 · PAST - Uhud",
      line_ids: [
        [0, 0, { account_id: 11, name: "صافي المستحق", debit: 1150, credit: 0, analytic_distribution: { "42": 100 } }],
        [0, 0, { account_id: 12, name: entry.description, debit: 0, credit: 1000, analytic_distribution: { "42": 100 } }],
        [0, 0, { account_id: 13, name: entry.description, debit: 0, credit: 150, analytic_distribution: { "42": 100 } }],
      ],
    });
    expect(odooMove(entry, accounts, 7, null).line_ids[0]![2]).not.toHaveProperty("analytic_distribution");
  });

  test("refuses an unbalanced entry", () => {
    expect(() => odooMove({ ...entry, lines: [entry.lines[0]!, entry.lines[1]!] }, accounts, 7, null)).toThrow("غير متوازن");
  });

  test("a cost center is the analytic account's code, or its number as in the Odoo export", () => {
    const analytics = [
      { id: 42, code: "CC-101" },
      { id: 43, code: null },
    ];
    expect(analyticFor("CC-101", analytics)).toBe(42);
    expect(analyticFor("43", analytics)).toBe(43);
    expect(analyticFor("", analytics)).toBeNull();
    expect(analyticFor("CC-999", analytics)).toBeUndefined();
  });
});

describe("Odoo address", () => {
  test("accepts Odoo Online and the customer's own domain, from a host or a link", () => {
    expect(odooSite("https://MyCompany.odoo.com/odoo/accounting?x=1")).toBe("mycompany.odoo.com");
    expect(odooSite("erp.mycompany.sa")).toBe("erp.mycompany.sa");
  });

  test("refuses plain http, numbers, ports and local names", () => {
    for (const bad of ["", "http://erp.mycompany.sa", "127.0.0.1", "10.0.0.5", "localhost", "erp.local", "erp.example.com:8069", "intranet", "a..b.com"]) {
      expect(() => odooSite(bad)).toThrow();
    }
  });

  test("the database defaults to the Odoo Online name", () => {
    expect(odooDatabase("mycompany.odoo.com", "")).toBe("mycompany");
    expect(odooDatabase("erp.mycompany.sa", "prod")).toBe("prod");
    expect(() => odooDatabase("erp.mycompany.sa", "")).toThrow();
    expect(() => odooDatabase("erp.mycompany.sa", "bad name;")).toThrow();
  });
});

/** A small fake Odoo: answers JSON-2 when `json2` is true, otherwise only JSON-RPC (as Odoo 16 to 18 do). */
function fakeOdoo(json2: boolean, failPost = false) {
  const calls: string[] = [];
  const handle = (model: string, method: string): unknown => {
    calls.push(`${model}.${method}`);
    if (model === "account.account") return [{ id: 11, code: "1101" }, { id: 12, code: "4101" }, { id: 13, code: "2201" }, { id: 14, code: false }];
    if (model === "account.journal") return [{ id: 3, code: "BNK1" }, { id: 7, code: "MISC" }];
    if (model === "account.analytic.account") return [{ id: 42, code: "CC-101" }];
    if (model === "account.move" && method === "create") return [501];
    if (model === "account.move" && method === "action_post") {
      if (failPost) throw new Error("lock date");
      return true;
    }
    return true;
  };
  const fetchImpl = async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    const body = JSON.parse(String(init?.body ?? "{}"));
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
    const v2 = /\/json\/2\/([^/]+)\/([^/]+)$/.exec(url);
    if (v2) {
      if (!json2) return json({ message: "not found" }, 404);
      if (v2[1] === "res.users") return json({ uid: 2 });
      try {
        return json(handle(v2[1]!, v2[2]!));
      } catch (error) {
        return json({ message: (error as Error).message }, 422);
      }
    }
    if (url.endsWith("/jsonrpc")) {
      const { service, method, args } = body.params;
      if (service === "common") return json({ result: args[2] === "key-123456" ? 2 : false });
      try {
        return json({ result: handle(args[3], args[4]) });
      } catch (error) {
        return json({ error: { data: { name: "odoo.exceptions.UserError", message: (error as Error).message } } });
      }
    }
    return json({}, 404);
  };
  return { calls, fetchImpl };
}

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const connection = () => ({ apiKey: JSON.stringify({ apiKey: "key-123456", database: "mycompany", login: "a@b.sa" }), site: "mycompany.odoo.com" });

describe("Odoo adapter", () => {
  for (const json2 of [true, false]) {
    test(`posts through ${json2 ? "JSON-2 (Odoo 19+)" : "JSON-RPC (Odoo 16-18)"} into MISC with the analytic account`, async () => {
      const fake = fakeOdoo(json2);
      globalThis.fetch = fake.fetchImpl as typeof fetch;
      const current = connection();
      const chart = await odooAdapter.accounts(current);
      expect(chart).toEqual(accounts);
      await odooAdapter.precheck!(current, [entry]);
      const posted = await odooAdapter.post(current, entry, chart);
      expect(posted).toEqual({ externalId: "501", total: 1150 });
      expect(fake.calls).toEqual(["account.account.search_read", "account.journal.search_read", "account.analytic.account.search_read", "account.move.create", "account.move.action_post"]);
    });
  }

  test("stops before posting when a cost center has no analytic account", async () => {
    globalThis.fetch = fakeOdoo(true).fetchImpl as typeof fetch;
    await expect(odooAdapter.precheck!(connection(), [{ ...entry, costCenter: "CC-999" }])).rejects.toThrow("CC-999");
  });

  test("a draft that cannot be posted is removed, so sending again does not duplicate it", async () => {
    const fake = fakeOdoo(true, true);
    globalThis.fetch = fake.fetchImpl as typeof fetch;
    const current = connection();
    await odooAdapter.precheck!(current, [entry]);
    await expect(odooAdapter.post(current, entry, accounts)).rejects.toThrow("lock date");
    expect(fake.calls.slice(-2)).toEqual(["account.move.action_post", "account.move.unlink"]);
  });

  test("a wrong key stops the send", async () => {
    globalThis.fetch = fakeOdoo(false).fetchImpl as typeof fetch;
    const wrong = { apiKey: JSON.stringify({ apiKey: "nope-000000", database: "mycompany", login: "a@b.sa" }), site: "mycompany.odoo.com" };
    await expect(odooAdapter.accounts(wrong)).rejects.toThrow("غير صالح");
  });
});
