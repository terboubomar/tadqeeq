import { requestJson, SyncStop, type Connection, type ProviderAdapter } from "./http.server";
import type { ChartAccount, SendableEntry } from "./sendable";
import {
  classFor,
  parseQuickBooksCredentials,
  QUICKBOOKS_TOKEN_URL,
  quickBooksAccountKeys,
  quickBooksApiBase,
  quickBooksChart,
  quickBooksJournal,
  quickBooksPartiesNeeded,
  quickBooksPlatformName,
  quickBooksQueryValue,
  type QuickBooksCredentials,
  type QuickBooksEnvironment,
} from "./quickbooks";

/**
 * QuickBooks Online: the connection keeps a refresh token (sealed). Each send swaps it for an hour-long access token;
 * Intuit answers with a new refresh token, which is saved straight away, since the old one stops working.
 */
const NAME = "QuickBooks";
const MINOR_VERSION = "75";
const EXPIRED = `انتهى ربط ${NAME} أو أُلغي. اربطه من جديد من صفحة التكاملات.`;

export function quickBooksClient(): { clientId: string; clientSecret: string; redirectUri: string; environment: QuickBooksEnvironment } {
  const clientId = process.env["QUICKBOOKS_CLIENT_ID"]?.trim();
  const clientSecret = process.env["QUICKBOOKS_CLIENT_SECRET"]?.trim();
  if (!clientId || !clientSecret) {
    throw new Error("ربط QuickBooks غير مفعّل بعد: أضف QUICKBOOKS_CLIENT_ID و QUICKBOOKS_CLIENT_SECRET إلى أسرار الخادم.");
  }
  return {
    clientId,
    clientSecret,
    redirectUri: process.env["QUICKBOOKS_REDIRECT_URI"]?.trim() || "https://tadqeeq.app/integrations",
    environment: process.env["QUICKBOOKS_ENVIRONMENT"]?.trim() === "sandbox" ? "sandbox" : "production",
  };
}

