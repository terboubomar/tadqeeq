import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpenCheck, Check, ChevronsUpDown, Layers, Scale } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/AppShell";
import {
  AccountsButton,
  AccountsDialog,
  CostCentersButton,
  CostCentersDialog,
  EntryNotes,
  EntryTable,
} from "@/components/journal/JournalEntryDialog";
import { SendToQoyodButton } from "@/components/integrations/SendToQoyodButton";
import { ExportJournalsMenu } from "@/components/journal/ExportJournalsMenu";
import { isBalanced, TREATMENT_NOTE, type BranchJournal } from "@/components/journal/journal-export";
import { useJournalAccounts } from "@/components/journal/use-journal-accounts";
import { useJournalCostCenters } from "@/components/journal/use-journal-cost-centers";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ActionBar, NumberTiles, PageHeader } from "@/components/workspace/PageKit";
import { listBranchRegistry, resolveBranchName } from "@/lib/branch-registry";
import { displayBranchName } from "@/lib/reporting-metrics";
import { arabicDate, money } from "@/lib/format";
import { costCenterKey, type JournalPlatform } from "@/lib/journal-cost-centers";
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
  const costCenters = useJournalCostCenters(selected?.platform);
  const journals = useMemo<BranchJournal[]>(() => {
    if (!selected) return [];
    return selected.branches.map((branch) => {
      const name = resolveBranchName(registry, selected.platform, branch.branchId, branch.branch) ?? displayBranchName(branch.branch);
      const key = costCenterKey(branch);
      return {
        branch: name,
        entry: branchJournalEntry(selected, { ...branch, branch: name }, accounts),
        costCenterKey: key,
        costCenter: costCenters[key],
      };
    });
  }, [selected, registry, accounts, costCenters]);
  const combined = useMemo(() => (selected ? periodJournalEntry(selected, accounts) : null), [selected, accounts]);

  if (isLoading) {
    return <p className="py-20 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>;
  }
  if (!selected || !combined) {
    return <EmptyState title="لا توجد فترات محفوظة" body="ارفع ملفات الفترة لعرض القيود المحاسبية." />;
  }
  return (
    <JournalReport
      title={selected.label}
      platform={selected.platform}
      periodKey={selected.lineage_id ?? selected.id}
      periodEnd={selected.period_end}
      journals={journals}
      combined={combined}
    />
  );
}

/** The report body: tiles, a list of entries (combined + one per branch) and the chosen entry. */
function JournalReport({
  title,
  platform,
  periodKey,
  periodEnd,
  journals,
  combined,
}: {
  title: string;
  platform: JournalPlatform;
  periodKey: string;
  periodEnd: string | null;
  journals: BranchJournal[];
  combined: JournalEntry;
}) {
  const [selection, setSelection] = useState<Selection>(journals.length ? 0 : "all");
  const [editing, setEditing] = useState(false);
  const [editingCenters, setEditingCenters] = useState(false);
  const current = selection === "all" ? null : journals[selection];
  const shown = current?.entry ?? combined;
  const unbalanced = journals.filter((journal) => !isBalanced(journal.entry)).length;

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "الرئيسية", to: "/dashboard" }, { label: "التقارير" }, { label: "القيود المحاسبية" }]}
        title="القيود المحاسبية"
        subtitle="قيد مستقل لكل فرع."
      />

      <ActionBar>
        <BranchPicker journals={journals} combined={combined} selection={selection} onSelect={setSelection} />
        <ExportJournalsMenu
          title={current ? title + " · " + current.branch : title}
          journals={current ? [current] : journals}
          firstNumber={current ? (selection as number) + 1 : 1}
          label={current ? "تصدير قيد الفرع" : "تصدير كل الفروع"}
          className="w-full sm:w-auto"
        />
        <SendToQoyodButton
          periodKey={periodKey}
          periodEnd={periodEnd}
          journals={current ? [current] : journals}
          firstNumber={current ? (selection as number) + 1 : 1}
          className="w-full sm:w-auto"
        />
        <div className="grid w-full grid-cols-2 gap-1.5 empty:hidden sm:flex sm:w-auto">
          <AccountsButton onClick={() => setEditing(true)} />
          <CostCentersButton onClick={() => setEditingCenters(true)} />
        </div>
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
              <p className="text-[12.5px] text-muted-foreground">{shown.description}</p>
              {shown.date || current?.costCenter ? (
                <p className="flex flex-wrap gap-1.5 pt-1.5 text-[11.5px]">
                  {shown.date ? (
                    <span className="rounded-full border border-border px-2.5 py-0.5 text-muted-foreground">
                      بتاريخ <span className="text-foreground">{arabicDate(shown.date)}</span>
                    </span>
                  ) : null}
                  {current?.costCenter ? (
                    <span className="rounded-full border border-border px-2.5 py-0.5 text-muted-foreground">
                      مركز التكلفة <span className="num text-foreground">{current.costCenter}</span>
                    </span>
                  ) : null}
                </p>
              ) : null}
            </div>
          </header>
          {current ? null : (
            <p className="rounded-xl bg-surface-raised px-3 py-2 text-[12px] leading-6 text-muted-foreground">
              مجموع قيود الفروع للمراجعة. اختر فرعاً لتصدير قيده وحده.
            </p>
          )}
          <EntryTable entry={shown} />
          <EntryNotes notes={shown.notes} />
          <p className="text-[11.5px] leading-5 text-muted-foreground">{TREATMENT_NOTE}</p>
        </section>

      <AccountsDialog open={editing} onClose={() => setEditing(false)} />
      <CostCentersDialog open={editingCenters} platform={platform} journals={journals} onClose={() => setEditingCenters(false)} />
    </div>
  );
}

