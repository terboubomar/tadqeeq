import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ArrowLeft, Check, GitMerge } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { EmptyState } from "@/components/AppShell";
import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { PlatformName } from "@/components/brand/PlatformLogo";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { PageHeader, Section } from "@/components/workspace/PageKit";
import { crossPlatformRows } from "@/lib/branch-comparison";
import { BRANCH_PLATFORMS, linkedPlatforms, mergeCandidates, suggestMerges, unmatchedBranches } from "@/lib/branch-matching";
import { listBranchRegistry, mergeBranches, type RegistryBranch } from "@/lib/branch-registry";
import { money, percent } from "@/lib/format";
import { displayBranchName } from "@/lib/reporting-metrics";
import { usePeriods } from "@/lib/use-period";

export const Route = createFileRoute("/_authenticated/branch-mapping")({
  head: () => ({
    meta: [
      { title: "ربط الفروع بين المنصات · تدقيق" },
      { name: "description", content: "ربط اسم كل فرع في هنقرستيشن وكيتا وجاهز بفرع واحد، ومقارنته بين المنصات." },
    ],
  }),
  component: BranchMappingPage,
});

const KEY = ["branch-registry"];

function Platforms({ row }: { row: RegistryBranch }) {
  return (
    <span className="flex flex-wrap gap-2">
      {linkedPlatforms(row).map((platform) => (
        <PlatformName key={platform} platform={platform} className="text-[11.5px] text-muted-foreground" iconClassName="size-3.5 rounded" />
      ))}
    </span>
  );
}

