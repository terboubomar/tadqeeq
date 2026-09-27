import { createFileRoute } from "@tanstack/react-router";
import { Download, Layers3, ListOrdered, Percent, Receipt } from "lucide-react";

import { EmptyState } from "@/components/AppShell";
import { BarList, ChartCard, StatTiles } from "@/components/dash/DashKit";
import { Button } from "@/components/ui/button";
import { exportXlsx, type ExportColumn } from "@/lib/export";
import { count, money, percent, sar } from "@/lib/format";
import { useSelectedPeriod } from "@/lib/use-period";

export const Route = createFileRoute("/_authenticated/breakdown")({
  head: () => ({
    meta: [
      { title: "تفصيل البنود · تدقيق" },
      { name: "description", content: "توزيع خصومات المنصة على بنودها وحالات الطلبات." },
      { property: "og:title", content: "تفصيل البنود · تدقيق" },
      { property: "og:description", content: "توزيع خصومات المنصة على بنودها وحالات الطلبات." },
    ],
  }),
  component: BreakdownPage,
});

const COLORS = [
  "var(--color-chart-1)",
  "var(--color-chart-2)",
  "var(--color-chart-3)",
  "var(--color-chart-4)",
  "var(--color-chart-5)",
];

interface Line {
  label: string;
  amount: number;
}

