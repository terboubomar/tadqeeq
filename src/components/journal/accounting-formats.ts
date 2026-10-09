import { exportCsv, exportXlsx, type ExportColumn } from "@/lib/export";
import type { JournalEntry, JournalLine } from "@/lib/journal-entries";

import { exportBranchJournals, fileSlug, type BranchJournal } from "./journal-export";

/**
 * The journal entries laid out for each accounting system's own journal import, so the file can be imported as it is.
 * Layouts follow each system's import documentation:
 * - Odoo: Accounting › Journal Items › Import (journal, reference and date on the first line of each entry only).
 * - Zoho Books: Accountant › Manual Journals › Import (rows grouped by date and reference number).
 * - QuickBooks Online: Settings › Import data › Journal entries (Journal No., Journal Date, Account Name, Debits, Credits).
 * - Qoyod: Accounting › Manual journal entries › Import (its Arabic template, an empty row after each entry).
 * - Daftra: Add entry › Paste from sheet (account, description, debit, credit), one entry at a time.
 * Accounts go by their code when the workspace set one, otherwise by name.
 */
export type AccountingSystem = "excel" | "odoo" | "zoho" | "quickbooks" | "qoyod" | "daftra";

export const ACCOUNTING_SYSTEMS: Array<{ key: AccountingSystem; label: string; hint: string; needsCodes: boolean }> = [
  { key: "excel", label: "Excel (تدقيق)", hint: "ملف القيود كما يظهر هنا: ورقة لكل القيود وورقة لكل فرع", needsCodes: false },
  { key: "odoo", label: "Odoo", hint: "استيراد القيود من Journal Items › Import", needsCodes: true },
  { key: "zoho", label: "Zoho Books", hint: "Manual Journals › Import · ملف CSV", needsCodes: false },
  { key: "quickbooks", label: "QuickBooks Online", hint: "Import data › Journal entries · ملف CSV", needsCodes: false },
  { key: "qoyod", label: "قيود Qoyod", hint: "قيود محاسبية يدوية › استيراد", needsCodes: true },
  { key: "daftra", label: "دفترة Daftra", hint: "إضافة قيد › لصق من الشيت · ورقة لكل قيد", needsCodes: false },
];

export interface NumberedJournal extends BranchJournal {
  number: number;
}

function accountRef(line: JournalLine): string {
  return line.account.code.trim() || line.account.name;
}

/** "2026-09-30" → "TDQ-202609-03": a reference that is the same every time the period is exported. */
export function entryReference(entry: JournalEntry, number: number): string {
  const month = (entry.date ?? "").slice(0, 7).replace("-", "");
  return "TDQ-" + (month || "0") + "-" + String(number).padStart(2, "0");
}

/** "2026-09-30" → "30/09/2026". */
export function dayFirst(date: string | null): string {
  const [year, month, day] = (date ?? "").slice(0, 10).split("-");
  return year && month && day ? `${day}/${month}/${year}` : "";
}

const money = (value: number) => (value ? value : undefined);

type OdooRow = { journal: string; ref: string; date: string; account: string; label: string; debit?: number; credit?: number };
export function odooRows(journals: NumberedJournal[]): OdooRow[] {
  return journals.flatMap(({ entry, number }) =>
    entry.lines.map((line, index) => ({
      journal: index === 0 ? "MISC" : "",
      ref: index === 0 ? entryReference(entry, number) + " · " + entry.description : "",
      date: index === 0 ? (entry.date ?? "") : "",
      account: accountRef(line),
      label: line.memo || entry.description,
      debit: money(line.debit),
      credit: money(line.credit),
    })),
  );
}
const ODOO_COLUMNS: ExportColumn<OdooRow>[] = [
  { key: "journal", header: "journal_id", type: "text" },
  { key: "ref", header: "ref", type: "text" },
  { key: "date", header: "date", type: "text" },
  { key: "account", header: "line_ids/account_id", type: "text" },
  { key: "label", header: "line_ids/name", type: "text" },
  { key: "debit", header: "line_ids/debit" },
  { key: "credit", header: "line_ids/credit" },
];

type ZohoRow = { date: string; ref: string; notes: string; currency: string; account: string; description: string; debit?: number; credit?: number };
export function zohoRows(journals: NumberedJournal[]): ZohoRow[] {
  return journals.flatMap(({ entry, number }) =>
    entry.lines.map((line) => ({
      date: entry.date ?? "",
      ref: entryReference(entry, number),
      notes: entry.description,
      currency: "SAR",
      account: accountRef(line),
      description: line.memo,
      debit: money(line.debit),
      credit: money(line.credit),
    })),
  );
}
const ZOHO_COLUMNS: ExportColumn<ZohoRow>[] = [
  { key: "date", header: "Journal Date", type: "text" },
  { key: "ref", header: "Reference Number", type: "text" },
  { key: "notes", header: "Notes", type: "text" },
  { key: "currency", header: "Currency", type: "text" },
  { key: "account", header: "Account", type: "text" },
  { key: "description", header: "Description", type: "text" },
  { key: "debit", header: "Debit" },
  { key: "credit", header: "Credit" },
];

