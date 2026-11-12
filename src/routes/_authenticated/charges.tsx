import { PageHeader } from "@/components/workspace/PageKit";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PRODUCTS, productPageTitle } from "@/lib/products";
import { ProductName } from "@/components/ProductName";
import { AlertTriangle, ChevronLeft, Columns3, FileSpreadsheet, Sigma } from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/AppShell";
import { ChartCard } from "@/components/dash/DashKit";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  branchBreakdown,
  chargeLineSource,
  combinedBranchBreakdown,
  cpcBranchesFromAds,
  pickAdsAnalysisForPeriod,
  type BranchBreakdown,
} from "@/lib/charges-sources";
import { getAdsRoiAnalysis, listAdsRoiAnalyses } from "@/lib/ads-roi/ads-roi.functions";
import type { StoredPeriod } from "@/lib/periods";
import {
  MARKETPLACE_CHARGE_CATEGORY_LABELS,
  buildMarketplaceChargeMap,
  type MarketplaceChargeLine,
} from "@/lib/charges-mapper";
import { money, percent, sar } from "@/lib/format";
import { useSelectedPeriod } from "@/lib/use-period";
import { platformCostMap, previousPeriod } from "@/lib/platform-cost-map";
import { MERCHANT_FUNDED_DISCOUNTS_LABEL_AR, periodPlatformCharges, platformCostPct, salesExVat } from "@/lib/reporting-metrics";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/charges")({
  head: () => ({
    meta: [
      { title: productPageTitle("kashif") },
      {
        name: "description",
        content:
          "أين يذهب كل ريال تخصمه منصات التوصيل: تكلفة المنصة حسب النوع والبند، ونسبتها من المبيعات.",
      },
    ],
  }),
  component: MarketplaceChargesPage,
});

const FUNDING_LABELS: Record<MarketplaceChargeLine["fundingSource"], string> = {
  merchant: "المطعم",
  platform: "المنصة",
  shared: "مشترك",
  unknown: "غير محدد",
};

const EVIDENCE_LABELS: Record<MarketplaceChargeLine["evidence"], string> = {
  data: "بيانات تشغيلية",
  invoice: "فاتورة",
  mixed: "مصادر مختلطة",
};

type SourceFocus = { title: string; lines: MarketplaceChargeLine[] };

