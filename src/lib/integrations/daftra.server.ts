import { requestJson, type Connection, type ProviderAdapter } from "./http.server";
import { daftraJournal } from "./daftra";
import type { ChartAccount } from "./sendable";

/**
 * Daftra (https://docs.daftara.dev): the API key comes from Settings › API in Daftra and goes in the apikey header;
 * the API lives on the account's own site (https://mystore.daftra.com/api2). Journals are posted to POST /journals.
 */
const NAME = "دفترة";

function base(connection: Connection): string {
  if (!connection.site) throw new Error("عنوان موقع دفترة غير محفوظ. اربط دفترة من جديد.");
  return `https://${connection.site}/api2`;
}

const headers = (apiKey: string) => ({ apikey: apiKey });

interface AccountsPage {
  data?: Array<{ JournalAccount?: { id?: number | string; code?: string | null } }>;
  pagination?: { page_count?: number };
}

export const daftraAdapter: ProviderAdapter = {
  name: NAME,
  /** Every journal account (the chart's leaf accounts), page by page. */
  async accounts(connection) {
    const byId = new Map<number, ChartAccount>();
    for (let page = 1; page <= 50; page++) {
      const data = await requestJson<AccountsPage>(NAME, `${base(connection)}/journal_accounts.json?page=${page}&limit=100`, headers(connection.apiKey));
      const before = byId.size;
      for (const row of data.data ?? []) {
        const id = Number(row.JournalAccount?.id);
        const code = row.JournalAccount?.code;
        if (Number.isInteger(id) && code) byId.set(id, { id, code: String(code) });
      }
      if (byId.size === before || page >= (data.pagination?.page_count ?? 1)) break;
    }
    return [...byId.values()];
  },
  async post(connection, entry, accounts) {
    const payload = daftraJournal(entry, accounts);
    const created = await requestJson<{ result?: string; id?: number | string; message?: string }>(
      NAME,
      `${base(connection)}/journals.json`,
      headers(connection.apiKey),
      { method: "POST", body: payload },
    );
    if (created.result && created.result !== "successful") {
      throw new Error(`رفض دفترة القيد${created.message ? ": " + String(created.message).slice(0, 200) : "."}`);
    }
    return {
      externalId: String(created.id ?? "unknown"),
      total: payload.Journal.JournalTransaction.reduce((sum, line) => sum + line.currency_debit, 0),
    };
  },
};
