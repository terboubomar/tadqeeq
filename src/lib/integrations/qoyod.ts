/**
 * Building Qoyod journal entries from Tadqeeq's (pure, shared by the server and tests). Qoyod's API
 * (https://apidoc.qoyod.com, POST /2.0/journal_entries) takes a description, a yyyy-mm-dd date and debit and credit
 * lines by Qoyod account id; it has no reference field, so the reference goes at the end of the description.
 */
import { accountIdFor, assertBalanced, describedWithReference, idsByCode, round2, type ChartAccount, type SendableEntry } from "./sendable";

export { missingAccountCodes, type SendableEntry, type SendableLine } from "./sendable";
export type QoyodAccount = ChartAccount;

export interface QoyodJournalEntry {
  description: string;
  date: string;
  debit_amounts: Array<{ account_id: number | string; amount: number; comment?: string }>;
  credit_amounts: Array<{ account_id: number | string; amount: number; comment?: string }>;
}

/** The Qoyod payload for one entry; throws when its debits and credits do not match to the halala. */
export function qoyodJournalEntry(entry: SendableEntry, accounts: QoyodAccount[]): QoyodJournalEntry {
  const idByCode = idsByCode(accounts);
  const side = (pick: "debit" | "credit") =>
    entry.lines
      .filter((line) => round2(line[pick]) > 0)
      .map((line) => ({
        account_id: accountIdFor(line, idByCode, "قيود"),
        amount: round2(line[pick]),
        ...(line.memo ? { comment: line.memo.slice(0, 250) } : {}),
      }));
  const debit_amounts = side("debit");
  const credit_amounts = side("credit");
  assertBalanced(
    debit_amounts.reduce((sum, line) => sum + line.amount, 0),
    credit_amounts.reduce((sum, line) => sum + line.amount, 0),
  );
  return { description: describedWithReference(entry), date: entry.date.slice(0, 10), debit_amounts, credit_amounts };
}
