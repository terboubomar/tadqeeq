import { createFileRoute } from "@tanstack/react-router";
import { productPageTitle } from "@/lib/products";
import { ProductName } from "@/components/ProductName";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Layers3,
} from "lucide-react";
import { useMemo } from "react";

import { EmptyState } from "@/components/AppShell";
import { BarList, Callout, ChartCard, SegmentBar, StatTiles } from "@/components/dash/DashKit";
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

function MarketplaceChargesPage() {
  const { selected, isLoading } = useSelectedPeriod();

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
      <header>
        <h1 className="audit-heading"><ProductName product="kashif" /></h1>
        <p className="audit-subtitle">
          {selected.label} · تصنيف حتمي للبنود الموجودة في نتيجة التدقيق بدون تغيير معادلات المحرك.
        </p>
      </header>

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
          <BarList
            items={categories.map(([category, amount]) => ({
              key: category,
              label: MARKETPLACE_CHARGE_CATEGORY_LABELS[category as MarketplaceChargeLine["category"]],
              value: money(amount),
              share: map.auditTotalCharges ? percent(amount / map.auditTotalCharges, 1) : undefined,
              size: Math.abs(amount) / maxCategory,
              color: category === "unmapped" ? "var(--color-destructive)" : undefined,
            }))}
          />
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
      />

      {outsideLines.length ? (
        <ChargeTable
          title="بنود مالية إضافية خارج إجمالي الرسوم"
          subtitle="تظهر للشفافية والتحليل القادم مثل True ROI، لكنها لا تغيّر إجمالي الرسوم الحالي ولا معادلات المنصة."
          lines={outsideLines}
        />
      ) : null}
    </div>
  );
}

function ChargeTable({
  title,
  subtitle,
  lines,
}: {
  title: string;
  subtitle: string;
  lines: MarketplaceChargeLine[];
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
              <th className="px-4 py-2.5 text-start font-semibold">المصدر</th>
              <th className="px-4 py-2.5 text-start font-semibold">التمويل</th>
              <th className="px-4 py-2.5 text-start font-semibold">الحالة</th>
              <th className="px-4 py-2.5 text-end font-semibold">المبلغ</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.id} className="border-t border-border/70 align-top">
                <td className="px-4 py-3">
                  <p className="font-medium">{line.label}</p>
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
