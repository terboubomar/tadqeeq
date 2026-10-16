/**
 * Tadqeeq's journal entries in the shape every accounting connection sends (pure, shared by the server and tests).
 * Accounts are matched by the code saved in «حساباتي».
 */

/** The accounting systems Tadqeeq can send entries to directly. */
export type AccountingProvider = "qoyod" | "daftra";

export interface SendableLine {
  /** The account code as saved in «حساباتي». */
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

/** An account in the connected system's chart: its own id and the code people see. */
export interface ChartAccount {
  id: number;
  code: string;
}

export const round2 = (value: number) => Math.round(value * 100) / 100;

/** Account codes the entries use that the connected chart of accounts does not have (or that are empty). */
export function missingAccountCodes(entries: SendableEntry[], accounts: ChartAccount[]): string[] {
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

/** The account id for a line's code; throws when the chart has no such code. */
export function accountIdFor(line: SendableLine, idByCode: Map<string, number>, systemName: string): number {
  const id = idByCode.get(line.code.trim());
  if (id === undefined) throw new Error(`لا يوجد حساب برمز ${line.code || line.name} في ${systemName}.`);
  return id;
}

export function idsByCode(accounts: ChartAccount[]): Map<string, number> {
  return new Map(accounts.map((account) => [account.code.trim(), account.id]));
}

/** Throws when the rounded debits and credits differ. */
export function assertBalanced(totalDebit: number, totalCredit: number): void {
  if (round2(totalDebit) !== round2(totalCredit)) {
    throw new Error(`القيد غير متوازن (مدين ${round2(totalDebit)} ودائن ${round2(totalCredit)}).`);
  }
}

/** The entry's description with its Tadqeeq reference at the end (neither system has a reference field). */
export function describedWithReference(entry: SendableEntry): string {
  return `${entry.description} · ${entry.reference}`.slice(0, 250);
}
