import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ProductName } from "@/components/ProductName";
import { Check, CircleCheck, Columns3, Eye } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { Button } from "@/components/ui/button";
import { count, percent } from "@/lib/format";
import type { StoredPeriod } from "@/lib/periods";
import { detectAnomalies, type WatchAlert, type WatchMetric } from "@/lib/smart-watch/detect";
import type { SmartWatchAcceptances } from "@/lib/smart-watch/smart-watch.server";
import {
  acceptSmartWatchAlert,
  listSmartWatchAcceptances,
  undoSmartWatchAcceptance,
} from "@/lib/smart-watch/smart-watch.functions";

const METRIC_LABEL: Record<WatchMetric, string> = {
  commission: "العمولة",
  payment_fees: "رسوم الدفع",
  delivery: "التوصيل والحملات",
  compensation: "التعويضات",
  total_cost: "إجمالي الخصومات",
};

const QUERY_KEY = ["smart-watch-acceptances"];
const VISIBLE = 5;

/** "+1,770 ر.س", with the number kept left-to-right inside Arabic text. */
function Extra({ value }: { value: number }) {
  return (
    <span className="whitespace-nowrap">
      <span className="num" dir="ltr">
        +{count(Math.round(value))}
      </span>{" "}
      ر.س
    </span>
  );
}

const COLUMNS = "md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)_64px_64px_104px_80px]";

/**
 * Dashboard card for the smart watch: branches whose platform charges are unusual for them,
 * biggest SAR impact first. Reads the saved periods only; audit figures are never changed.
 */