function MarketplaceChargesPage() {
  const { selected, periods, isLoading } = useSelectedPeriod();
  const [focus, setFocus] = useState<SourceFocus | null>(null);

  const cost = useMemo(() => (selected ? platformCostMap(selected) : null), [selected]);
  const allLines = useMemo(() => (selected ? buildMarketplaceChargeMap(selected).lines : []), [selected]);

  if (isLoading) {
    return <p className="py-20 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>;
  }
  if (!selected || !cost) {
    return <EmptyState title="لا توجد فترة تدقيق" body="ارفع بيانات منصة أولاً حتى يبني «كاشِف» خريطة الرسوم." />;
  }

  const sales = salesExVat(selected.platform, selected.summary);
  const previous = previousPeriod(selected, periods);
  const previousPct = previous ? platformCostPct(periodPlatformCharges(previous), salesExVat(previous.platform, previous.summary)) : null;
  const deltaPoints = cost.costPct !== null && previousPct !== null ? (cost.costPct - previousPct) * 100 : null;

  const byCategory = new Map<MarketplaceChargeLine["category"], MarketplaceChargeLine[]>();
  for (const line of cost.lines) byCategory.set(line.category, [...(byCategory.get(line.category) ?? []), line]);
  const categories = [...byCategory.entries()]
    .map(([category, lines]) => ({ category, lines, amount: lines.reduce((sum, line) => sum + line.amount, 0) }))
    .sort((left, right) => Math.abs(right.amount) - Math.abs(left.amount));
  const maxCategory = Math.max(...categories.map((item) => Math.abs(item.amount)), 1);
  const ofSales = (amount: number) => (sales ? percent(amount / sales, 1) : null);

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "الرئيسية", to: "/dashboard" }, { label: "التدقيق" }, { label: PRODUCTS.kashif.name }]}
        title={<ProductName product="kashif" />}
        subtitle={selected.label + " · أين يذهب كل ريال تخصمه المنصة"}
      />

      <section className="rounded-2xl border border-border bg-card p-5 sm:p-6">
        <div className="grid grid-cols-2 gap-x-5 gap-y-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)] sm:items-end">
          <div className="col-span-2 sm:col-span-1">
            <p className="text-[12.5px] text-muted-foreground">تكلفة المنصة بدون الضريبة</p>
            <p className="num mt-1 text-[2rem] font-bold leading-tight text-primary-text">{sar(cost.total)}</p>
            {deltaPoints !== null && previous ? (
              <p className={cn("mt-1 text-[12.5px] font-medium", Math.abs(deltaPoints) < 0.05 ? "text-muted-foreground" : deltaPoints > 0 ? "text-destructive" : "text-success")}>
                {Math.abs(deltaPoints) < 0.05 ? "مثل" : deltaPoints > 0 ? "أعلى بـ" : "أقل بـ"}{" "}
                {Math.abs(deltaPoints) < 0.05 ? null : <span className="num">{Math.abs(deltaPoints).toFixed(1)} نقطة</span>} عن {previous.label}
              </p>
            ) : null}
          </div>
          <div className="border-t border-border/70 pt-4 sm:border-s sm:border-t-0 sm:ps-5 sm:pt-0">
            <p className="text-[12.5px] text-muted-foreground">من المبيعات</p>
            <p className="num mt-1 text-xl font-bold">{cost.costPct === null ? "—" : percent(cost.costPct, 1)}</p>
          </div>
          <div className="border-t border-border/70 pt-4 sm:border-s sm:border-t-0 sm:ps-5 sm:pt-0">
            <p className="text-[12.5px] text-muted-foreground">لكل طلب</p>
            <p className="num mt-1 text-xl font-bold">{cost.costPerOrder === null ? "—" : sar(cost.costPerOrder)}</p>
          </div>
        </div>
        {cost.unmapped.count > 0 ? (
          <Link
            to="/exceptions"
            className="mt-5 flex items-center gap-2 rounded-xl bg-warning/10 px-3.5 py-2.5 text-[12.5px] font-medium text-warning hover:bg-warning/15"
          >
            <AlertTriangle className="size-4 shrink-0" />
            <span>
              {cost.unmapped.count === 1 ? "بند واحد غير مصنف" : `${cost.unmapped.count} بنود غير مصنفة`} ·{" "}
              <span className="num">{money(cost.unmapped.amount)}</span> ر.س · راجعه في «{PRODUCTS.radar.name}»
            </span>
            <ChevronLeft className="ms-auto size-4 shrink-0" />
          </Link>
        ) : null}
        {Math.abs(cost.residual) > 0.05 ? (
          <p className="mt-3 text-[12px] text-muted-foreground">
            مجموع البنود يختلف عن تكلفة المنصة بـ <span className="num">{money(cost.residual)}</span> ر.س.
          </p>
        ) : null}
      </section>

      <ChartCard title="الرسوم حسب النوع" bodyClassName="p-0">
        <ul className="divide-y divide-border/60">
          {categories.map((item) => {
            const label = MARKETPLACE_CHARGE_CATEGORY_LABELS[item.category];
            const size = Math.abs(item.amount) / maxCategory;
            return (
              <li key={item.category}>
                <button
                  type="button"
                  onClick={() => setFocus({ title: label, lines: item.lines })}
                  className="group block w-full px-5 py-3 text-start transition-colors hover:bg-muted/50"
                >
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="flex min-w-0 items-center gap-1.5 text-[13.5px] font-semibold">
                      {label}
                      {item.category === "unmapped" ? (
                        <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10.5px] font-medium text-warning">غير مصنف</span>
                      ) : null}
                    </span>
                    <span className="flex shrink-0 items-baseline gap-3">
                      {ofSales(item.amount) ? (
                        <span className="hidden text-[11.5px] text-muted-foreground sm:inline">
                          <span className="num">{ofSales(item.amount)}</span> من المبيعات
                        </span>
                      ) : null}
                      <span className="num text-[14px] font-bold">{money(item.amount)}</span>
                      <ChevronLeft className="size-4 self-center text-muted-foreground transition-transform group-hover:-translate-x-0.5" />
                    </span>
                  </span>
                  <span className="mt-2 flex items-center gap-3">
                    <span className="block h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.max(size * 100, size > 0 ? 1.5 : 0)}%`,
                          background: item.category === "unmapped" ? "var(--color-warning)" : "var(--color-primary)",
                        }}
                      />
                    </span>
                    <span className="num w-12 shrink-0 text-end text-[11.5px] text-muted-foreground">
                      {cost.total ? percent(item.amount / cost.total, 1) : ""}
                    </span>
                  </span>
                  {ofSales(item.amount) ? (
                    <span className="mt-1 block text-[11px] text-muted-foreground sm:hidden">
                      <span className="num">{ofSales(item.amount)}</span> من المبيعات
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
        <p className="border-t border-border/70 px-5 py-2.5 text-[11.5px] text-muted-foreground">
          اضغط أي نوع لترى من أين نأخذ أرقامه وتوزيعه على الفروع. النسبة يساراً من إجمالي تكلفة المنصة.
        </p>
      </ChartCard>

      <ChartCard title="كل البنود" bodyClassName="p-0">
        <ChargeList lines={cost.lines} sales={sales} onOpen={(line) => setFocus({ title: line.label, lines: [line] })} />
      </ChartCard>

      {cost.merchantFunded.length ? (
        <ChartCard title={MERCHANT_FUNDED_DISCOUNTS_LABEL_AR} bodyClassName="p-0">
          <p className="border-b border-border/70 px-5 py-2.5 text-[11.5px] leading-5 text-muted-foreground">
            خصومات موّلتها أنت لعملائك، وليست رسوماً تأخذها المنصة؛ لذلك لا تدخل في تكلفة المنصة.
          </p>
          <ChargeList lines={cost.merchantFunded} sales={sales} onOpen={(line) => setFocus({ title: line.label, lines: [line] })} />
        </ChartCard>
      ) : null}

      {cost.other.length ? (
        <details className="group rounded-2xl border border-border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-3.5 text-[13.5px] font-semibold">
            بنود أخرى لا تدخل في تكلفة المنصة
            <ChevronLeft className="size-4 text-muted-foreground transition-transform group-open:-rotate-90" />
          </summary>
          <div className="border-t border-border/70">
            <ChargeList lines={cost.other} sales={null} onOpen={(line) => setFocus({ title: line.label, lines: [line] })} />
          </div>
        </details>
      ) : null}

      <SourceSheet focus={focus} period={selected} allLines={allLines} onClose={() => setFocus(null)} />
    </div>
  );
}

function SourceSheet({
  focus,
  period,
  allLines,
  onClose,
}: {
  focus: SourceFocus | null;
  period: StoredPeriod;
  allLines: MarketplaceChargeLine[];
  onClose: () => void;
}) {
  const total = focus?.lines.reduce((sum, line) => sum + line.amount, 0) ?? 0;
  return (
    <Sheet open={Boolean(focus)} onOpenChange={(open) => !open && onClose()}>
      <SheetContent side="left" dir="rtl" className="w-full overflow-y-auto sm:max-w-xl">
        {focus ? (
          <>
            <SheetHeader className="ps-9 text-start sm:text-start">
              <SheetTitle className="font-display text-lg">{focus.title}</SheetTitle>
              <SheetDescription>
                من أين نأخذ {focus.lines.length > 1 ? "هذه البنود" : "هذا البند"} · {period.label} ·{" "}
                <span className="num font-semibold text-foreground">{sar(total)}</span>
              </SheetDescription>
            </SheetHeader>
            <div className="mt-5 space-y-4">
              {focus.lines.length > 1 ? <CategoryBranches lines={focus.lines} period={period} allLines={allLines} /> : null}
              {focus.lines.map((line) => (
                <SourceCard key={line.id} line={line} period={period} allLines={allLines} showTitle={focus.lines.length > 1} />
              ))}
            </div>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}

function SourceCard({
  line,
  period,
  allLines,
  showTitle,
}: {
  line: MarketplaceChargeLine;
  period: StoredPeriod;
  allLines: MarketplaceChargeLine[];
  showTitle: boolean;
}) {
  const source = chargeLineSource(line, period);
  const cpc = useCpcBranches(period, line);
  const split = cpc ?? branchBreakdown(line, period, allLines);
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      {showTitle ? (
        <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-surface-raised/50 px-4 py-2.5">
          <span className="font-semibold">{line.label}</span>
          <span className="num font-semibold">{sar(line.amount)}</span>
        </div>
      ) : (
        <div className="flex items-center justify-between gap-3 bg-ink px-4 py-3 text-ink-foreground">
          <span className="text-[12px] text-ink-muted">
            {MARKETPLACE_CHARGE_CATEGORY_LABELS[line.category]} · {line.mapped ? "مصنف" : "غير مصنف"}
          </span>
          <span className="num text-xl font-semibold text-primary">{sar(line.amount)}</span>
        </div>
      )}
      <dl className="space-y-3 p-4 text-[13px]">
        <div className="flex items-start gap-2.5">
          <FileSpreadsheet className="mt-0.5 size-4 shrink-0 text-primary-text" />
          <div className="min-w-0">
            <dt className="text-[11.5px] text-muted-foreground">الملف</dt>
            <dd className="font-medium">{source.file}</dd>
            {source.sheet ? (
              <dd className="mt-0.5 text-[12px] text-muted-foreground">
                الورقة: <span className="num font-medium text-foreground" dir="ltr">{source.sheet}</span>
              </dd>
            ) : null}
          </div>
        </div>
        {source.columns.length ? (
          <div className="flex items-start gap-2.5">
            <Columns3 className="mt-0.5 size-4 shrink-0 text-primary-text" />
            <div className="min-w-0">
              <dt className="text-[11.5px] text-muted-foreground">{source.columns.length > 1 ? "الأعمدة" : "العمود"}</dt>
              <dd className="mt-1 flex flex-wrap gap-1.5">
                {source.columns.map((column) => (
                  <code key={column} dir="ltr" className="rounded-md border border-border bg-surface-raised px-2 py-0.5 font-mono text-[11.5px]">
                    {column}
                  </code>
                ))}
              </dd>
            </div>
          </div>
        ) : null}
        {source.formula ? (
          <div className="flex items-start gap-2.5">
            <Sigma className="mt-0.5 size-4 shrink-0 text-primary-text" />
            <div className="min-w-0">
              <dt className="text-[11.5px] text-muted-foreground">طريقة الاحتساب</dt>
              <dd className="leading-6">{source.formula}</dd>
            </div>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-1.5 pt-1 text-[11px]">
          <span className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">{EVIDENCE_LABELS[line.evidence]}</span>
          <span className="rounded-full bg-secondary px-2 py-0.5 text-secondary-foreground">يموّله: {FUNDING_LABELS[line.fundingSource]}</span>
        </div>
        {line.note ? <p className="rounded-xl bg-surface-raised px-3 py-2 text-[12px] leading-6 text-muted-foreground">{line.note}</p> : null}
      </dl>
      <div className="border-t border-border/70 px-4 py-3">
        <p className="text-[11.5px] font-semibold text-muted-foreground">حسب الفرع</p>
        {split.caption ? <p className="mt-1 text-[11.5px] leading-5 text-muted-foreground">{split.caption}</p> : null}
        {split.rows.length ? (
          <BranchTable split={split} />
        ) : (
          <p className="mt-1.5 rounded-xl bg-surface-raised px-3 py-2 text-[12px] leading-6 text-muted-foreground">
            {split.unavailable}
            {line.id === "hs-cpc" && !(cpc && "loading" in cpc && cpc.loading) ? (
              <>
                {" "}
                <Link to="/promotions" className="font-semibold text-primary-text underline underline-offset-4">
                  فتح «{PRODUCTS.aaid.name}»
                </Link>
              </>
            ) : null}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * CPC split per branch for HungerStation's ad invoice, from the ads report saved in «عائد» for the same dates,
 * when the CPC invoice itself has no per-branch lines. Returns null otherwise so the regular split applies.
 */
function useCpcBranches(period: StoredPeriod, line: MarketplaceChargeLine): (BranchBreakdown & { loading?: boolean }) | null {
  const isCpc = line.id === "hs-cpc" && !period.invoice?.cpcBranches?.length;
  const analyses = useQuery({
    queryKey: ["ads-roi-analyses"],
    queryFn: () => listAdsRoiAnalyses({ data: {} }),
    enabled: isCpc,
    retry: false,
  });
  const match = analyses.data ? pickAdsAnalysisForPeriod(analyses.data, period) : null;
  const record = useQuery({
    queryKey: ["ads-roi-analysis", match?.id],
    queryFn: () => getAdsRoiAnalysis({ data: { id: match!.id } }),
    enabled: isCpc && Boolean(match),
    retry: false,
  });
  if (!isCpc) return null;
  if (analyses.isLoading || record.isLoading) {
    return { rows: [], total: 0, loading: true, unavailable: "جارٍ البحث عن تقرير الإعلانات لهذه الفترة…" };
  }
  if (record.data) return cpcBranchesFromAds(record.data.report, period, line.amount);
  return {
    rows: [],
    total: 0,
    unavailable:
      "فاتورة CPC تذكر المبلغ على مستوى الحساب فقط. لتوزيعه على الفروع ارفع تقرير الإعلانات من بوابة هنقرستيشن لنفس الفترة في «" +
      PRODUCTS.aaid.name +
      "»، وسيظهر الصرف لكل فرع هنا.",
  };
}

function BranchTable({ split }: { split: BranchBreakdown }) {
  return (
    <table className="mt-2 w-full text-[12.5px]">
      <tbody>
        {split.rows.map((row) => (
          <tr key={row.name} className="border-b border-border/50 last:border-0">
            <td className="py-1.5 pe-3">{row.name}</td>
            <td className={"py-1.5 text-end " + (Math.abs(row.value) < 0.005 ? "text-muted-foreground" : "font-medium")}>
              <span className="num">{money(row.value)}</span>
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-border">
          <td className="pt-2 font-semibold">الإجمالي · {split.rows.length} فرع</td>
          <td className="pt-2 text-end font-semibold">
            <span className="num">{money(split.total)}</span>
          </td>
        </tr>
      </tfoot>
    </table>
  );
}

/** Per-branch total for a whole category, shown above its lines when every line can be split by branch. */
function CategoryBranches({
  lines,
  period,
  allLines,
}: {
  lines: MarketplaceChargeLine[];
  period: StoredPeriod;
  allLines: MarketplaceChargeLine[];
}) {
  const split = combinedBranchBreakdown(lines, period, allLines);
  if (!split) return null;
  return (
    <section className="rounded-2xl border border-primary/30 bg-secondary/40 px-4 py-3">
      <p className="text-[12.5px] font-semibold">مجموع التصنيف حسب الفرع</p>
      <BranchTable split={split} />
    </section>
  );
}

/** One row per charge: what it is, how much, its share of sales, and where the number comes from. Stacks on phones. */
function ChargeList({
  lines,
  sales,
  onOpen,
}: {
  lines: MarketplaceChargeLine[];
  sales: number | null;
  onOpen: (line: MarketplaceChargeLine) => void;
}) {
  return (
    <ul className="divide-y divide-border/60">
      {lines.map((line) => (
        <li key={line.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-3">
          <div className="min-w-0 basis-full sm:basis-auto sm:flex-1">
            <p className="flex flex-wrap items-center gap-1.5 text-[13.5px] font-medium">
              {cleanLabel(line.label)}
              {!line.mapped ? (
                <span className="rounded-full bg-warning/10 px-2 py-0.5 text-[10.5px] font-medium text-warning">غير مصنف</span>
              ) : null}
            </p>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">{MARKETPLACE_CHARGE_CATEGORY_LABELS[line.category]}</p>
          </div>
          <div className="flex flex-1 flex-col items-start sm:flex-none sm:items-end">
            <span className="num text-[13.5px] font-semibold">{money(line.amount)}</span>
            {sales ? <span className="text-[11px] text-muted-foreground"><span className="num">{percent(line.amount / sales, 1)}</span> من المبيعات</span> : null}
          </div>
          <button
            type="button"
            onClick={() => onOpen(line)}
            className="shrink-0 rounded-full border border-border px-3 py-1 text-[12px] font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
          >
            من أين؟
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Fee-map labels written for the audit trail, in the words a restaurant owner uses. */
function cleanLabel(label: string): string {
  return label === "بنود فاتورة فقط غير مفصلة في snapshot" ? "بنود في الفاتورة فقط" : label;
}
