import type { ChartAccount, SendableEntry } from "./sendable";

export interface Connection {
  apiKey: string;
  site: string | null;
  /** Replaces the saved secret, for systems whose refresh token changes each time it is used (QuickBooks). */
  saveSecret?: (secret: string) => Promise<void>;
}

/** What each system needs: its chart of accounts, and posting one entry (returning the new journal's id). */
export interface ProviderAdapter {
  name: string;
  accounts(connection: Connection): Promise<ChartAccount[]>;
  post(connection: Connection, entry: SendableEntry, accounts: ChartAccount[]): Promise<{ externalId: string; total: number }>;
  /** Checks that apply to the whole send (e.g. cost centers the system does not have); throws to stop before posting. */
  precheck?(connection: Connection, entries: SendableEntry[]): Promise<void>;
  /** Adjusts the entries before accounts are matched (QuickBooks names accounts without a number by their name). */
  prepare?(entries: SendableEntry[]): SendableEntry[];
}

/** An error that will fail every remaining entry the same way (bad key, system unreachable, rate limit). */
export class SyncStop extends Error {}

/** A JSON request to an accounting system, with the errors people can act on. */
export async function requestJson<T>(name: string, url: string, headers: Record<string, string>, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      method: init.method ?? "GET",
      headers: { ...headers, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new SyncStop(`تعذّر الوصول إلى ${name}. حاول بعد قليل.`);
  }
  if (response.status === 401 || response.status === 403) throw new SyncStop(`مفتاح ${name} غير صالح أو أُلغي. أنشئ مفتاحاً جديداً واربط من جديد.`);
  if (response.status === 429) throw new SyncStop(`${name} طلب التمهّل. حاول بعد دقيقة.`);
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(`رفض ${name} الطلب (${response.status})${detail ? ": " + detail : ""}`);
  }
  return (await response.json()) as T;
}
