/**
 * Building Qoyod journal entries from Tadqeeq's (pure, shared by the server and tests). Qoyod's API
 * (https://apidoc.qoyod.com, POST /2.0/journal_entries) takes a description, a yyyy-mm-dd date and debit and credit
 * lines by Qoyod account id; it has no reference field, so the reference goes at the end of the description.
 */

export interface SendableLine {
  /** The account code as saved in «حساباتي» (Qoyod matches accounts by code). */
  code: string;
  name: string;
  debit: number;
  credit: number;
  memo: string;
}

export interface SendableEntry {
  /** Stable key of the entry within its period (the branch's cost-center key, or its name). */
  key: string;
  reference: string;
  description: string;
  date: string;
  lines: SendableLine[];
}

export interface QoyodAccount {
  id: number;
  code: string;
}

export interface QoyodJournalEntry {
  description: string;
  date: string;
  debit_amounts: Array<{ account_id: number; amount: number; comment?: string }>;
  credit_amounts: Array<{ account_id: number; amount: number; comment?: string }>;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Account codes the entries use that the Qoyod chart of accounts does not have (or that are empty). */
export function missingAccountCodes(entries: SendableEntry[], accounts: QoyodAccount[]): string[] {
  const known = new Set(accounts.map((account) => account.code.trim()));
  const missing = new Set<string>();
  for (const entry of entries) {
    for (const line of entry.lines) {
      if (!line.debit && !line.credit) continue;
      const code = line.code.trim();
      if (!code || !known.has(code)) missing.add(code || line.name);
    }
  }
  return [...missing];
}

/** The Qoyod payload for one entry; throws when its debits and credits do not match to the halala. */
export function qoyodJournalEntry(entry: SendableEntry, accounts: QoyodAccount[]): QoyodJournalEntry {
  const idByCode = new Map(accounts.map((account) => [account.code.trim(), account.id]));
  const side = (pick: "debit" | "credit") =>
    entry.lines
      .filter((line) => round2(line[pick]) > 0)
      .map((line) => {
        const id = idByCode.get(line.code.trim());
        if (id === undefined) throw new Error(`لا يوجد حساب برمز ${line.code || line.name} في قيود.`);
        return { account_id: id, amount: round2(line[pick]), ...(line.memo ? { comment: line.memo.slice(0, 250) } : {}) };
      });
  const debit_amounts = side("debit");
  const credit_amounts = side("credit");
  const totalDebit = round2(debit_amounts.reduce((sum, line) => sum + line.amount, 0));
  const totalCredit = round2(credit_amounts.reduce((sum, line) => sum + line.amount, 0));
  if (totalDebit !== totalCredit) throw new Error(`القيد غير متوازن (مدين ${totalDebit} ودائن ${totalCredit}).`);
  return {
    description: `${entry.description} · ${entry.reference}`.slice(0, 250),
    date: entry.date.slice(0, 10),
    debit_amounts,
    credit_amounts,
  };
}
