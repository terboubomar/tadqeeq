/**
 * Building Daftra journals from Tadqeeq's entries (pure, shared by the server and tests). Daftra's API
 * (https://docs.daftara.dev, POST /api2/journals) takes a Journal with a date, a description, the currency and
 * JournalTransaction lines by Daftra account id, amounts in currency_debit / currency_credit. Every Daftra account has
 * its own site (mystore.daftra.com), which is where the API lives.
 */
import { accountIdFor, assertBalanced, describedWithReference, idsByCode, round2, type ChartAccount, type SendableEntry } from "./sendable";

export interface DaftraJournal {
  Journal: {
    date: string;
    description: string;
    currency_code: "SAR";
    draft: 0;
    JournalTransaction: Array<{ journal_account_id: number; currency_debit: number; currency_credit: number; description?: string }>;
  };
}

const SITE = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.(?:daftra|daftara)\.com$/;

/**
 * The Daftra site's host from what was pasted: "mystore", "mystore.daftra.com" or a link to any page of the site.
 * Only Daftra hosts are accepted, so the key is never sent anywhere else.
 */
export function daftraSite(input: string): string {
  let value = input.trim().toLowerCase();
  if (!value) throw new Error("اكتب عنوان موقعك في دفترة، مثل mystore.daftra.com");
  value = value.replace(/^https?:\/\//, "").split(/[/?#]/)[0]!.replace(/\.$/, "");
  if (!value.includes(".")) value += ".daftra.com";
  if (!SITE.test(value)) throw new Error("عنوان دفترة غير صحيح. انسخه من شريط المتصفح، مثل mystore.daftra.com");
  return value;
}

/** The Daftra payload for one entry; throws when its debits and credits do not match to the halala. */
export function daftraJournal(entry: SendableEntry, accounts: ChartAccount[]): DaftraJournal {
  const idByCode = idsByCode(accounts);
  const lines = entry.lines
    .filter((line) => round2(line.debit) > 0 || round2(line.credit) > 0)
    .map((line) => ({
      journal_account_id: accountIdFor(line, idByCode, "دفترة"),
      currency_debit: round2(line.debit),
      currency_credit: round2(line.credit),
      ...(line.memo ? { description: line.memo.slice(0, 250) } : {}),
    }));
  assertBalanced(
    lines.reduce((sum, line) => sum + line.currency_debit, 0),
    lines.reduce((sum, line) => sum + line.currency_credit, 0),
  );
  return {
    Journal: { date: entry.date.slice(0, 10), description: describedWithReference(entry), currency_code: "SAR", draft: 0, JournalTransaction: lines },
  };
}
