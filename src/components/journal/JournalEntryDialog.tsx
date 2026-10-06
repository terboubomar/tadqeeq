import { useMutation, useQueryClient } from "@tanstack/react-query";
import { BookOpenCheck, CheckCircle2, Download, Loader2, Settings2 } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { exportXlsx } from "@/lib/export";
import { arabicDate, money } from "@/lib/format";
import { saveJournalAccounts } from "@/lib/journal-accounts.functions";
import { JOURNAL_ACCOUNTS_KEY, useJournalAccounts } from "@/components/journal/use-journal-accounts";
import {
  DEFAULT_JOURNAL_ACCOUNTS,
  JOURNAL_ACCOUNT_ORDER,
  type JournalAccountKey,
  type JournalAccounts,
  type JournalEntry,
} from "@/lib/journal-entries";
import { cn } from "@/lib/utils";

const ENTRY_COLUMNS = [
  { key: "code", header: "رمز الحساب", type: "text" },
  { key: "account", header: "الحساب", type: "text" },
  { key: "debit", header: "مدين" },
  { key: "credit", header: "دائن" },
  { key: "memo", header: "البيان", type: "text" },
] as const;

type EntryRow = { entryNo?: number; branch?: string; code: string; account: string; debit?: number; credit?: number; memo: string };

function entryRows(entry: JournalEntry): EntryRow[] {
  return entry.lines.map((line) => ({
    code: line.account.code,
    account: line.account.name,
    debit: line.debit || undefined,
    credit: line.credit || undefined,
    memo: line.memo,
  }));
}

function fileSlug(text: string): string {
  return text.replace(/[^\p{L}\p{N}]+/gu, "-").slice(0, 60);
}

/** Excel sheet names: at most 31 characters, none of : \ / ? * [ ], unique within the workbook. */
function sheetName(index: number, label: string): string {
  return (index + 1 + " - " + label.replace(/[:\\/?*[\]]+/g, " ")).slice(0, 31).trim();
}

function isBalanced(entry: JournalEntry): boolean {
  return Math.abs(entry.totalDebit - entry.totalCredit) < 0.01;
}