type QuickBooksRow = { no: string; date: string; account: string; debit?: number; credit?: number; description: string };
export function quickBooksRows(journals: NumberedJournal[]): QuickBooksRow[] {
  return journals.flatMap(({ entry, number }) =>
    entry.lines.map((line) => ({
      no: entryReference(entry, number),
      date: dayFirst(entry.date),
      account: accountRef(line),
      debit: money(line.debit),
      credit: money(line.credit),
      description: line.memo ? entry.description + " · " + line.memo : entry.description,
    })),
  );
}
const QUICKBOOKS_COLUMNS: ExportColumn<QuickBooksRow>[] = [
  { key: "no", header: "Journal No.", type: "text" },
  { key: "date", header: "Journal Date", type: "text" },
  { key: "account", header: "Account Name", type: "text" },
  { key: "debit", header: "Debits" },
  { key: "credit", header: "Credits" },
  { key: "description", header: "Description", type: "text" },
];

type QoyodRow = { seq: string; date: string; description: string; type: string; code: string; contact: string; debit?: number; credit?: number; comment: string };
export function qoyodRows(journals: NumberedJournal[]): QoyodRow[] {
  const blank: QoyodRow = { seq: "", date: "", description: "", type: "", code: "", contact: "", comment: "" };
  return journals.flatMap(({ entry, number }) => [
    ...entry.lines.map((line, index) => ({
      seq: String(number),
      date: index === 0 ? dayFirst(entry.date) : "",
      description: index === 0 ? entry.description : "",
      type: "G/L Accounts",
      code: accountRef(line),
      contact: "",
      debit: money(line.debit),
      credit: money(line.credit),
      comment: line.memo,
    })),
    blank,
  ]);
}
const QOYOD_COLUMNS: ExportColumn<QoyodRow>[] = [
  { key: "seq", header: "تسلسل القيد", type: "text" },
  { key: "date", header: "التاريخ", type: "text" },
  { key: "description", header: "وصف القيد", type: "text" },
  { key: "type", header: "نوع الحساب", type: "text" },
  { key: "code", header: "رمز الحساب", type: "text" },
  { key: "contact", header: "جهة اتصال/ضريبة/موظف", type: "text" },
  { key: "debit", header: "مدين" },
  { key: "credit", header: "دائن" },
  { key: "comment", header: "التعليقات", type: "text" },
];

type DaftraRow = { account: string; description: string; debit?: number; credit?: number };
export function daftraRows(entry: JournalEntry): DaftraRow[] {
  return entry.lines.map((line) => ({
    account: accountRef(line),
    description: line.memo ? entry.description + " · " + line.memo : entry.description,
    debit: money(line.debit),
    credit: money(line.credit),
  }));
}
const DAFTRA_COLUMNS: ExportColumn<DaftraRow>[] = [
  { key: "account", header: "الحساب", type: "text" },
  { key: "description", header: "الوصف", type: "text" },
  { key: "debit", header: "مدين" },
  { key: "credit", header: "دائن" },
];

/** True when some line has no account code: Odoo and Qoyod match accounts by code. */
export function missingCodes(journals: BranchJournal[]): boolean {
  return journals.some(({ entry }) => entry.lines.some((line) => !line.account.code.trim()));
}

/** Download the entries for `system`. Entries are numbered from `firstNumber`, as on the page. */
export function exportJournalsFor(system: AccountingSystem, title: string, journals: BranchJournal[], firstNumber = 1) {
  if (system === "excel") return exportBranchJournals(title, journals, firstNumber);
  const numbered = journals.map((journal, index) => ({ ...journal, number: index + firstNumber }));
  const name = "journals-" + system + "-" + fileSlug(title);
  if (system === "odoo") return exportXlsx([{ name: "Journal Entries", rows: odooRows(numbered), columns: ODOO_COLUMNS }], name);
  if (system === "zoho") return exportCsv(zohoRows(numbered), ZOHO_COLUMNS, name);
  if (system === "quickbooks") return exportCsv(quickBooksRows(numbered), QUICKBOOKS_COLUMNS, name);
  if (system === "qoyod") return exportXlsx([{ name: "القيود", rows: qoyodRows(numbered), columns: QOYOD_COLUMNS }], name);
  return exportXlsx(
    numbered.map(({ entry, number, branch }) => ({ name: number + " - " + branch, rows: daftraRows(entry), columns: DAFTRA_COLUMNS })),
    name,
  );
}
