import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpenCheck, Download, Layers, Scale } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/AppShell";
import { AccountsButton, AccountsDialog, EntryNotes, EntryTable } from "@/components/journal/JournalEntryDialog";
import { exportBranchJournals, isBalanced, TREATMENT_NOTE, type BranchJournal } from "@/components/journal/journal-export";
import { useJournalAccounts } from "@/components/journal/use-journal-accounts";
import { Button } from "@/components/ui/button";
import { ActionBar, NumberTiles, PageHeader } from "@/components/workspace/PageKit";
import { listBranchRegistry, resolveBranchName } from "@/lib/branch-registry";
import { arabicDate, money } from "@/lib/format";
import { branchJournalEntry, periodJournalEntry, type JournalEntry } from "@/lib/journal-entries";
import { useSelectedPeriod } from "@/lib/use-period";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/journal")({
  head: () => ({
    meta: [
      { title: "القيود المحاسبية · تدقيق" },
      { name: "description", content: "قيد محاسبي مستقل لكل فرع من نتيجة التدقيق، جاهز للتصدير إلى نظامك المحاسبي." },
      { property: "og:title", content: "القيود المحاسبية · تدقيق" },
      { property: "og:description", content: "قيد محاسبي مستقل لكل فرع من نتيجة التدقيق، جاهز للتصدير إلى نظامك المحاسبي." },
    ],
  }),
  component: JournalPage,
});

/** "all" is the period's combined entry; a number is the branch's position in the period. */
type Selection = "all" | number;

function lineAmount(entry: JournalEntry, key: string, side: "debit" | "credit"): number {
  return entry.lines.find((line) => line.account.key === key)?.[side] ?? 0;
}

function JournalPage() {
  const { selected, isLoading } = useSelectedPeriod();
  const { data: registry = [] } = useQuery({ queryKey: ["branch-registry"], queryFn: listBranchRegistry });
  const accounts = useJournalAccounts();
  const journals = useMemo<BranchJournal[]>(() => {
    if (!selected) return [];
    return selected.branches.map((branch) => {
      const name = resolveBranchName(registry, selected.platform, branch.branchId, branch.branch) ?? branch.branch;
      return { branch: name, entry: branchJournalEntry(selected, { ...branch, branch: name }, accounts) };
    });
  }, [selected, registry, accounts]);
  const combined = useMemo(() => (selected ? periodJournalEntry(selected, accounts) : null), [selected, accounts]);

  if (isLoading) {
    return <p className="py-20 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>;
  }
  if (!selected || !combined) {
    return <EmptyState title="لا توجد فترات محفوظة" body="ارفع ملفات الفترة لعرض القيود المحاسبية." />;
  }
  return <JournalReport title={selected.label} journals={journals} combined={combined} />;
}

