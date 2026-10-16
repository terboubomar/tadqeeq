/**
 * Odoo (https://www.odoo.com/documentation/19.0/developer/reference/external_api.html): the workspace pastes its Odoo
 * address, database, login and an API key (Preferences › Account Security › New API Key). Entries become account.move
 * records in the miscellaneous journal, laid out like Tadqeeq's Odoo export: the reference and description on the
 * entry, and the branch's cost center as the analytic distribution of every line. Pure, shared by the server and tests.
 */
import { accountIdFor, assertBalanced, idsByCode, round2, type ChartAccount, type SendableEntry } from "./sendable";

/** What Tadqeeq keeps (sealed) for an Odoo connection. */
export interface OdooCredentials {
  apiKey: string;
  database: string;
  login: string;
}

const LABEL = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/;

/**
 * The Odoo host from what was pasted ("mycompany.odoo.com", or a link to any page). Odoo runs on any domain, so only
 * public HTTPS host names pass: no addresses by number, no ports, no local names.
 */
export function odooSite(input: string): string {
  let value = input.trim().toLowerCase();
  if (!value) throw new Error("اكتب عنوان Odoo، مثل mycompany.odoo.com");
  if (/^http:\/\//.test(value)) throw new Error("عنوان Odoo يجب أن يبدأ بـ https.");
  value = value.replace(/^https:\/\//, "").split(/[/?#]/)[0]!.replace(/\.$/, "");
  const labels = value.split(".");
  const valid =
    value.length <= 253 &&
    labels.length >= 2 &&
    labels.every((label) => LABEL.test(label)) &&
    !/^\d+$/.test(labels[labels.length - 1]!) &&
    !["localhost", "local", "internal"].includes(labels[labels.length - 1]!);
  if (!valid) throw new Error("عنوان Odoo غير صحيح. انسخه من شريط المتصفح، مثل mycompany.odoo.com");
  return value;
}

/** The database name: what was typed, or for Odoo Online (mycompany.odoo.com) the first part of the address. */
export function odooDatabase(site: string, typed: string | undefined): string {
  const value = (typed ?? "").trim();
  if (value) {
    if (!/^[A-Za-z0-9_.-]{1,63}$/.test(value)) throw new Error("اسم قاعدة بيانات Odoo غير صحيح.");
    return value;
  }
  const online = /^([a-z0-9-]+)\.odoo\.com$/.exec(site);
  if (online) return online[1]!;
  throw new Error("اكتب اسم قاعدة بيانات Odoo.");
}

export function parseOdooCredentials(sealedJson: string): OdooCredentials {
  const value = JSON.parse(sealedJson) as Partial<OdooCredentials>;
  if (!value.apiKey || !value.database || !value.login) throw new Error("ربط Odoo المحفوظ غير صالح؛ اربطه من جديد.");
  return { apiKey: value.apiKey, database: value.database, login: value.login };
}

export interface OdooMoveLine {
  account_id: number | string;
  name: string;
  debit: number;
  credit: number;
  analytic_distribution?: Record<string, number>;
}

export interface OdooMove {
  move_type: "entry";
  journal_id: number;
  date: string;
  ref: string;
  line_ids: Array<[0, 0, OdooMoveLine]>;
}

/** The account.move values for one entry; throws when its debits and credits do not match to the halala. */
export function odooMove(entry: SendableEntry, accounts: ChartAccount[], journalId: number, analyticId: number | null): OdooMove {
  const idByCode = idsByCode(accounts);
  const lines: OdooMoveLine[] = entry.lines
    .filter((line) => round2(line.debit) > 0 || round2(line.credit) > 0)
    .map((line) => ({
      account_id: accountIdFor(line, idByCode, "Odoo"),
      name: (line.memo || entry.description).slice(0, 250),
      debit: round2(line.debit),
      credit: round2(line.credit),
      ...(analyticId !== null ? { analytic_distribution: { [String(analyticId)]: 100 } } : {}),
    }));
  assertBalanced(
    lines.reduce((sum, line) => sum + line.debit, 0),
    lines.reduce((sum, line) => sum + line.credit, 0),
  );
  return {
    move_type: "entry",
    journal_id: journalId,
    date: entry.date.slice(0, 10),
    ref: `${entry.reference} · ${entry.description}`.slice(0, 250),
    line_ids: lines.map((line) => [0, 0, line]),
  };
}

/** The analytic account a cost center names: its code, or its number as in the Odoo export. */
export function analyticFor(costCenter: string | undefined, analytics: Array<{ id: number; code: string | null }>): number | null | undefined {
  const value = (costCenter ?? "").trim();
  if (!value) return null;
  const byCode = analytics.find((analytic) => (analytic.code ?? "").trim() === value);
  if (byCode) return byCode.id;
  const byId = /^\d+$/.test(value) ? analytics.find((analytic) => String(analytic.id) === value) : undefined;
  return byId ? byId.id : undefined;
}
