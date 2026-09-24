import { createFileRoute } from "@tanstack/react-router";
import {
  AlertTriangle,
  CheckCircle2,
  CircleDollarSign,
  Layers3,
} from "lucide-react";
import { useMemo } from "react";

import { EmptyState } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { Badge } from "@/components/ui/badge";
import {
  MARKETPLACE_CHARGE_CATEGORY_LABELS,
  buildMarketplaceChargeMap,
  type MarketplaceChargeLine,
} from "@/lib/charges-mapper";
import { percent, sar } from "@/lib/format";
import { useSelectedPeriod } from "@/lib/use-period";

export const Route = createFileRoute("/_authenticated/charges")({
  head: () => ({
    meta: [
      { title: "خريطة رسوم المنصات · تدقيق" },
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
        body="ارفع بيانات منصة أولاً حتى يتم بناء خريطة الرسوم."
      />
    );
  }

  const auditLines = map.lines.filter((line) => line.scope === "audit_total");
  const outsideLines = map.lines.filter(
    (line) => line.scope === "outside_audit_total",
  );

  return (
    <div className="space-y-6">
      <header>
        <h1 className="audit-heading">خريطة رسوم المنصات</h1>
        <p className="audit-subtitle">
          {selected.label} · تصنيف حتمي للبنود الموجودة في نتيجة التدقيق
          بدون تغيير معادلات المحرك.
        </p>
      </header>

      <section className="audit-kpi-strip grid gap-0 sm:grid-cols-2 xl:grid-cols-4 [&>*]:rounded-none [&>*]:border-0 [&>*]:border-s [&>*]:border-border/70 [&>*:first-child]:border-s-0">
        <StatCard
          label="إجمالي رسوم التدقيق"
          value={sar(map.auditTotalCharges)}
          icon={CircleDollarSign}
          tone="gold"
        />
        <StatCard
          label="مصنف بثقة"
          value={sar(map.mappedAuditAmount)}
          hint={String(map.mappedLineCount) + " بند مصنف"}
          icon={CheckCircle2}
          tone="positive"
        />
        <StatCard
          label="غير مصنف"
          value={sar(map.unmappedAuditAmount)}
          hint={String(map.unmappedLineCount) + " بند يحتاج تصنيف"}
          icon={AlertTriangle}
          tone={map.unmappedAuditAmount > 0.05 ? "negative" : "positive"}
        />
        <StatCard
          label="تغطية التصنيف"
          value={percent(map.coveragePct)}
          hint={
            Math.abs(map.reconciliationVariance) <= 0.05
              ? "الخريطة مقفلة على إجمالي الرسوم"
              : "يوجد فرق في الإقفال"
          }
          icon={Layers3}
        />
      </section>

      {map.unmappedAuditAmount > 0.05 ? (
        <section className="rounded-xl border border-destructive/25 bg-destructive/5 p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-destructive" />
            <div>
              <h2 className="text-sm font-bold text-destructive">
                يوجد مبلغ غير مصنف يحتاج مراجعة
              </h2>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">
                لم يضع Tadqeeq هذا المبلغ تلقائياً تحت “أخرى”. سيظهر أيضاً
                في مركز الاستثناءات كبند رقابي، لكن لن يُعامل كاسترداد محتمل
                حتى توجد قاعدة أو مستند يثبت التصنيف والحق المالي.
              </p>
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-xl border border-success/25 bg-success/5 p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success" />
            <div>
              <h2 className="text-sm font-bold">كل رسوم أساس التدقيق مصنفة</h2>
              <p className="mt-1 text-xs leading-6 text-muted-foreground">
                مجموع البنود المصنفة يطابق summary.totalCharges ضمن هامش
                الإقفال.
              </p>
            </div>
          </div>
        </section>
      )}

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
    <section className="overflow-hidden rounded-xl border border-border bg-white">
      <div className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-bold">{title}</h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {subtitle}
        </p>
      </div>

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
                  <Badge variant={line.mapped ? "secondary" : "destructive"}>
                    {line.mapped ? "مصنف" : "غير مصنف"}
                  </Badge>
                </td>
                <td className="num px-4 py-3 text-end font-semibold">
                  {sar(line.amount)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
