import { PageHeader } from "@/components/workspace/PageKit";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpenCheck } from "lucide-react";
import { useState } from "react";

import { BranchJournalsDialog, JournalEntryDialog } from "@/components/journal/JournalEntryDialog";
import type { BranchJournal } from "@/components/journal/journal-export";
import { useJournalAccounts } from "@/components/journal/use-journal-accounts";
import { useJournalCostCenters } from "@/components/journal/use-journal-cost-centers";
import { Button } from "@/components/ui/button";
import { costCenterKey } from "@/lib/journal-cost-centers";
import { branchJournalEntry, type JournalEntry } from "@/lib/journal-entries";

import { listBranchRegistry, resolveBranchName } from "@/lib/branch-registry";
import { displayBranchName } from "@/lib/reporting-metrics";
import { BRANCH_REPORT_NOTE, branchReportColumns, branchReportRow, type BranchReportView } from "@/lib/branch-report";
import { ALLOCATION_RULE_AR, invoiceOnlyAllocation } from "@/lib/invoice-only-allocation";
import { money } from "@/lib/format";
import type { StoredPeriod } from "@/lib/periods";

import { EmptyState } from "@/components/AppShell";
import { ReportTable, type Column } from "@/components/ReportTable";
import { Segmented } from "@/components/dash/DashKit";
import { useSelectedPeriod } from "@/lib/use-period";

export const Route = createFileRoute("/_authenticated/branches")({
  head: () => ({
    meta: [
      { title: "تقرير الفروع · تدقيق" },
      { name: "description", content: "مبيعات وعمولات ورسوم كل فرع خلال الفترة." },
      { property: "og:title", content: "تقرير الفروع · تدقيق" },
      { property: "og:description", content: "مبيعات وعمولات ورسوم كل فرع خلال الفترة." },
    ],
  }),
  component: BranchesPage,
});

function BranchesPage() {
  const { selected, isLoading } = useSelectedPeriod();
  const { data: registry = [] } = useQuery({ queryKey: ["branch-registry"], queryFn: listBranchRegistry });
  const accounts = useJournalAccounts();
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [entryKey, setEntryKey] = useState<string | undefined>(undefined);
  const costCenters = useJournalCostCenters(selected?.platform);
  const [journals, setJournals] = useState<BranchJournal[] | null>(null);
  const [view, setView] = useState<BranchReportView>("summary");

  if (isLoading) {
    return <p className="py-20 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>;
  }
  if (!selected) {
    return <EmptyState title="لا توجد فترات محفوظة" body="ارفع ملفات الفترة لعرض تقرير الفروع." />;
  }

  const rows = selected.branches.map((b, index) =>
    branchReportRow(selected, b, resolveBranchName(registry, selected.platform, b.branchId, b.branch) ?? displayBranchName(b.branch), index),
  );
  const columnsFor = (which: BranchReportView, target: "screen" | "export" = "export") =>
    branchReportColumns(selected.platform, which, rows, target) as unknown as Column<Record<string, unknown>>[];

  const period = selected;
  function openAllBranches() {
    setJournals(
      rows.map((row) => ({
        branch: row.branch,
        entry: branchJournalEntry(period, { ...period.branches[row.journalIndex]!, branch: row.branch }, accounts),
        costCenterKey: costCenterKey(period.branches[row.journalIndex]!),
      })),
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "الرئيسية", to: "/dashboard" }, { label: "التقارير" }, { label: "تقرير الفروع" }]}
        title="تقرير الفروع"
        subtitle="اضغط على فرع لعرض قيده."
        aside={
          <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-full" onClick={openAllBranches}>
            <BookOpenCheck className="size-4" />
            قيود كل الفروع
          </Button>
        }
      />
      <ReportTable
        title={selected.label}
        rows={rows as unknown as Record<string, unknown>[]}
        columns={columnsFor(view, "screen")}
        csvColumns={columnsFor(view)}
        xlsxSheets={[
          { name: "ملخص الفروع", columns: columnsFor("summary") },
          { name: "تفاصيل الفروع", columns: columnsFor("detail") },
        ]}
        filename={`branches-${view}-${selected.period_start ?? "period"}`}
        searchKey="branch"
        toolbar={
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "summary", label: "ملخص" },
              { value: "detail", label: "تفصيلي" },
            ]}
          />
        }
        cellAction={{
          key: "branch",
          label: "عرض القيد المحاسبي للفرع",
          onClick: (row) => {
            const branch = selected.branches[row["journalIndex"] as number];
            if (!branch) return;
            setEntry(branchJournalEntry(selected, { ...branch, branch: String(row["branch"]) }, accounts));
            setEntryKey(costCenterKey(branch));
          },
        }}
        footnote={BRANCH_REPORT_NOTE}
      />
      <AllocationNote period={selected} />
      <JournalEntryDialog entry={entry} costCenter={entryKey ? costCenters[entryKey] : undefined} onClose={() => setEntry(null)} />
      <BranchJournalsDialog
        title={selected.label}
        platform={selected.platform}
        journals={journals?.map((journal) => ({ ...journal, costCenter: costCenters[journal.costCenterKey ?? ""] })) ?? null}
        onClose={() => setJournals(null)}
      />
    </div>
  );
}

/** Branch totals plus what stays at platform level add up to the invoice-only total; each part names its rule. */
function AllocationNote({ period }: { period: StoredPeriod }) {
  const allocation = invoiceOnlyAllocation(period);
  if (!allocation.rows.length) return null;
  return (
    <p className="rounded-xl border border-border bg-card px-4 py-3 text-[12.5px] leading-6 text-muted-foreground">
      بنود الفاتورة فقط: على الفروع <span className="num">{money(allocation.allocated)}</span> ({ALLOCATION_RULE_AR.direct}) + غير موزّع{" "}
      <span className="num">{money(allocation.unallocated)}</span> ({ALLOCATION_RULE_AR.platform_level}) ={" "}
      <span className="num font-semibold text-foreground">{money(allocation.total)}</span> ر.س
      {allocation.invoiceTotal !== null && Math.abs(allocation.residual ?? 0) >= 0.01 ? (
        <>
          {" "}· فرق عن إجمالي البنود المأخوذة من الفاتورة <span className="num">{money(allocation.residual ?? 0)}</span>
        </>
      ) : null}
    </p>
  );
}
