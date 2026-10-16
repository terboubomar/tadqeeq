import { requestJson, type ProviderAdapter } from "./http.server";
import { qoyodJournalEntry, type QoyodAccount } from "./qoyod";

/**
 * Qoyod (https://apidoc.qoyod.com): the API key comes from Qoyod's General Settings and goes in the API-KEY header.
 * Entries are posted to POST /2.0/journal_entries.
 */
const QOYOD_API = "https://api.qoyod.com/2.0";
const NAME = "قيود";

const headers = (apiKey: string) => ({ "API-KEY": apiKey });

export const qoyodAdapter: ProviderAdapter = {
  name: NAME,
  /** Every account in the Qoyod chart, following pages until one adds nothing new. */
  async accounts({ apiKey }) {
    const byId = new Map<number, QoyodAccount>();
    for (let page = 1; page <= 20; page++) {
      const data = await requestJson<{ accounts?: Array<{ id: number; code: string | null }> }>(NAME, `${QOYOD_API}/accounts?page=${page}`, headers(apiKey));
      const before = byId.size;
      for (const account of data.accounts ?? []) {
        if (typeof account.id === "number" && account.code) byId.set(account.id, { id: account.id, code: String(account.code) });
      }
      if (byId.size === before) break;
    }
    return [...byId.values()];
  },
  async post({ apiKey }, entry, accounts) {
    const payload = qoyodJournalEntry(entry, accounts);
    const created = await requestJson<{ id?: number; journal_entry?: { id?: number } }>(NAME, `${QOYOD_API}/journal_entries`, headers(apiKey), {
      method: "POST",
      body: { journal_entry: payload },
    });
    return {
      externalId: String(created.id ?? created.journal_entry?.id ?? "unknown"),
      total: payload.debit_amounts.reduce((sum, line) => sum + line.amount, 0),
    };
  },
};