/** Drop-down list of the entries (combined + every branch) with a search box, like a validation list in Excel. */
function BranchPicker({
  journals,
  combined,
  selection,
  onSelect,
}: {
  journals: BranchJournal[];
  combined: JournalEntry;
  selection: Selection;
  onSelect: (selection: Selection) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = selection === "all" ? null : journals[selection];
  const choose = (value: Selection) => {
    onSelect(value);
    setOpen(false);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-label="اختر الفرع"
          className="flex h-9 w-full min-w-0 items-center gap-2 rounded-lg border border-border bg-card px-3 text-start text-[13px] hover:border-primary/60 sm:w-[320px]"
        >
          {current ? (
            <span className="grid size-5 shrink-0 place-items-center rounded-full bg-surface-raised text-[10.5px] text-muted-foreground">
              <span className="num">{(selection as number) + 1}</span>
            </span>
          ) : (
            <Layers className="size-4 shrink-0 text-primary-text" />
          )}
          <span className="min-w-0 flex-1 truncate font-medium">{current ? current.branch : "كل الفروع (مجمّع)"}</span>
          <ChevronsUpDown className="size-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent dir="rtl" align="start" className="w-[var(--radix-popover-trigger-width)] min-w-[280px] p-0">
        <Command>
          <CommandInput placeholder="ابحث عن فرع…" />
          <CommandList>
            <CommandEmpty>لا يوجد فرع بهذا الاسم.</CommandEmpty>
            <CommandGroup>
              <PickerItem
                value="كل الفروع مجمع"
                active={selection === "all"}
                onSelect={() => choose("all")}
                title="كل الفروع (مجمّع)"
                amount={lineAmount(combined, "platform_receivable", "debit")}
                balanced={isBalanced(combined)}
              />
              {journals.map((journal, index) => (
                <PickerItem
                  key={index}
                  value={index + 1 + " " + journal.branch}
                  active={selection === index}
                  onSelect={() => choose(index)}
                  number={index + 1}
                  title={journal.branch}
                  amount={lineAmount(journal.entry, "platform_receivable", "debit")}
                  balanced={isBalanced(journal.entry)}
                />
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function PickerItem({
  value,
  active,
  onSelect,
  number,
  title,
  amount,
  balanced,
}: {
  value: string;
  active: boolean;
  onSelect: () => void;
  number?: number;
  title: string;
  amount: number;
  balanced: boolean;
}) {
  return (
    <CommandItem value={value} onSelect={onSelect} className="gap-2.5 py-2">
      <Check className={cn("size-4 shrink-0 text-primary-text", active ? "opacity-100" : "opacity-0")} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          {number ? <span className="num text-[11px] text-muted-foreground">{number}</span> : null}
          <span className="truncate text-[13px] font-medium">{title}</span>
        </span>
        <span className={cn("block text-[11.5px]", balanced ? "text-muted-foreground" : "text-destructive")}>
          {balanced ? "مستحق " : "غير متوازن · "}
          <span className="num">{money(amount)}</span>
        </span>
      </span>
    </CommandItem>
  );
}