function BranchMappingPage() {
  const { can } = useWorkspaceAccess();
  const canManage = can("branches.manage");
  const queryClient = useQueryClient();
  const { data: registry = [], isLoading } = useQuery({ queryKey: KEY, queryFn: listBranchRegistry });
  const { data: periods = [] } = usePeriods();
  const [pending, setPending] = useState<{ source: RegistryBranch; target: RegistryBranch } | null>(null);
  const [picked, setPicked] = useState<Record<string, string>>({});

  const suggestions = useMemo(() => suggestMerges(registry), [registry]);
  const unmatched = useMemo(() => unmatchedBranches(registry, suggestions), [registry, suggestions]);
  const comparison = useMemo(() => crossPlatformRows(registry, periods), [registry, periods]);
  const platformsInUse = BRANCH_PLATFORMS.filter((platform) => registry.some((row) => linkedPlatforms(row).includes(platform)));

  const merge = useMutation({
    mutationFn: ({ source, target }: { source: RegistryBranch; target: RegistryBranch }) => mergeBranches(source.id, target.id),
    onSuccess: async () => {
      toast.success("تم ربط الفرعين.");
      setPending(null);
      await queryClient.invalidateQueries({ queryKey: KEY });
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "تعذّر دمج الفرعين."),
  });

  if (isLoading) return <p className="py-20 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>;
  if (!registry.length) {
    return <EmptyState title="لا توجد فروع بعد" body="تُضاف الفروع تلقائياً عند رفع ملفات أي منصة." />;
  }

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "الرئيسية", to: "/dashboard" }, { label: "الإعداد" }, { label: "ربط الفروع بين المنصات" }]}
        title="ربط الفروع بين المنصات"
        subtitle="كل منصة تسمّي الفرع باسم مختلف. اربط الأسماء بفرع واحد لتقارنه بين هنقرستيشن وكيتا وجاهز."
      />

      <Section title="بحاجة لمراجعة" summary={`${suggestions.length + unmatched.length} فرع`}>
        {suggestions.length === 0 && unmatched.length === 0 ? (
          <p className="flex items-center gap-2 px-5 py-4 text-sm text-muted-foreground">
            <Check className="size-4 text-success" />
            كل الفروع مربوطة أو لا يوجد لها مقابل على منصة أخرى.
          </p>
        ) : null}
        {suggestions.length ? (
          <ul className="divide-y divide-border/70">
            {suggestions.map(({ source, target }) => (
              <li key={source.id + target.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto_1fr] sm:items-center sm:gap-4">
                  <div>
                    <p className="font-semibold">{displayBranchName(source.name)}</p>
                    <Platforms row={source} />
                  </div>
                  <ArrowLeft aria-hidden="true" className="hidden size-4 text-muted-foreground sm:block" />
                  <div>
                    <p className="font-semibold">{displayBranchName(target.name)}</p>
                    <Platforms row={target} />
                  </div>
                </div>
                {canManage ? (
                  <Button size="sm" className="gap-1.5 self-start rounded-full sm:self-auto" onClick={() => setPending({ source, target })}>
                    <GitMerge className="size-4" />
                    نفس الفرع، اربطهما
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {unmatched.length ? (
          <div className="border-t border-border/70 px-5 py-4">
            <p className="text-[13px] font-semibold">بلا مقابل مقترح</p>
            <p className="mt-1 text-[12.5px] text-muted-foreground">إذا كان للفرع اسم آخر على منصة أخرى، اختره واربطهما.</p>
            <ul className="mt-3 space-y-2.5">
              {unmatched.map((row) => {
                const options = mergeCandidates(row, registry);
                const choice = picked[row.id] ?? "";
                const target = options.find((option) => option.id === choice);
                return (
                  <li key={row.id} className="flex flex-col gap-2 rounded-xl border border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-semibold">{displayBranchName(row.name)}</p>
                      <Platforms row={row} />
                    </div>
                    {canManage && options.length ? (
                      <div className="flex items-center gap-2">
                        <select
                          aria-label={`الفرع المقابل لـ ${displayBranchName(row.name)}`}
                          className="h-9 max-w-56 rounded-lg border border-border bg-background px-2 text-sm"
                          value={choice}
                          onChange={(event) => setPicked((prev) => ({ ...prev, [row.id]: event.target.value }))}
                        >
                          <option value="">اختر الفرع المقابل…</option>
                          {options.map((option) => (
                            <option key={option.id} value={option.id}>
                              {displayBranchName(option.name)}
                            </option>
                          ))}
                        </select>
                        <Button size="sm" variant="outline" className="rounded-full" disabled={!target} onClick={() => target && setPending({ source: row, target })}>
                          اربط
                        </Button>
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </Section>

      <Section title="مقارنة الفرع بين المنصات" summary="آخر فترة لكل منصة · تكلفة المنصة = إجمالي الرسوم بدون الضريبة شاملة الإعلانات ÷ المبيعات بدون الضريبة">
        {comparison.length ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-[13px]">
              <thead className="bg-surface-raised text-[11.5px] text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 text-start font-semibold">الفرع</th>
                  {platformsInUse.map((platform) => (
                    <th key={platform} className="px-4 py-2.5 text-start font-semibold">
                      <PlatformName platform={platform} className="text-[11.5px]" iconClassName="size-3.5 rounded" />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {comparison.map((row) => (
                  <tr key={row.branchId} className="border-t border-border/70 align-top">
                    <td className="px-4 py-3 font-semibold">{displayBranchName(row.name)}</td>
                    {platformsInUse.map((platform) => {
                      const figures = row.figures[platform];
                      return (
                        <td key={platform} className="px-4 py-3">
                          {figures ? (
                            <span className="block leading-6">
                              <span className="num block">{money(figures.grossSales)}</span>
                              <span className="block text-[12px] text-muted-foreground">
                                تكلفة المنصة{" "}
                                <span className="num">{figures.platformCostPct === null ? "—" : percent(figures.platformCostPct, 1)}</span>
                              </span>
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="border-t border-border/70 px-4 py-2.5 text-[12px] text-muted-foreground">
              المبيعات شاملة الضريبة، من آخر فترة مرفوعة لكل منصة.
            </p>
          </div>
        ) : (
          <p className="px-5 py-4 text-sm text-muted-foreground">لا توجد أرقام بعد. ارفع فترة لأي منصة.</p>
        )}
      </Section>

      <Section title="كل الفروع" summary={`${registry.length} فرع`} defaultOpen={false}>
        <ul className="divide-y divide-border/70">
          {registry.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <span className="font-medium">{displayBranchName(row.name)}</span>
              <Platforms row={row} />
            </li>
          ))}
        </ul>
      </Section>

      <AlertDialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>ربط الفرعين كفرع واحد؟</AlertDialogTitle>
            <AlertDialogDescription>
              {pending ? (
                <>
                  سيُدمج «{displayBranchName(pending.source.name)}» في «{displayBranchName(pending.target.name)}»: ينتقل معرّف المنصة
                  وصلاحيات الفريق وقروبات Telegram والأدلة والحالات إلى الفرع الثاني. لا يمكن التراجع من هنا.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              disabled={merge.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (pending) merge.mutate(pending);
              }}
            >
              اربطهما
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