/** The report body: tiles, a list of entries (combined + one per branch) and the chosen entry. */
function JournalReport({ title, journals, combined }: { title: string; journals: BranchJournal[]; combined: JournalEntry }) {
  const [selection, setSelection] = useState<Selection>(journals.length ? 0 : "all");
  const [editing, setEditing] = useState(false);
  const current = selection === "all" ? null : journals[selection];
  const shown = current?.entry ?? combined;
  const unbalanced = journals.filter((journal) => !isBalanced(journal.entry)).length;

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "الرئيسية", to: "/dashboard" }, { label: "التقارير" }, { label: "القيود المحاسبية" }]}
        title="القيود المحاسبية"
        subtitle="قيد مستقل لكل فرع من نتيجة التدقيق المحفوظة: الإيراد صافي المبيعات، ورسوم المنصة مصروفات، والضريبة مخرجات ومدخلات."
      />

      <ActionBar>
        <Button type="button" size="sm" className="gap-1.5" disabled={!journals.length} onClick={() => exportBranchJournals(title, journals)}>
          <Download className="size-4" />
          تصدير كل القيود Excel
        </Button>
        <AccountsButton onClick={() => setEditing(true)} />
      </ActionBar>

      <NumberTiles
        items={[
          { label: "عدد القيود", value: String(journals.length), hint: "قيد لكل فرع", icon: Layers },
          {
            label: "إيراد المبيعات",
            value: money(lineAmount(combined, "sales_revenue", "credit")),
            hint: "صافي المبيعات بدون الضريبة",
            tone: "gold",
          },
          {
            label: "المستحق من المنصة",
            value: money(lineAmount(combined, "platform_receivable", "debit")),
            hint: "مجموع ذمم الفروع",
          },
          unbalanced
            ? { label: "قيود غير متوازنة", value: String(unbalanced), hint: "راجع الفروع المعلّمة", tone: "danger", icon: Scale }
            : { label: "المدين = الدائن", value: money(combined.totalDebit), hint: "كل القيود متوازنة", tone: "success", icon: Scale },
        ]}
      />

      <div className="grid items-start gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <nav aria-label="الفروع" className="flex gap-2 overflow-x-auto pb-1 lg:sticky lg:top-4 lg:flex-col lg:overflow-visible lg:pb-0">
          <EntryChoice
            active={selection === "all"}
            onClick={() => setSelection("all")}
            title="كل الفروع (مجمّع)"
            amount={lineAmount(combined, "platform_receivable", "debit")}
            balanced={isBalanced(combined)}
          />
          {journals.map((journal, index) => (
            <EntryChoice
              key={index}
              active={selection === index}
              onClick={() => setSelection(index)}
              number={index + 1}
              title={journal.branch}
              amount={lineAmount(journal.entry, "platform_receivable", "debit")}
              balanced={isBalanced(journal.entry)}
            />
          ))}
        </nav>

        <section className="min-w-0 space-y-3 rounded-2xl border border-border bg-card p-4 sm:p-5">
          <header className="flex flex-wrap items-start justify-between gap-2">
            <div className="space-y-0.5">
              <h2 className="flex items-center gap-2 font-display text-[16px] font-bold">
                <BookOpenCheck className="size-5 text-primary-text" />
                {current ? current.branch : "قيد الفترة لكل الفروع"}
                {current ? (
                  <span className="rounded-full bg-surface-raised px-2 py-0.5 font-sans text-[11px] font-medium text-muted-foreground">
                    قيد <span className="num">{(selection as number) + 1}</span>
                  </span>
                ) : null}
              </h2>
              <p className="text-[12.5px] text-muted-foreground">
                {shown.description}
                {shown.date ? " · بتاريخ " + arabicDate(shown.date) : ""}
              </p>
            </div>
          </header>
          {current ? null : (
            <p className="rounded-xl bg-surface-raised px-3 py-2 text-[12px] leading-6 text-muted-foreground">
              هذا مجموع قيود الفروع سطراً بسطر، للمراجعة فقط. التصدير يعطي قيداً مستقلاً لكل فرع.
            </p>
          )}
          <EntryTable entry={shown} />
          <EntryNotes notes={shown.notes} />
          <p className="text-[11.5px] leading-5 text-muted-foreground">{TREATMENT_NOTE}</p>
        </section>
      </div>

      <AccountsDialog open={editing} onClose={() => setEditing(false)} />
    </div>
  );
}

function EntryChoice({
  active,
  onClick,
  number,
  title,
  amount,
  balanced,
}: {
  active: boolean;
  onClick: () => void;
  number?: number;
  title: string;
  amount: number;
  balanced: boolean;
}) {
  return (
    <button
      type="button"
      aria-current={active ? "true" : undefined}
      onClick={onClick}
      className={cn(
        "flex min-w-[180px] shrink-0 items-center gap-2.5 rounded-xl border px-3 py-2.5 text-start transition-colors lg:min-w-0",
        active ? "border-primary bg-primary/10" : "border-border bg-card hover:border-primary/60",
        !balanced && "border-destructive/50",
      )}
    >
      {number ? (
        <span className="grid size-6 shrink-0 place-items-center rounded-full bg-surface-raised text-[11px] text-muted-foreground">
          <span className="num">{number}</span>
        </span>
      ) : (
        <Layers className="size-4 shrink-0 text-primary-text" />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium">{title}</span>
        <span className={cn("block text-[11.5px]", balanced ? "text-muted-foreground" : "text-destructive")}>
          {balanced ? "مستحق " : "غير متوازن · "}
          <span className="num">{money(amount)}</span>
        </span>
      </span>
    </button>
  );
}
