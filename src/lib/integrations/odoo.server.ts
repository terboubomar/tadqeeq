import { SyncStop, type Connection, type ProviderAdapter } from "./http.server";
import { analyticFor, odooMove, parseOdooCredentials, type OdooCredentials } from "./odoo";
import type { ChartAccount, SendableEntry } from "./sendable";

/**
 * Odoo over its external API. Odoo 19 and later answer the JSON-2 API (/json/2/<model>/<method>, the key as a bearer
 * token); Odoo 16 to 18 only answer JSON-RPC (/jsonrpc, login then execute_kw), which Odoo keeps until Odoo 22. Each
 * send asks JSON-2 first and falls back to JSON-RPC when the address has no JSON-2.
 */
const NAME = "Odoo";
const TIMEOUT_MS = 20_000;

type Domain = unknown[];

interface Transport {
  searchRead<T>(model: string, domain: Domain, fields: string[], limit?: number): Promise<T[]>;
  create(model: string, values: object): Promise<number>;
  onIds(model: string, method: string, ids: number[]): Promise<unknown>;
}

const KEY_REFUSED = `مفتاح ${NAME} أو اسم الدخول غير صالح، أو انتهت صلاحية المفتاح. أنشئ مفتاحاً جديداً واربط من جديد.`;

async function post(url: string, headers: Record<string, string>, body: unknown): Promise<Response> {
  try {
    return await fetch(url, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new SyncStop(`تعذّر الوصول إلى ${NAME} على هذا العنوان. تحقّق منه وحاول بعد قليل.`);
  }
}

/** Odoo's own error message from a failed call, shortened. */
function odooMessage(data: unknown): string {
  const value = data as { message?: unknown; error?: { data?: { message?: unknown }; message?: unknown } } | null;
  const message = value?.error?.data?.message ?? value?.message ?? value?.error?.message;
  return typeof message === "string" ? message.slice(0, 200) : "";
}

function failure(status: number, data: unknown): Error {
  if (status === 401 || status === 403) return new SyncStop(KEY_REFUSED);
  if (status === 429) return new SyncStop(`${NAME} طلب التمهّل. حاول بعد دقيقة.`);
  const message = odooMessage(data);
  return new Error(`رفض ${NAME} الطلب (${status})${message ? ": " + message : ""}`);
}

/** JSON-2 (Odoo 19+); null when the address does not answer it. */
async function json2(site: string, credentials: OdooCredentials): Promise<Transport | null> {
  const headers = { Authorization: `bearer ${credentials.apiKey}`, "X-Odoo-Database": credentials.database };
  const call = async (model: string, method: string, body: object): Promise<unknown> => {
    const response = await post(`https://${site}/json/2/${model}/${method}`, headers, body);
    const data = await response.json().catch(() => null);
    if (!response.ok) throw failure(response.status, data);
    return data;
  };
  const probe = await post(`https://${site}/json/2/res.users/context_get`, headers, {});
  if (probe.status === 404) return null;
  if (!probe.ok) throw failure(probe.status, await probe.json().catch(() => null));
  return {
    searchRead: async <T,>(model: string, domain: Domain, fields: string[], limit?: number) =>
      (await call(model, "search_read", { domain, fields, ...(limit ? { limit } : {}) })) as T[],
    create: async (model, values) => {
      const ids = (await call(model, "create", { vals_list: [values] })) as number[] | number;
      return Array.isArray(ids) ? ids[0]! : ids;
    },
    onIds: (model, method, ids) => call(model, method, { ids }),
  };
}

/** JSON-RPC (Odoo 16 to 18). */
async function jsonRpc(site: string, credentials: OdooCredentials): Promise<Transport> {
  let id = 0;
  const rpc = async (service: string, method: string, args: unknown[]): Promise<unknown> => {
    const response = await post(`https://${site}/jsonrpc`, {}, { jsonrpc: "2.0", method: "call", params: { service, method, args }, id: ++id });
    const data = (await response.json().catch(() => null)) as { result?: unknown; error?: { data?: { name?: string } } } | null;
    if (!response.ok) throw failure(response.status, data);
    if (data?.error) {
      if (/AccessDenied|AccessError/.test(data.error.data?.name ?? "")) throw new SyncStop(KEY_REFUSED);
      throw new Error(`رفض ${NAME} الطلب: ${odooMessage(data) || "خطأ غير معروف"}`);
    }
    return data?.result;
  };
  const uid = await rpc("common", "login", [credentials.database, credentials.login, credentials.apiKey]);
  if (typeof uid !== "number" || !uid) throw new SyncStop(KEY_REFUSED);
  const execute = (model: string, method: string, args: unknown[], kwargs: object = {}) =>
    rpc("object", "execute_kw", [credentials.database, uid, credentials.apiKey, model, method, args, kwargs]);
  return {
    searchRead: async <T,>(model: string, domain: Domain, fields: string[], limit?: number) =>
      (await execute(model, "search_read", [domain], { fields, ...(limit ? { limit } : {}) })) as T[],
    create: async (model, values) => {
      const result = (await execute(model, "create", [[values]])) as number[] | number;
      return Array.isArray(result) ? result[0]! : result;
    },
    onIds: (model, method, ids) => execute(model, method, [ids]),
  };
}

interface Session {
  transport: Transport;
  journalId?: number;
  analytics?: Array<{ id: number; code: string | null }>;
}

const sessions = new WeakMap<Connection, Promise<Session>>();

/** One transport per send (JSON-2 when available). */
function session(connection: Connection): Promise<Session> {
  let current = sessions.get(connection);
  if (!current) {
    current = (async () => {
      if (!connection.site) throw new Error("عنوان Odoo غير محفوظ. اربط Odoo من جديد.");
      const credentials = parseOdooCredentials(connection.apiKey);
      return { transport: (await json2(connection.site, credentials)) ?? (await jsonRpc(connection.site, credentials)) };
    })();
    sessions.set(connection, current);
  }
  return current;
}

/** The miscellaneous journal (code MISC, as in Tadqeeq's Odoo export), or the first general journal. */
async function journalId(current: Session): Promise<number> {
  if (current.journalId) return current.journalId;
  const journals = await current.transport.searchRead<{ id: number; code: string }>("account.journal", [["type", "=", "general"]], ["id", "code"]);
  const journal = journals.find((candidate) => candidate.code === "MISC") ?? journals[0];
  if (!journal) throw new SyncStop(`لا يوجد دفتر قيود عامة (Miscellaneous) في ${NAME}.`);
  current.journalId = journal.id;
  return journal.id;
}

async function analytics(current: Session, entries: SendableEntry[]): Promise<Array<{ id: number; code: string | null }>> {
  if (current.analytics) return current.analytics;
  const values = [...new Set(entries.map((entry) => entry.costCenter?.trim()).filter((value): value is string => Boolean(value)))];
  if (!values.length) return (current.analytics = []);
  const ids = values.filter((value) => /^\d+$/.test(value)).map(Number);
  const domain: Domain = ids.length ? ["|", ["code", "in", values], ["id", "in", ids]] : [["code", "in", values]];
  const rows = await current.transport.searchRead<{ id: number; code: string | false }>("account.analytic.account", domain, ["id", "code"]);
  current.analytics = rows.map((row) => ({ id: row.id, code: row.code || null }));
  return current.analytics;
}

export const odooAdapter: ProviderAdapter = {
  name: NAME,
  async accounts(connection) {
    const { transport } = await session(connection);
    const rows = await transport.searchRead<{ id: number; code: string | false }>("account.account", [], ["id", "code"]);
    return rows.filter((row) => row.code).map((row): ChartAccount => ({ id: row.id, code: String(row.code) }));
  },
  async precheck(connection, entries) {
    const current = await session(connection);
    await journalId(current);
    const known = await analytics(current, entries);
    const missing = [...new Set(entries.filter((entry) => analyticFor(entry.costCenter, known) === undefined).map((entry) => entry.costCenter!.trim()))];
    if (missing.length) {
      throw new Error(`مراكز التكلفة هذه بلا حساب تحليلي في ${NAME}: ${missing.slice(0, 6).join("، ")}. اكتب رمز الحساب التحليلي أو رقمه في «مراكز التكلفة» ثم أرسل.`);
    }
  },
  async post(connection, entry, accounts) {
    const current = await session(connection);
    const analyticId = analyticFor(entry.costCenter, await analytics(current, [entry])) ?? null;
    const move = odooMove(entry, accounts, await journalId(current), analyticId);
    const id = await current.transport.create("account.move", move);
    try {
      await current.transport.onIds("account.move", "action_post", [id]);
    } catch (cause) {
      // A draft that could not be posted (closed period, lock date) is removed, so sending again does not duplicate it.
      await current.transport.onIds("account.move", "unlink", [id]).catch(() => undefined);
      throw cause;
    }
    return { externalId: String(id), total: move.line_ids.reduce((sum, [, , line]) => sum + line.debit, 0) };
  },
};