/** A token request to Intuit (client id and secret as basic authentication). */
export async function quickBooksTokenRequest(params: Record<string, string>): Promise<Record<string, string | number | undefined>> {
  const { clientId, clientSecret } = quickBooksClient();
  let response: Response;
  try {
    response = await fetch(QUICKBOOKS_TOKEN_URL, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new SyncStop(`تعذّر الوصول إلى ${NAME}. حاول بعد قليل.`);
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, string | number | undefined>;
  if (!response.ok || data["error"] || !data["access_token"]) throw new SyncStop(EXPIRED);
  return data;
}

export const quickBooksAuthHeader = (token: string) => ({ Authorization: `Bearer ${token}` });

export function quickBooksCompanyUrl(credentials: Pick<QuickBooksCredentials, "realmId" | "environment">, path: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${quickBooksApiBase(credentials.environment)}/v3/company/${credentials.realmId}/${path}${separator}minorversion=${MINOR_VERSION}`;
}

interface Session {
  credentials: QuickBooksCredentials;
  token: string;
  classes?: Array<{ Id: string; Name?: string; FullyQualifiedName?: string }>;
  /** Customer and vendor ids by "Customer:HungerStation" / "Vendor:HungerStation", for this send. */
  parties: Map<string, Promise<string>>;
}

const sessions = new WeakMap<Connection, Promise<Session>>();

/** One access token per send; the new refresh token is saved before anything else happens. */
function session(connection: Connection): Promise<Session> {
  let current = sessions.get(connection);
  if (!current) {
    current = (async () => {
      const credentials = parseQuickBooksCredentials(connection.apiKey);
      const data = await quickBooksTokenRequest({ grant_type: "refresh_token", refresh_token: credentials.refreshToken });
      const refreshToken = typeof data["refresh_token"] === "string" ? data["refresh_token"] : credentials.refreshToken;
      if (refreshToken !== credentials.refreshToken) {
        const next = { ...credentials, refreshToken };
        await connection.saveSecret?.(JSON.stringify(next));
        connection.apiKey = JSON.stringify(next);
        return { credentials: next, token: String(data["access_token"]), parties: new Map() };
      }
      return { credentials, token: String(data["access_token"]), parties: new Map() };
    })();
    sessions.set(connection, current);
  }
  return current;
}

/** Every row of a QuickBooks query, 1000 at a time. */
async function queryAll<T>(current: Session, entity: string): Promise<T[]> {
  const rows: T[] = [];
  for (let start = 1; start <= 20_000; start += 1000) {
    const query = encodeURIComponent(`select * from ${entity} STARTPOSITION ${start} MAXRESULTS 1000`);
    const data = await requestJson<{ QueryResponse?: Record<string, T[] | undefined> }>(NAME, quickBooksCompanyUrl(current.credentials, `query?query=${query}`), quickBooksAuthHeader(current.token));
    const page = data.QueryResponse?.[entity] ?? [];
    rows.push(...page);
    if (page.length < 1000) break;
  }
  return rows;
}

async function classes(current: Session) {
  current.classes ??= await queryAll<{ Id: string; Name?: string; FullyQualifiedName?: string }>(current, "Class");
  return current.classes;
}

/** The id of the customer or vendor with this display name, created when the company does not have one yet. */
async function partyId(current: Session, kind: "Customer" | "Vendor", name: string): Promise<string> {
  const key = `${kind}:${name}`;
  let pending = current.parties.get(key);
  if (!pending) {
    pending = (async () => {
      const query = encodeURIComponent(`select * from ${kind} where DisplayName = '${quickBooksQueryValue(name)}'`);
      const found = await requestJson<{ QueryResponse?: Record<string, Array<{ Id?: string }> | undefined> }>(
        NAME,
        quickBooksCompanyUrl(current.credentials, `query?query=${query}`),
        quickBooksAuthHeader(current.token),
      );
      const existing = found.QueryResponse?.[kind]?.[0]?.Id;
      if (existing) return existing;
      const created = await requestJson<Record<string, { Id?: string } | undefined>>(
        NAME,
        quickBooksCompanyUrl(current.credentials, kind.toLowerCase()),
        quickBooksAuthHeader(current.token),
        { method: "POST", body: { DisplayName: name } },
      );
      const id = created[kind]?.Id;
      if (!id) throw new Error(`تعذّر إنشاء «${name}» في ${NAME}.`);
      return id;
    })();
    current.parties.set(key, pending);
    pending.catch(() => current.parties.delete(key));
  }
  return pending;
}

/**
 * The platform as a customer (Accounts Receivable lines) and a vendor (Accounts Payable lines). QuickBooks keeps one
 * name across customers and vendors, so the vendor is "<platform> (Vendor)" when the plain name is already taken.
 */
async function partiesFor(current: Session, entry: SendableEntry, accounts: ChartAccount[]): Promise<{ customerId?: string; vendorId?: string }> {
  const needed = quickBooksPartiesNeeded(entry, accounts);
  const name = quickBooksPlatformName(entry.platform);
  const parties: { customerId?: string; vendorId?: string } = {};
  if (needed.customer) parties.customerId = await partyId(current, "Customer", name);
  if (needed.vendor) {
    parties.vendorId = await partyId(current, "Vendor", name).catch(() => partyId(current, "Vendor", `${name} (Vendor)`));
  }
  return parties;
}

export const quickBooksAdapter: ProviderAdapter = {
  name: NAME,
  prepare: quickBooksAccountKeys,
  async accounts(connection) {
    const current = await session(connection);
    return quickBooksChart(await queryAll(current, "Account"));
  },
  async precheck(connection, entries) {
    const current = await session(connection);
    if (!entries.some((entry) => entry.costCenter?.trim())) return;
    const known = await classes(current);
    const missing = [...new Set(entries.filter((entry) => classFor(entry.costCenter, known) === undefined).map((entry) => entry.costCenter!.trim()))];
    if (missing.length) {
      throw new Error(`مراكز التكلفة هذه بلا Class في ${NAME}: ${missing.slice(0, 6).join("، ")}. أنشئها في QuickBooks أو صحّح «مراكز التكلفة» ثم أرسل.`);
    }
  },
  async post(connection, entry, accounts) {
    const current = await session(connection);
    const classId = entry.costCenter?.trim() ? (classFor(entry.costCenter, await classes(current)) ?? null) : null;
    const payload = quickBooksJournal(entry, accounts, classId, await partiesFor(current, entry, accounts));
    const created = await requestJson<{ JournalEntry?: { Id?: string } }>(NAME, quickBooksCompanyUrl(current.credentials, "journalentry"), quickBooksAuthHeader(current.token), {
      method: "POST",
      body: payload,
    });
    return {
      externalId: String(created.JournalEntry?.Id ?? "unknown"),
      total: payload.Line.filter((line) => line.JournalEntryLineDetail.PostingType === "Debit").reduce((sum, line) => sum + line.Amount, 0),
    };
  },
};
