import { exportXlsx } from "@/lib/export";
import type { JournalEntry } from "@/lib/journal-entries";

export interface BranchJournal {
  branch: string;
  entry: JournalEntry;
  /** The branch's cost center code, carried by every line of its entry. */
  costCenter?: string;
  /** What the cost center is saved under (see costCenterKey); absent for entries that are not one branch. */
  costCenterKey?: string;
}

export const ENTRY_COLUMNS = [
  { key: "code", header: "رمز الحساب", type: "text" },
  { key: "account", header: "الحساب", type: "text" },
  { key: "debit", header: "مدين" },
  { key: "credit", header: "دائن" },
  { key: "memo", header: "البيان", type: "text" },
  { key: "costCenter", header: "مركز التكلفة", type: "text" },
] as const;

export type EntryRow = {
  entryNo?: number;
  branch?: string;
  code: string;
  account: string;
  debit?: number;
  credit?: number;
  memo: string;
  costCenter?: string;
};

export function entryRows(entry: JournalEntry, costCenter = ""): EntryRow[] {
  return entry.lines.map((line) => ({
    code: line.account.code,
    account: line.account.name,
    debit: line.debit || undefined,
    credit: line.credit || undefined,
    memo: line.memo,
    costCenter,
  }));
}

export function fileSlug(text: string): string {
  return text.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60);
}

/** Sheet name for the entry: its number and branch (exportXlsx makes it valid and unique for Excel). */
export function sheetName(index: number, label: string): string {
  return index + 1 + " - " + label;
}

export function isBalanced(entry: JournalEntry): boolean {
  return Math.abs(entry.totalDebit - entry.totalCredit) < 0.01;
}

export const TREATMENT_NOTE =
  "الإيراد صافي المبيعات بدون الضريبة، وعمولة المنصة ورسومها مصروفات مستقلة (المنصة وكيل للمطعم). الأرقام من نتيجة التدقيق المحفوظة دون أي تعديل.";

/** One workbook: a ledger sheet with every line (entry number and branch on each) plus one sheet per branch. Entries are numbered from `firstNumber`. */
export function exportBranchJournals(title: string, journals: BranchJournal[], firstNumber = 1) {
  const ledger: EntryRow[] = journals.flatMap((journal, index) =>
    entryRows(journal.entry, journal.costCenter).map((row) => ({ entryNo: index + firstNumber, branch: journal.branch, ...row })),
  );
  exportXlsx(
    [
      {
        name: "القيود",
        rows: ledger,
        columns: [{ key: "entryNo", header: "رقم القيد" }, { key: "branch", header: "الفرع", type: "text" }, ...ENTRY_COLUMNS],
      },
      ...journals.map((journal, index) => ({
        name: sheetName(index + firstNumber - 1, journal.branch),
        rows: [
          ...entryRows(journal.entry, journal.costCenter),
          { code: "", account: "الإجمالي", debit: journal.entry.totalDebit, credit: journal.entry.totalCredit, memo: journal.entry.description },
        ],
        columns: [...ENTRY_COLUMNS],
      })),
    ],
    "journals-" + fileSlug(title),
  );
}