function BreakdownPage() {
  const { selected, isLoading } = useSelectedPeriod();

  if (isLoading) {
    return <p className="py-20 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>;
  }
  if (!selected) {
    return <EmptyState title="لا توجد فترات محفوظة" body="ارفع ملفات الفترة لعرض تفصيل البنود." />;
  }

  const s = selected.summary;
  const isHunger = selected.platform === "hungerstation";
  const isJahez = selected.platform === "jahez";
  const charges: Line[] = (
    isHunger
      ? [
          { label: "عمولة المبيعات", amount: s.commission },
          {
            label: "رسوم الدفع (بطاقات + محفظة الفاتورة)",
            amount: s.bankFeeSuccess + s.bankFeeRefunded + (s.walletFee ?? 0),
          },
          { label: "حملات التوصيل المجاني", amount: s.rdfCampaigns },
          { label: "تعويضات العملاء", amount: s.compensation },
          { label: "رسوم العروض السريعة", amount: s.jokerFees },
          { label: "رسوم وقت الانتظار", amount: s.waitingTimeFees },
        ]
      : isJahez
        ? [
            { label: "عمولة جاهز", amount: s.jahezCommissionInvoiceExVat ?? 0 },
            { label: "رسوم المدفوعات", amount: s.jahezPaymentFeesExVat ?? 0 },
            { label: "عروض التوصيل للفوترة", amount: s.jahezDeliveryOfferInvoiceExVat ?? 0 },
          ]
        : [
          { label: "عمولة الطلبات", amount: s.keetaCommissionExVat ?? 0 },
          { label: "رسوم البنك", amount: s.keetaBankFeesExVat ?? 0 },
          { label: "التوصيل / الحملات", amount: s.keetaDeliveryCampaignExVat ?? 0 },
          { label: "الإعلانات", amount: s.keetaAdvertisingExVat ?? 0 },
          { label: "تعويضات / خصومات المنصة", amount: s.keetaCompensationExVat ?? 0 },
          { label: "مصروفات أخرى", amount: s.keetaOtherExpensesExVat ?? 0 },
        ]
  ).filter((line) => Math.abs(line.amount) > 0.005);

  const discounts: Line[] = (
    isHunger
      ? [
          { label: "خصم المنصة على الأصناف", amount: s.hsFoodDiscount },
          { label: "خصومات المكافآت", amount: s.rewardsDiscount },
          { label: "خصم المطعم على الأصناف", amount: s.restaurantFoodDiscount },
          { label: "تعديلات التنفيذ", amount: s.fulfillmentMods },
          { label: "مرتجعات معتمدة", amount: s.approvedRefunds },
          { label: "مرتجعات جزئية", amount: s.partialRefund },
        ]
      : isJahez
        ? [
            { label: "Restaurant Amount", amount: s.jahezReportedRestaurantAmount ?? 0 },
            { label: "تعويضات مخصومة", amount: s.jahezCompensationDebit ?? 0 },
            { label: "تعويضات مضافة", amount: s.jahezCompensationCredit ?? 0 },
            { label: "صافي أثر التعويضات", amount: s.jahezCompensationNetImpact ?? 0 },
            { label: "صافي المطعم بعد التعويضات", amount: s.jahezAdjustedRestaurantAmount ?? 0 },
            { label: "Payment Fees VAT", amount: s.jahezPaymentFeesVat ?? 0 },
            { label: "Delivery Offer المخصوم", amount: s.jahezDeliveryOfferInclVat ?? 0 },
            { label: "Offer Amount", amount: s.jahezOfferAmount ?? 0 },
            { label: "Delivery Coupon", amount: s.jahezDeliveryCoupon ?? 0 },
            { label: "Delivery Charge", amount: s.jahezDeliveryCharge ?? 0 },
          ]
        : [
          { label: "المبيعات بدون الضريبة", amount: s.keetaSalesExVat ?? 0 },
          { label: "ضريبة المبيعات", amount: s.keetaSalesVat ?? 0 },
          { label: "ضريبة مدخلات تكاليف المنصة", amount: s.keetaInputVat ?? 0 },
          { label: "صافي التسوية المحتسب", amount: s.netSales },
          { label: "Payable حسب كيتا", amount: s.keetaSourcePayable ?? 0 },
          { label: "فرق التسوية", amount: s.keetaSettlementVariance ?? 0 },
        ]
  ).filter((line) => Math.abs(line.amount) > 0.005);

  const total = charges.reduce((sum, line) => sum + line.amount, 0);
  const columns: ExportColumn<Line>[] = [
    { key: "label", header: "البند", type: "text" },
    { key: "amount", header: "المبلغ", type: "money" },
  ];

  const ranked = charges.map((line, index) => ({ ...line, color: COLORS[index % COLORS.length] })).sort((x, y) => y.amount - x.amount);
  const largest = ranked[0];
  const maxCharge = Math.max(...ranked.map((line) => Math.abs(line.amount)), 1);
  const statuses = Object.entries(s.statusCounts ?? {}).sort((x, y) => y[1] - x[1]);
  const statusTotal = statuses.reduce((sum, [, value]) => sum + value, 0);
  const maxStatus = Math.max(...statuses.map(([, value]) => value), 1);
  const maxDiscount = Math.max(...discounts.map((line) => Math.abs(line.amount)), 1);

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="audit-heading">تفصيل البنود</h1>
          <p className="audit-subtitle">{selected.label}</p>
        </div>
        <Button
          data-noprint
          variant="outline"
          size="sm"
          onClick={() =>
            exportXlsx(
              [
                { name: isHunger ? "الخصومات" : "تكاليف المنصة", rows: charges, columns },
                { name: isHunger ? "الخصومات التسويقية" : "مؤشرات التسوية", rows: discounts, columns },
              ],
              `breakdown-${selected.period_start ?? "period"}`,
            )
          }
        >
          <Download className="size-3.5" />
          تصدير Excel
        </Button>
      </header>

      <StatTiles
        cols={4}
        items={[
          { label: isHunger ? "إجمالي خصومات المنصة" : "إجمالي تكلفة المنصة (بدون الضريبة)", value: sar(total), icon: Receipt, tone: "negative" },
          { label: "من المبيعات الإجمالية", value: percent(s.grossSales ? total / s.grossSales : 0), icon: Percent },
          { label: "أكبر بند", value: largest ? sar(largest.amount) : "—", hint: largest?.label, icon: Layers3, tone: "gold" },
          { label: "عدد البنود", value: count(charges.length), hint: statusTotal ? `${count(statusTotal)} طلب في الفترة` : undefined, icon: ListOrdered },
        ]}
      />

      <ChartCard
        title={isHunger ? "تكوين خصومات المنصة" : isJahez ? "تكوين فاتورة جاهز بدون الضريبة" : "تكوين تكلفة كيتا بدون الضريبة"}
        action={<span className="text-[11.5px] text-muted-foreground">نسبة كل بند من إجمالي تكلفة المنصة</span>}
      >
        <div className="flex h-3 overflow-hidden rounded-full bg-muted">
          {charges.map((line, index) => (
            <span
              key={line.label}
              title={line.label}
              style={{ width: `${Math.max(total > 0 ? (line.amount / total) * 100 : 0, 0.5)}%`, background: COLORS[index % COLORS.length] }}
            />
          ))}
        </div>
        <div className="mt-6">
          <BarList
            items={ranked.map((line) => ({
              key: line.label,
              label: line.label,
              value: money(line.amount),
              share: percent(total > 0 ? line.amount / total : 0, 1),
              size: Math.abs(line.amount) / maxCharge,
              color: line.color,
            }))}
            empty="لا توجد تكاليف في هذه الفترة."
          />
        </div>
      </ChartCard>

      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title={isHunger ? "الخصومات التسويقية والمرتجعات" : isJahez ? "بنود تسوية جاهز" : "مؤشرات التسوية"}>
          <BarList
            items={discounts.map((line) => ({
              key: line.label,
              label: line.label,
              value: money(line.amount),
              size: Math.abs(line.amount) / maxDiscount,
              color: line.amount < 0 ? "var(--color-destructive)" : "var(--color-chart-2)",
            }))}
            empty="لا توجد قيم في هذه الفترة."
          />
        </ChartCard>

        <ChartCard title="حالات الطلبات" totals={statusTotal ? [{ label: "إجمالي الطلبات", value: count(statusTotal) }] : undefined}>
          <BarList
            items={statuses.map(([status, value]) => ({
              key: status,
              label: status,
              value: count(value),
              share: statusTotal ? percent(value / statusTotal, 1) : undefined,
              size: value / maxStatus,
              color: "var(--color-chart-3)",
            }))}
            empty="لا توجد حالات طلبات في هذه الفترة."
          />
        </ChartCard>
      </div>
    </div>
  );
}
