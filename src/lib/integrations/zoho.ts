/**
 * Zoho Books (https://www.zoho.com/books/api/v3): OAuth instead of a pasted key. People sign in at Zoho and approve;
 * Zoho sends them back with a code and the data center their account lives in (Saudi accounts are on .sa). Journals
 * are posted to POST /books/v3/journals, which has its own reference field. Zoho Books has no cost center field; the
 * branch's cost center goes as a reporting tag option of the same name on every line. Pure, shared by the server and tests.
 */
import { accountIdFor, assertBalanced, idsByCode, round2, type ChartAccount, type SendableEntry } from "./sendable";

/** Zoho's data centers: where people sign in, and where that account's API lives. */
const DATA_CENTERS = ["com", "eu", "in", "com.au", "jp", "ca", "sa", "com.cn"] as const;

export const ZOHO_SCOPES = "ZohoBooks.accountants.READ,ZohoBooks.accountants.CREATE,ZohoBooks.settings.READ";

/** The accounts server Zoho named in the redirect, if it is one of Zoho's; null otherwise. */
export function zohoAccountsServer(value: string | null | undefined): string | null {
  const clean = (value ?? "").trim().replace(/\/+$/, "");
  return DATA_CENTERS.some((dc) => clean === `https://accounts.zoho.${dc}`) ? clean : null;
}

/** The API domain Zoho returned with the tokens, if it is one of Zoho's; null otherwise. */
export function zohoApiDomain(value: string | null | undefined): string | null {
  const clean = (value ?? "").trim().replace(/\/+$/, "");
  return DATA_CENTERS.some((dc) => clean === `https://www.zohoapis.${dc}`) ? clean : null;
}

/** What Tadqeeq keeps (sealed) for a Zoho connection. */
export interface ZohoCredentials {
  refreshToken: string;
  accountsServer: string;
  apiDomain: string;
  organizationId: string;
}

export function parseZohoCredentials(sealedJson: string): ZohoCredentials {
  const value = JSON.parse(sealedJson) as Partial<ZohoCredentials>;
  const accountsServer = zohoAccountsServer(value.accountsServer);
  const apiDomain = zohoApiDomain(value.apiDomain);
  if (!value.refreshToken || !accountsServer || !apiDomain || !value.organizationId) {
    throw new Error("ربط Zoho Books المحفوظ غير صالح؛ اربطه من جديد.");
  }
  return { refreshToken: value.refreshToken, accountsServer, apiDomain, organizationId: value.organizationId };
}

export interface ZohoJournal {
  journal_date: string;
  reference_number: string;
  notes: string;
  status: "published";
  line_items: Array<{
    account_id: number | string;
    debit_or_credit: "debit" | "credit";
    amount: number;
    description?: string;
    tags?: Array<{ tag_id: string; tag_option_id: string }>;
  }>;
}

/** One option of a Zoho Books reporting tag (e.g. the "Branch" tag's "Olaya" option). */
export interface ZohoTagOption {
  tagId: string;
  optionId: string;
  name: string;
}

interface ZohoOptionNode {
  option_id?: string;
  option_name?: string;
  is_active?: boolean;
  children?: ZohoOptionNode[];
}

/** A tag's active options, child options included, as GET /reportingtags/options returns them. */
export function zohoTagOptions(tagId: string, options: ZohoOptionNode[] | undefined): ZohoTagOption[] {
  const out: ZohoTagOption[] = [];
  const walk = (nodes: ZohoOptionNode[] | undefined) => {
    for (const node of nodes ?? []) {
      if (node.is_active !== false && node.option_id && node.option_name?.trim()) out.push({ tagId, optionId: String(node.option_id), name: node.option_name.trim() });
      walk(node.children);
    }
  };
  walk(options);
  return out;
}

/**
 * The reporting tag option a cost center names (its option name, ignoring case); null when the entry has no cost
 * center, undefined when Zoho Books has no such option. The first tag in Zoho's order wins when two tags share a name.
 */
export function zohoTagFor(costCenter: string | undefined, options: ZohoTagOption[]): ZohoTagOption | null | undefined {
  const value = (costCenter ?? "").trim().toLowerCase();
  if (!value) return null;
  return options.find((option) => option.name.toLowerCase() === value);
}

/** The Zoho Books payload for one entry; throws when its debits and credits do not match to the halala. */
export function zohoJournal(entry: SendableEntry, accounts: ChartAccount[], tag: ZohoTagOption | null = null): ZohoJournal {
  const idByCode = idsByCode(accounts);
  const line_items: ZohoJournal["line_items"] = [];
  for (const line of entry.lines) {
    for (const side of ["debit", "credit"] as const) {
      const amount = round2(line[side]);
      if (amount <= 0) continue;
      line_items.push({
        account_id: accountIdFor(line, idByCode, "Zoho Books"),
        debit_or_credit: side,
        amount,
        ...(line.memo ? { description: line.memo.slice(0, 250) } : {}),
        ...(tag ? { tags: [{ tag_id: tag.tagId, tag_option_id: tag.optionId }] } : {}),
      });
    }
  }
  const total = (side: "debit" | "credit") => line_items.filter((line) => line.debit_or_credit === side).reduce((sum, line) => sum + line.amount, 0);
  assertBalanced(total("debit"), total("credit"));
  return {
    journal_date: entry.date.slice(0, 10),
    reference_number: entry.reference.slice(0, 50),
    notes: entry.description.slice(0, 500),
    status: "published",
    line_items,
  };
}
