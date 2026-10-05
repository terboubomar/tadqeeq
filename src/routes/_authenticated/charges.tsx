import { PageHeader } from "@/components/workspace/PageKit";
import { createFileRoute } from "@tanstack/react-router";
import { PRODUCTS, productPageTitle } from "@/lib/products";
import { ProductName } from "@/components/ProductName";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  CircleDollarSign,
  Columns3,
  FileSpreadsheet,
  Layers3,
  Sigma,
} from "lucide-react";
import { useMemo, useState } from "react";

import { EmptyState } from "@/components/AppShell";
import { Callout, ChartCard, SegmentBar, StatTiles } from "@/components/dash/DashKit";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { branchBreakdown, chargeLineSource, combinedBranchBreakdown, type BranchBreakdown } from "@/lib/charges-sources";
import type { StoredPeriod } from "@/lib/periods";
import {
  MARKETPLACE_CHARGE_CATEGORY_LABELS,
  buildMarketplaceChargeMap,
  type MarketplaceChargeLine,
} from "@/lib/charges-mapper";
import { money, percent, sar } from "@/lib/format";
import { useSelectedPeriod } from "@/lib/use-period";

export const Route = createFileRoute("/_authenticated/charges")({
  head: () => ({
    meta: [
      { title: productPageTitle("kashif") },
      {
        name: "description",
        content:
          "تصنيف رسوم وخصومات منصات التوصيل مع كشف أي مبالغ غير مصنفة بدون تخمين.",
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
  const { selected, isLoading } = useSelectedPeriod();
  const [focus, setFocus] = useState<SourceFocus | null>(null);

  const map = useMemo(
    () => (selected ? buildMarketplaceChargeMap(selected) : null),
    [selected],
  );

  if (isLoading) {
    return (
      <p className="py-20 text-center text-sm text-muted-foreground">
        جارٍ التحميل…
      </p>
    );
  }

  if (!selected || !map) {
    return (
      <EmptyState
        title="لا توجد فترة تدقيق"
        body="ارفع بيانات منصة أولاً حتى يبني «كاشِف» خريطة الرسوم."
      />
    );
  }

  const auditLines = map.lines.filter((line) => line.scope === "audit_total");
  const outsideLines = map.lines.filter(
    (line) => line.scope === "outside_audit_total",
  );

  const byCategory = new Map<string, number>();
  for (const line of auditLines) byCategory.set(line.category, (byCategory.get(line.category) ?? 0) + line.amount);
  const categories = [...byCategory.entries()].sort((x, y) => y[1] - x[1]);
  const maxCategory = Math.max(...categories.map(([, amount]) => Math.abs(amount)), 1);
  const closed = Math.abs(map.reconciliationVariance) <= 0.05;

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "الرئيسية", to: "/dashboard" }, { label: "التدقيق" }, { label: PRODUCTS.kashif.name }]}
        title={<ProductName product="kashif" />}
        subtitle={selected.label + " · تصنيف حتمي للبنود الموجودة في نتيجة التدقيق بدون تغيير معادلات المحرك."}
      />

      <StatTiles
        cols={4}
        items={[
          { label: "إجمالي رسوم التدقيق", value: sar(map.auditTotalCharges), icon: CircleDollarSign, tone: "gold" },
          { label: "مصنف بثقة", value: sar(map.mappedAuditAmount), hint: String(map.mappedLineCount) + " بند مصنف", icon: CheckCircle2, tone: "positive" },
          {
            label: "غير مصنف",
            value: sar(map.unmappedAuditAmount),
            hint: String(map.unmappedLineCount) + " بند يحتاج تصنيف",
            icon: AlertTriangle,
            tone: map.unmappedAuditAmount > 0.05 ? "negative" : "positive",
          },
          { label: "تغطية التصنيف", value: percent(map.coveragePct), hint: closed ? "الخريطة مقفلة على إجمالي الرسوم" : "يوجد فرق في الإقفال", icon: Layers3 },
        ]}
      />

      {map.unmappedAuditAmount > 0.05 ? (
        <Callout tone="danger" icon={AlertTriangle} title="يوجد مبلغ غير مصنف يحتاج مراجعة">
          لم يضع Tadqeeq هذا المبلغ تلقائياً تحت “أخرى”. سيظهر أيضاً في «رادار» كبند رقابي، لكن لن يُعامل كاسترداد محتمل حتى
          توجد قاعدة أو مستند يثبت التصنيف والحق المالي.
        </Callout>
      ) : (
        <Callout tone="success" icon={CheckCircle2} title="كل رسوم أساس التدقيق مصنفة">
          مجموع البنود المصنفة يطابق إجمالي الرسوم ضمن هامش الإقفال.
        </Callout>
      )}

      <div className="grid gap-5 xl:grid-cols-12">
        <ChartCard
          className="xl:col-span-7"
          title="الرسوم حسب التصنيف"
          totals={[
            { label: "إجمالي رسوم التدقيق", value: sar(map.auditTotalCharges) },
            ...(map.outsideAuditAmount ? [{ label: "بنود خارج الإجمالي", value: sar(map.outsideAuditAmount) }] : []),
          ]}
        >
          <p className="-mt-1 mb-3 text-[11.5px] text-muted-foreground">اضغط على أي تصنيف لترى من أين نأخذ أرقامه.</p>
          <ul className="space-y-1.5">
            {categories.map(([category, amount]) => {
              const label = MARKETPLACE_CHARGE_CATEGORY_LABELS[category as MarketplaceChargeLine["category"]];
              const size = Math.abs(amount) / maxCategory;
              return (
                <li key={category}>
                  <button
                    type="button"
                    onClick={() => setFocus({ title: label, lines: auditLines.filter((line) => line.category === category) })}
                    className="group -mx-2 block w-[calc(100%+1rem)] rounded-lg px-2 py-2 text-start transition-colors hover:bg-muted/60"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="flex min-w-0 items-center gap-1 truncate text-[13px] font-medium">
                        {label}
                        <ChevronLeft className="size-3.5 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
                      </span>
                      <span className="flex shrink-0 items-baseline gap-2">
                        {map.auditTotalCharges ? (
                          <span className="num text-[11.5px] text-muted-foreground">{percent(amount / map.auditTotalCharges, 1)}</span>
                        ) : null}
                        <span className="num text-[13px] font-semibold">{money(amount)}</span>
                      </span>
                    </span>
                    <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-muted">
                      <span
                        className="block h-full rounded-full"
                        style={{
                          width: `${Math.max(size * 100, size > 0 ? 1.5 : 0)}%`,
                          background: category === "unmapped" ? "var(--color-destructive)" : "var(--color-primary)",
                        }}
                      />
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </ChartCard>
        <ChartCard className="xl:col-span-5" title="تغطية التصنيف" totals={[{ label: "من إجمالي الرسوم مصنف", value: percent(map.coveragePct), tone: closed ? "positive" : "negative" }]}>
          <SegmentBar
            segments={[
              { key: "mapped", label: "مصنف", value: map.mappedAuditAmount, display: money(map.mappedAuditAmount), color: "var(--color-success)" },
              { key: "unmapped", label: "غير مصنف", value: map.unmappedAuditAmount, display: money(map.unmappedAuditAmount), color: "var(--color-destructive)" },
            ]}
          />
          <dl className="mt-5 space-y-2 text-[12.5px]">
            <div className="flex justify-between gap-3 border-b border-border/60 pb-2">
              <dt className="text-muted-foreground">بنود مصنفة</dt>
              <dd className="num font-semibold">{map.mappedLineCount}</dd>
            </div>
            <div className="flex justify-between gap-3 border-b border-border/60 pb-2">
              <dt className="text-muted-foreground">بنود غير مصنفة</dt>
              <dd className="num font-semibold">{map.unmappedLineCount}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">فرق الإقفال</dt>
              <dd className={"num font-semibold " + (closed ? "text-success" : "text-destructive")}>{money(map.reconciliationVariance)}</dd>
            </div>
          </dl>
        </ChartCard>
      </div>

      <ChargeTable
        title="البنود الداخلة في إجمالي رسوم التدقيق"
        subtitle="هذه البنود فقط هي التي تُستخدم لإقفال summary.totalCharges."
        lines={auditLines}
        onOpen={(line) => setFocus({ title: line.label, lines: [line] })}
      />

      {outsideLines.length ? (
        <ChargeTable
          title="بنود مالية إضافية خارج إجمالي الرسوم"
          subtitle="تظهر للشفافية والتحليل القادم مثل True ROI، لكنها لا تغيّر إجمالي الرسوم الحالي ولا معادلات المنصة."
          lines={outsideLines}
          onOpen={(line) => setFocus({ title: line.label, lines: [line] })}
        />
      ) : null}

      <SourceSheet focus={focus} period={selected} allLines={map.lines} onClose={() => setFocus(null)} />
    </div>
  );
}

/** Side panel: for each line, the file, sheet and columns it is read from, how it is computed, and its branches. */
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
  const split = branchBreakdown(line, period, allLines);
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
          <p className="mt-1.5 rounded-xl bg-surface-raised px-3 py-2 text-[12px] leading-6 text-muted-foreground">{split.unavailable}</p>
        )}
      </div>
    </section>
  );
}

function BranchTable({ split }: { split: BranchBreakdown }) {
  return (
    <table className="mt-2 w-full text-[12.5px]">
      <tbody>
        {split.rows.map((row) => (
          <tr key={row.name} className="border-b border-border/50 last:border-0">
            <td className="py-1.5 pe-3">{row.name}</td>
            <td className={"num py-1.5 text-end " + (Math.abs(row.value) < 0.005 ? "text-muted-foreground" : "font-medium")}>
              {money(row.value)}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr className="border-t border-border">
          <td className="pt-2 font-semibold">الإجمالي · {split.rows.length} فرع</td>
          <td className="num pt-2 text-end font-semibold">{money(split.total)}</td>
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

function ChargeTable({
  title,
  subtitle,
  lines,
  onOpen,
}: {
  title: string;
  subtitle: string;
  lines: MarketplaceChargeLine[];
  onOpen: (line: MarketplaceChargeLine) => void;
}) {
  return (
    <ChartCard title={title} bodyClassName="p-0">
      <p className="border-b border-border/70 px-5 py-2 text-[11.5px] leading-5 text-muted-foreground">{subtitle}</p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[820px] text-sm">
          <thead className="bg-muted/40 text-[11px] text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-start font-semibold">البند</th>
              <th className="px-4 py-2.5 text-start font-semibold">التصنيف</th>
              <th className="px-4 py-2.5 text-start font-semibold">المصدر (اضغط البند للتفاصيل)</th>
              <th className="px-4 py-2.5 text-start font-semibold">التمويل</th>
              <th className="px-4 py-2.5 text-start font-semibold">الحالة</th>
              <th className="px-4 py-2.5 text-end font-semibold">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-t border-border/70 align-top">
                <td className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => onOpen(line)}
                    className="font-medium text-start text-foreground underline decoration-border decoration-dashed underline-offset-4 hover:text-primary-text hover:decoration-primary"
                  >
                    {line.label}
                  </button>
                  {line.note ? (
                    <p className="mt-1 max-w-xl text-[11px] leading-5 text-muted-foreground">
                      {line.note}
                    </p>
                  ) : null}
                </td>
                <td className="px-4 py-3 text-xs">
                  {MARKETPLACE_CHARGE_CATEGORY_LABELS[line.category]}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  <p>{line.source}</p>
                  <p className="mt-1">{EVIDENCE_LABELS[line.evidence]}</p>
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {FUNDING_LABELS[line.fundingSource]}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={
                      "whitespace-nowrap rounded-full px-2 py-1 text-[11px] font-semibold " +
                      (line.mapped ? "bg-success/10 text-success" : "bg-destructive-soft text-destructive")
                    }
                  >
                    {line.mapped ? "مصنف" : "غير مصنف"}
                  </span>
                </td>
                <td className="px-4 py-3 text-end font-semibold">
                  <span className="num whitespace-nowrap">{sar(line.amount)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}