export function SmartWatchCard({ selected, periods }: { selected: StoredPeriod; periods: StoredPeriod[] }) {
  const queryClient = useQueryClient();
  const { can } = useWorkspaceAccess();
  const [showAll, setShowAll] = useState(false);
  const { data } = useQuery({
    queryKey: QUERY_KEY,
    queryFn: () => listSmartWatchAcceptances({ data: {} }),
    staleTime: 5 * 60_000,
  });
  const acceptances = data?.acceptances;
  const report = useMemo(() => detectAnomalies(selected, periods, acceptances ?? []), [selected, periods, acceptances]);
  const canAnswer = can("exceptions.manage") && data?.available === true;

  const setAcceptances = (update: (current: SmartWatchAcceptances) => SmartWatchAcceptances) =>
    queryClient.setQueryData<SmartWatchAcceptances>(QUERY_KEY, (current) => update(current ?? { acceptances: [], available: true }));

  async function markExpected(alert: WatchAlert) {
    const entry = { platform: selected.platform, branchKey: alert.branchKey, metric: alert.metric };
    const previous = queryClient.getQueryData<SmartWatchAcceptances>(QUERY_KEY);
    setAcceptances((current) => ({
      ...current,
      acceptances: [
        ...current.acceptances.filter((a) => !(a.platform === entry.platform && a.branchKey === entry.branchKey && a.metric === entry.metric)),
        { ...entry, acceptedRate: alert.rate },
      ],
    }));
    try {
      await acceptSmartWatchAlert({
        data: { ...entry, branchName: alert.branch, acceptedRate: alert.rate, typicalRate: alert.typical, periodId: selected.id },
      });
      toast.success("تم. لن ننبّهك على هذا المستوى مرة أخرى.", {
        action: {
          label: "تراجع",
          onClick: () => {
            void undoSmartWatchAcceptance({ data: entry }).finally(() => queryClient.invalidateQueries({ queryKey: QUERY_KEY }));
          },
        },
      });
    } catch (cause) {
      queryClient.setQueryData(QUERY_KEY, previous);
      toast.error(cause instanceof Error ? cause.message : "تعذّر الحفظ.");
    }
  }

  const columnChanges = selected.invoice?.columnChanges ?? [];
  const alerts = showAll ? report.alerts : report.alerts.slice(0, VISIBLE);
  const total = report.alerts.reduce((sum, alert) => sum + alert.impact, 0);
  const basis = report.historyPeriods > 0 ? `مقارنة بآخر ${count(report.historyPeriods)} فترات` : "مقارنة بالفروع الأخرى";

  return (
    <section className="panel overflow-hidden">
      <header className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-border px-5 py-3.5">
        <div className="flex items-center gap-2">
          <Eye className="size-4 text-primary-text" />
          <h2 className="text-[14px] font-bold"><ProductName product="raqeeb" descriptorClassName="ms-1.5 text-[11.5px] font-medium text-muted-foreground" /></h2>
          <span
            className="text-[11.5px] text-muted-foreground"
            title={report.historyPeriods > 0 ? undefined : "ارفع فترات سابقة لهذه المنصة لتكون المقارنة مع تاريخ كل فرع"}
          >
            {basis}
          </span>
        </div>
        {report.alerts.length > 0 || columnChanges.length > 0 ? (
          <span className="rounded-full bg-destructive-soft px-2.5 py-0.5 text-[12px] font-semibold text-destructive">
            {report.alerts.length > 0 ? (
              <>
                {count(report.alerts.length)} غير معتاد · <Extra value={total} />
              </>
            ) : (
              `${count(columnChanges.length)} تغيير في الملف`
            )}
          </span>
        ) : null}
      </header>

      {columnChanges.length > 0 ? (
        <ul className="divide-y divide-border/70 border-b border-border bg-warning/5">
          {columnChanges.map((change) => (
            <li key={change.kind + change.source + change.column} className="flex items-start gap-3 px-5 py-2.5">
              <Columns3 className="mt-0.5 size-4 shrink-0 text-warning" />
              <span className="min-w-0 flex-1 text-[12.5px] leading-6">
                {change.kind === "added" ? "عمود مبالغ جديد: " : "عمود مبالغ اختفى: "}
                <span className="font-semibold" dir="ltr">
                  {change.column}
                </span>
                {change.replaces ? (
                  <span className="text-muted-foreground">
                    {" "}
                    · بدل <span dir="ltr">{change.replaces}</span>
                  </span>
                ) : null}
                <span className="block text-[11.5px] text-muted-foreground">
                  {change.kind === "added" ? "تأكد أنه محسوب في التدقيق." : "كان فيه مبالغ في ملفاتك السابقة."}
                </span>
              </span>
              {change.kind === "added" && change.total ? (
                <span className="shrink-0 whitespace-nowrap text-[12.5px] font-semibold">
                  <span className="num" dir="ltr">
                    {count(Math.round(change.total))}
                  </span>{" "}
                  ر.س
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      {report.alerts.length === 0 && columnChanges.length > 0 ? null : report.alerts.length === 0 ? (
        <p className="flex items-center gap-2 px-5 py-4 text-[13px] text-muted-foreground">
          <CircleCheck className="size-4 text-success" />
          {report.checkedBranches === 0 ? "لا توجد فروع بمبيعات كافية للمقارنة." : "لا شيء غير معتاد في هذه الفترة."}
        </p>
      ) : (
        <>
          <div className={`hidden items-center gap-x-4 ${COLUMNS} border-b border-border/70 bg-muted/40 px-5 py-2 text-[11.5px] font-medium text-muted-foreground md:grid`}>
            <span>الفرع</span>
            <span>البند</span>
            <span>الآن</span>
            <span>المعتاد</span>
            <span>زيادة تقريبية</span>
            <span />
          </div>
          <ul className="divide-y divide-border/70">
            {alerts.map((alert) => (
              <li
                key={alert.id}
                className={`grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-5 py-3 md:gap-x-4 ${COLUMNS}`}
              >
                <span className="truncate text-[13px] font-medium" title={alert.branch}>
                  {alert.branch}
                </span>
                <span className="text-[12.5px] text-muted-foreground max-md:hidden">{METRIC_LABEL[alert.metric]}</span>
                <span className="num text-[13px] font-semibold text-destructive max-md:hidden">{percent(alert.rate, 1)}</span>
                <span className="num text-[13px] text-muted-foreground max-md:hidden">{percent(alert.typical, 1)}</span>
                <span className="text-[13px] font-semibold max-md:col-start-2 max-md:row-start-1">
                  <Extra value={alert.impact} />
                </span>
                <span className="text-[12px] text-muted-foreground max-md:col-start-1 max-md:row-start-2 md:hidden">
                  {METRIC_LABEL[alert.metric]} <span className="num font-semibold text-destructive">{percent(alert.rate, 1)}</span> · المعتاد{" "}
                  <span className="num">{percent(alert.typical, 1)}</span>
                </span>
                <span className="max-md:col-start-2 max-md:row-start-2 max-md:justify-self-end">
                  {canAnswer ? (
                    <Button type="button" size="sm" variant="outline" className="h-7 px-2.5 text-[12px]" onClick={() => void markExpected(alert)}>
                      <Check className="size-3.5" />
                      متوقع
                    </Button>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {report.alerts.length > VISIBLE ? (
            <button
              type="button"
              className="w-full border-t border-border/70 py-2.5 text-[12.5px] font-medium text-primary-text hover:bg-muted/50"
              onClick={() => setShowAll((value) => !value)}
            >
              {showAll ? "عرض أقل" : `عرض الكل (${count(report.alerts.length)})`}
            </button>
          ) : null}
        </>
      )}
    </section>
  );
}