/** The entry's lines with debit, credit, memo and a totals row. */
function EntryTable({ entry }: { entry: JournalEntry }) {
  const balanced = isBalanced(entry);
  return (
    <div className="overflow-x-auto rounded-xl border border-border">
      <table className="w-full text-[13px] sm:min-w-[620px]">
        <thead className="bg-surface-raised text-[11.5px] text-muted-foreground">
          <tr>
            <th className="px-3 py-2.5 text-start font-semibold">الحساب</th>
            <th className="px-3 py-2.5 text-right font-semibold">مدين</th>
            <th className="px-3 py-2.5 text-right font-semibold">دائن</th>
            <th className="hidden px-3 py-2.5 text-start font-semibold sm:table-cell">البيان</th>
          </tr>
        </thead>
        <tbody>
          {entry.lines.map((line) => (
            <tr key={line.account.key} className="border-t border-border/70 align-top">
              <td className={cn("px-3 py-2.5", line.credit > 0 && "ps-8")}>
                <span className="inline-flex flex-wrap items-baseline gap-x-2">
                  {line.account.code ? (
                    <span className="num text-[11.5px] text-muted-foreground">{line.account.code}</span>
                  ) : null}
                  <span className="font-medium">{line.account.name}</span>
                </span>
              </td>
              <td className="px-3 py-2.5 text-right">{line.debit ? <span className="num">{money(line.debit)}</span> : null}</td>
              <td className="px-3 py-2.5 text-right">{line.credit ? <span className="num">{money(line.credit)}</span> : null}</td>
              <td className="hidden px-3 py-2.5 text-[12px] text-muted-foreground sm:table-cell">{line.memo}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t-2 border-border bg-surface-raised/50 font-semibold">
            <td className="px-3 py-2.5">الإجمالي</td>
            <td className="px-3 py-2.5 text-right"><span className="num">{money(entry.totalDebit)}</span></td>
            <td className="px-3 py-2.5 text-right"><span className="num">{money(entry.totalCredit)}</span></td>
            <td className="hidden px-3 py-2.5 sm:table-cell">
              {balanced ? (
                <span className="inline-flex items-center gap-1 text-[12px] text-success">
                  <CheckCircle2 className="size-3.5" />
                  متوازن
                </span>
              ) : (
                <span className="text-[12px] text-destructive">غير متوازن</span>
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

function EntryNotes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <ul className="space-y-1.5 rounded-xl bg-surface-raised px-4 py-3 text-[12px] leading-6 text-muted-foreground">
      {notes.map((note) => (
        <li key={note}>{note}</li>
      ))}
    </ul>
  );
}

const TREATMENT_NOTE =
  "الإيراد صافي المبيعات بدون الضريبة، وعمولة المنصة ورسومها مصروفات مستقلة (المنصة وكيل للمطعم). الأرقام من نتيجة التدقيق المحفوظة دون أي تعديل.";

function AccountsButton({ onClick }: { onClick: () => void }) {
  const { can } = useWorkspaceAccess();
  if (!can("contracts.manage")) return null;
  return (
    <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={onClick}>
      <Settings2 className="size-4" />
      دليل الحسابات
    </Button>
  );
}

/** Pop-up with one journal entry: accounts, debit, credit, memo, totals, notes, Excel export. */
export function JournalEntryDialog({ entry, onClose }: { entry: JournalEntry | null; onClose: () => void }) {
  const [editing, setEditing] = useState(false);

  function exportEntry() {
    if (!entry) return;
    exportXlsx(
      [
        {
          name: "القيد",
          rows: [...entryRows(entry), { code: "", account: "الإجمالي", debit: entry.totalDebit, credit: entry.totalCredit, memo: entry.description }],
          columns: [...ENTRY_COLUMNS],
        },
      ],
      "journal-" + fileSlug(entry.description),
    );
  }

  return (
    <Dialog open={Boolean(entry)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        {entry ? (
          <>
            <DialogHeader className="text-start sm:text-start">
              <DialogTitle className="flex items-center gap-2 font-display text-lg">
                <BookOpenCheck className="size-5 text-primary-text" />
                القيد المحاسبي
              </DialogTitle>
              <DialogDescription>
                {entry.description}
                {entry.date ? " · بتاريخ " + arabicDate(entry.date) : ""}
              </DialogDescription>
            </DialogHeader>

            <EntryTable entry={entry} />
            <EntryNotes notes={entry.notes} />
            <p className="text-[11.5px] leading-5 text-muted-foreground">{TREATMENT_NOTE}</p>

            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" className="gap-1.5" onClick={exportEntry}>
                <Download className="size-4" />
                تصدير Excel
              </Button>
              <AccountsButton onClick={() => setEditing(true)} />
            </div>
          </>
        ) : null}
      </DialogContent>
      <AccountsDialog open={editing} onClose={() => setEditing(false)} />
    </Dialog>
  );
}

export interface BranchJournal {
  branch: string;
  entry: JournalEntry;
}

/** Pop-up with one separate journal entry per branch, a jump list, and one Excel workbook for all of them. */
export function BranchJournalsDialog({
  title,
  journals,
  onClose,
}: {
  title: string;
  journals: BranchJournal[] | null;
  onClose: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const unbalanced = journals?.filter((journal) => !isBalanced(journal.entry)).length ?? 0;

  function exportAll() {
    if (!journals?.length) return;
    const ledger: EntryRow[] = journals.flatMap((journal, index) =>
      entryRows(journal.entry).map((row) => ({ entryNo: index + 1, branch: journal.branch, ...row })),
    );
    exportXlsx(
      [
        {
          name: "القيود",
          rows: ledger,
          columns: [
            { key: "entryNo", header: "رقم القيد" },
            { key: "branch", header: "الفرع", type: "text" },
            ...ENTRY_COLUMNS,
          ],
        },
        ...journals.map((journal, index) => ({
          name: sheetName(index, journal.branch),
          rows: [
            ...entryRows(journal.entry),
            { code: "", account: "الإجمالي", debit: journal.entry.totalDebit, credit: journal.entry.totalCredit, memo: journal.entry.description },
          ],
          columns: [...ENTRY_COLUMNS],
        })),
      ],
      "journals-" + fileSlug(title),
    );
  }

  function jumpTo(index: number) {
    document.getElementById("branch-journal-" + index)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <Dialog open={Boolean(journals)} onOpenChange={(open) => !open && onClose()}>
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
        {journals ? (
          <>
            <DialogHeader className="text-start sm:text-start">
              <DialogTitle className="flex items-center gap-2 font-display text-lg">
                <BookOpenCheck className="size-5 text-primary-text" />
                القيود المحاسبية لكل فرع
              </DialogTitle>
              <DialogDescription>
                {title} · {journals.length} {journals.length === 1 ? "قيد" : "قيود"}، قيد مستقل لكل فرع
                {unbalanced ? " · " + unbalanced + " غير متوازن" : ""}
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" className="gap-1.5" onClick={exportAll} disabled={!journals.length}>
                <Download className="size-4" />
                تصدير كل القيود Excel
              </Button>
              <AccountsButton onClick={() => setEditing(true)} />
            </div>

            {journals.length > 1 ? (
              <nav aria-label="الفروع" className="flex flex-wrap gap-1.5">
                {journals.map((journal, index) => (
                  <button
                    key={index}
                    type="button"
                    onClick={() => jumpTo(index)}
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-[12px] hover:border-primary hover:text-primary-text",
                      !isBalanced(journal.entry) && "border-destructive/50 text-destructive",
                    )}
                  >
                    <span className="num text-[11px] text-muted-foreground">{index + 1}</span>
                    <span>{journal.branch}</span>
                  </button>
                ))}
              </nav>
            ) : null}

            {journals.length ? (
              <div className="space-y-6">
                {journals.map((journal, index) => (
                  <section key={index} id={"branch-journal-" + index} className="scroll-mt-4 space-y-2.5">
                    <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border pb-2">
                      <h3 className="flex items-center gap-2 font-display text-[15px] font-semibold">
                        <span className="rounded-full bg-surface-raised px-2 py-0.5 font-sans text-[11px] font-medium text-muted-foreground">
                          قيد <span className="num">{index + 1}</span>
                        </span>
                        <span>{journal.branch}</span>
                      </h3>
                      <span className="text-[12px] text-muted-foreground">
                        {journal.entry.date ? "بتاريخ " + arabicDate(journal.entry.date) : ""}
                      </span>
                    </header>
                    <EntryTable entry={journal.entry} />
                    <EntryNotes notes={journal.entry.notes} />
                  </section>
                ))}
              </div>
            ) : (
              <p className="py-10 text-center text-sm text-muted-foreground">لا توجد فروع في هذه الفترة.</p>
            )}

            <p className="text-[11.5px] leading-5 text-muted-foreground">{TREATMENT_NOTE}</p>
          </>
        ) : null}
      </DialogContent>
      <AccountsDialog open={editing} onClose={() => setEditing(false)} />
    </Dialog>
  );
}

/** Edit the workspace's account codes and names for the ten entry accounts. */
export function AccountsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const queryClient = useQueryClient();
  const accounts = useJournalAccounts();
  const [draft, setDraft] = useState<Record<JournalAccountKey, { code: string; name: string }>>(() => toDraft(accounts));

  useEffect(() => {
    if (open) setDraft(toDraft(accounts));
    // Reset the form each time it opens from the saved accounts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = useMutation({
    mutationFn: () =>
      saveJournalAccounts({
        data: { accounts: JOURNAL_ACCOUNT_ORDER.map((key) => ({ key, code: draft[key].code, name: draft[key].name })) },
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: JOURNAL_ACCOUNTS_KEY });
      toast.success("تم حفظ دليل الحسابات");
      onClose();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <Dialog open={open} onOpenChange={(value) => !value && onClose()}>
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader className="text-start sm:text-start">
          <DialogTitle className="font-display text-lg">دليل الحسابات</DialogTitle>
          <DialogDescription>اربط حسابات القيد برموز وأسماء حساباتك. الحقل الفارغ يستخدم الاسم الافتراضي.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {JOURNAL_ACCOUNT_ORDER.map((key) => (
            <div key={key} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center">
              <Input
                aria-label={"رمز " + DEFAULT_JOURNAL_ACCOUNTS[key].name}
                dir="ltr"
                placeholder="الرمز"
                value={draft[key].code}
                maxLength={40}
                onChange={(event) => setDraft((current) => ({ ...current, [key]: { ...current[key], code: event.target.value } }))}
                className="h-9 text-start font-mono"
              />
              <Input
                aria-label={"اسم " + DEFAULT_JOURNAL_ACCOUNTS[key].name}
                placeholder={DEFAULT_JOURNAL_ACCOUNTS[key].name}
                value={draft[key].name}
                maxLength={160}
                onChange={(event) => setDraft((current) => ({ ...current, [key]: { ...current[key], name: event.target.value } }))}
                className="h-9"
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button type="button" disabled={save.isPending} onClick={() => save.mutate()} className="gap-1.5">
            {save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
            حفظ
          </Button>
          <Button type="button" variant="outline" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function toDraft(accounts: JournalAccounts): Record<JournalAccountKey, { code: string; name: string }> {
  return Object.fromEntries(
    JOURNAL_ACCOUNT_ORDER.map((key) => [
      key,
      { code: accounts[key].code, name: accounts[key].name === DEFAULT_JOURNAL_ACCOUNTS[key].name ? "" : accounts[key].name },
    ]),
  ) as Record<JournalAccountKey, { code: string; name: string }>;
}
