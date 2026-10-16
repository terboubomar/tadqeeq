/**
 * QuickBooks Online (https://developer.intuit.com/app/developer/qbo/docs): Intuit sign-in (OAuth 2.0) instead of a
 * pasted key; the callback names the company (realmId). Entries are posted as JournalEntry objects, laid out like
 * Tadqeeq's QuickBooks export: the account by its number when it has one, otherwise by its name, the Tadqeeq reference
 * as the journal number and the branch's cost center as the Class. Pure, shared by the server and tests.
 */
import { accountIdFor, assertBalanced, idsByCode, round2, type ChartAccount, type SendableEntry } from "./sendable";

export const QUICKBOOKS_SCOPE = "com.intuit.quickbooks.accounting";
export const QUICKBOOKS_AUTHORIZE_URL = "https://appcenter.intuit.com/connect/oauth2";
export const QUICKBOOKS_TOKEN_URL = "https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer";

export type QuickBooksEnvironment = "production" | "sandbox";

export function quickBooksApiBase(environment: QuickBooksEnvironment): string {
  return environment === "sandbox" ? "https://sandbox-quickbooks.api.intuit.com" : "https://quickbooks.api.intuit.com";
}

/** What Tadqeeq keeps (sealed) for a QuickBooks connection. The refresh token changes as it is used. */
export interface QuickBooksCredentials {
  refreshToken: string;
  realmId: string;
  environment: QuickBooksEnvironment;
}

export function quickBooksRealm(value: string | null | undefined): string | null {
  const clean = (value ?? "").trim();
  return /^\d{1,32}$/.test(clean) ? clean : null;
}

export function parseQuickBooksCredentials(sealedJson: string): QuickBooksCredentials {
  const value = JSON.parse(sealedJson) as Partial<QuickBooksCredentials>;
  const realmId = quickBooksRealm(value.realmId);
  if (!value.refreshToken || !realmId || (value.environment !== "production" && value.environment !== "sandbox")) {
    throw new Error("ربط QuickBooks المحفوظ غير صالح؛ اربطه من جديد.");
  }
  return { refreshToken: value.refreshToken, realmId, environment: value.environment };
}

/** As in the QuickBooks export, an account is named by its number when it has one, otherwise by its name. */
export function quickBooksAccountKeys(entries: SendableEntry[]): SendableEntry[] {
  return entries.map((entry) => ({ ...entry, lines: entry.lines.map((line) => ({ ...line, code: line.code.trim() || line.name.trim() })) }));
}

/** The chart keyed both ways: by name (and full name) first, so an account number wins when both match. */
export function quickBooksChart(accounts: Array<{ Id?: string; AcctNum?: string; Name?: string; FullyQualifiedName?: string; Active?: boolean }>): ChartAccount[] {
  const active = accounts.filter((account) => account.Id && account.Active !== false);
  const byName = active.flatMap((account) =>
    [...new Set([account.Name, account.FullyQualifiedName].filter((name): name is string => Boolean(name?.trim())))].map((name) => ({ id: account.Id!, code: name.trim() })),
  );
  const byNumber = active.filter((account) => account.AcctNum?.trim()).map((account) => ({ id: account.Id!, code: account.AcctNum!.trim() }));
  return [...byName, ...byNumber];
}

export interface QuickBooksJournalEntry {
  TxnDate: string;
  DocNumber: string;
  PrivateNote: string;
  Line: Array<{
    DetailType: "JournalEntryLineDetail";
    Amount: number;
    Description: string;
    JournalEntryLineDetail: { PostingType: "Debit" | "Credit"; AccountRef: { value: string }; ClassRef?: { value: string } };
  }>;
}

/** The JournalEntry for one entry; throws when its debits and credits do not match to the cent. */
export function quickBooksJournal(entry: SendableEntry, accounts: ChartAccount[], classId: string | null): QuickBooksJournalEntry {
  const idByCode = idsByCode(accounts);
  const lines: QuickBooksJournalEntry["Line"] = [];
  for (const line of entry.lines) {
    for (const [side, posting] of [
      ["debit", "Debit"],
      ["credit", "Credit"],
    ] as const) {
      const amount = round2(line[side]);
      if (amount <= 0) continue;
      lines.push({
        DetailType: "JournalEntryLineDetail",
        Amount: amount,
        Description: (line.memo ? `${entry.description} · ${line.memo}` : entry.description).slice(0, 4000),
        JournalEntryLineDetail: {
          PostingType: posting,
          AccountRef: { value: String(accountIdFor(line, idByCode, "QuickBooks")) },
          ...(classId ? { ClassRef: { value: classId } } : {}),
        },
      });
    }
  }
  const total = (posting: "Debit" | "Credit") => lines.filter((line) => line.JournalEntryLineDetail.PostingType === posting).reduce((sum, line) => sum + line.Amount, 0);
  assertBalanced(total("Debit"), total("Credit"));
  return { TxnDate: entry.date.slice(0, 10), DocNumber: entry.reference.slice(0, 21), PrivateNote: entry.description.slice(0, 4000), Line: lines };
}

/** The Class a cost center names (by name or full name, as in the export's Class column). */
export function classFor(costCenter: string | undefined, classes: Array<{ Id: string; Name?: string; FullyQualifiedName?: string }>): string | null | undefined {
  const value = (costCenter ?? "").trim();
  if (!value) return null;
  return classes.find((item) => item.Name?.trim() === value || item.FullyQualifiedName?.trim() === value)?.Id;
}
