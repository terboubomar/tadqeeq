import { requestJson, SyncStop, type Connection, type ProviderAdapter } from "./http.server";
import type { ChartAccount } from "./sendable";
import { parseZohoCredentials, zohoJournal, zohoTagFor, zohoTagOptions, type ZohoCredentials, type ZohoTagOption } from "./zoho";

/**
 * Zoho Books: the connection keeps a refresh token (sealed), which is exchanged for an hour-long access token at the
 * account's own Zoho data center. One access token is reused for a whole send, since Zoho limits how often they are
 * issued.
 */
const NAME = "Zoho Books";

export function zohoClient(): { clientId: string; clientSecret: string; redirectUri: string } {
  const clientId = process.env["ZOHO_CLIENT_ID"]?.trim();
  const clientSecret = process.env["ZOHO_CLIENT_SECRET"]?.trim();
  if (!clientId || !clientSecret) throw new Error("ربط Zoho Books غير مفعّل بعد: أضف ZOHO_CLIENT_ID و ZOHO_CLIENT_SECRET إلى أسرار الخادم.");
  return { clientId, clientSecret, redirectUri: process.env["ZOHO_REDIRECT_URI"]?.trim() || "https://tadqeeq.app/integrations" };
}

/** Posts a token request to the account's Zoho data center. */
export async function zohoTokenRequest(accountsServer: string, params: Record<string, string>): Promise<Record<string, string | undefined>> {
  let response: Response;
  try {
    response = await fetch(`${accountsServer}/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body: new URLSearchParams(params).toString(),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    throw new SyncStop(`تعذّر الوصول إلى ${NAME}. حاول بعد قليل.`);
  }
  const data = (await response.json().catch(() => ({}))) as Record<string, string | undefined>;
  if (!response.ok || data["error"]) {
    throw new SyncStop(`انتهى ربط ${NAME} أو أُلغي. اربطه من جديد من صفحة التكاملات.`);
  }
  return data;
}

const sessions = new WeakMap<Connection, Promise<{ credentials: ZohoCredentials; token: string }>>();

/** The credentials and a fresh access token for this send (one per send). */
function session(connection: Connection) {
  let current = sessions.get(connection);
  if (!current) {
    current = (async () => {
      const credentials = parseZohoCredentials(connection.apiKey);
      const { clientId, clientSecret } = zohoClient();
      const data = await zohoTokenRequest(credentials.accountsServer, {
        refresh_token: credentials.refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      });
      if (!data["access_token"]) throw new SyncStop(`انتهى ربط ${NAME} أو أُلغي. اربطه من جديد من صفحة التكاملات.`);
      return { credentials, token: data["access_token"] };
    })();
    sessions.set(connection, current);
  }
  return current;
}

export const zohoAuthHeader = (token: string) => ({ Authorization: `Zoho-oauthtoken ${token}` });

interface AccountsPage {
  chartofaccounts?: Array<{ account_id?: string | number; account_code?: string | null; is_active?: boolean }>;
  page_context?: { has_more_page?: boolean };
}

const tagCache = new WeakMap<Connection, Promise<ZohoTagOption[]>>();

/** Every active reporting tag's active options, read once per send (the cost centers are matched against them). */
function tagOptions(connection: Connection): Promise<ZohoTagOption[]> {
  let current = tagCache.get(connection);
  if (!current) {
    current = (async () => {
      const { credentials, token } = await session(connection);
      const org = `organization_id=${encodeURIComponent(credentials.organizationId)}`;
      const list = await requestJson<{ reporting_tags?: Array<{ tag_id?: string; is_active?: boolean; is_draft?: boolean }> }>(
        NAME,
        `${credentials.apiDomain}/books/v3/reportingtags?${org}`,
        zohoAuthHeader(token),
      );
      const options: ZohoTagOption[] = [];
      for (const tag of list.reporting_tags ?? []) {
        if (!tag.tag_id || tag.is_active === false || tag.is_draft) continue;
        const data = await requestJson<{ options?: Parameters<typeof zohoTagOptions>[1] }>(
          NAME,
          `${credentials.apiDomain}/books/v3/reportingtags/options?${org}&tag_id=${encodeURIComponent(tag.tag_id)}`,
          zohoAuthHeader(token),
        );
        options.push(...zohoTagOptions(String(tag.tag_id), data.options));
      }
      return options;
    })();
    tagCache.set(connection, current);
  }
  return current;
}

export const zohoAdapter: ProviderAdapter = {
  name: NAME,
  async accounts(connection) {
    const { credentials, token } = await session(connection);
    const byId = new Map<string, ChartAccount>();
    for (let page = 1; page <= 50; page++) {
      const url = `${credentials.apiDomain}/books/v3/chartofaccounts?organization_id=${encodeURIComponent(credentials.organizationId)}&page=${page}&per_page=200`;
      const data = await requestJson<AccountsPage>(NAME, url, zohoAuthHeader(token));
      for (const account of data.chartofaccounts ?? []) {
        if (account.account_id && account.account_code && account.is_active !== false) {
          byId.set(String(account.account_id), { id: String(account.account_id), code: String(account.account_code) });
        }
      }
      if (!data.page_context?.has_more_page) break;
    }
    return [...byId.values()];
  },
  async precheck(connection, entries) {
    if (!entries.some((entry) => entry.costCenter?.trim())) return;
    const known = await tagOptions(connection);
    const missing = [...new Set(entries.filter((entry) => zohoTagFor(entry.costCenter, known) === undefined).map((entry) => entry.costCenter!.trim()))];
    if (missing.length) {
      throw new Error(
        `مراكز التكلفة هذه بلا خيار وسم تقارير في ${NAME}: ${missing.slice(0, 6).join("، ")}. أضفها خيارات لوسم تقارير مفعّل للقيود في Zoho Books أو صحّح «مراكز التكلفة» ثم أرسل.`,
      );
    }
  },
  async post(connection, entry, accounts) {
    const { credentials, token } = await session(connection);
    const tag = entry.costCenter?.trim() ? (zohoTagFor(entry.costCenter, await tagOptions(connection)) ?? null) : null;
    const payload = zohoJournal(entry, accounts, tag);
    const created = await requestJson<{ code?: number; message?: string; journal?: { journal_id?: string } }>(
      NAME,
      `${credentials.apiDomain}/books/v3/journals?organization_id=${encodeURIComponent(credentials.organizationId)}`,
      zohoAuthHeader(token),
      { method: "POST", body: payload },
    );
    if (created.code !== undefined && created.code !== 0) throw new Error(`رفض ${NAME} القيد: ${String(created.message ?? created.code).slice(0, 200)}`);
    return {
      externalId: String(created.journal?.journal_id ?? "unknown"),
      total: payload.line_items.filter((line) => line.debit_or_credit === "debit").reduce((sum, line) => sum + line.amount, 0),
    };
  },
};
