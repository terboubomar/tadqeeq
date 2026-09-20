import { createFileRoute } from "@tanstack/react-router";

import { EmptyState } from "@/components/AppShell";
import { Button } from "@/components/ui/button";
import { exportXlsx, type ExportColumn } from "@/lib/export";
import { count, money, percent } from "@/lib/format";
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
          تصدير Excel
        </Button>
      </header>

      <section className="rounded-[10px] border border-border bg-white p-[18px]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold">
              {isHunger
                ? "تكوين خصومات المنصة"
                : isJahez
                  ? "تكوين فاتورة جاهز بدون الضريبة"
                  : "تكوين تكلفة كيتا بدون الضريبة"}
            </h2>
            <p className="mt-1 text-[11.5px] text-muted-foreground">
              توزيع البنود كنسبة من إجمالي تكلفة المنصة في الفترة المحددة.
            </p>
          </div>
          <div className="text-end">
            <p className="text-[11px] text-muted-foreground">الإجمالي</p>
            <p className="num mt-0.5 text-xl font-semibold">{money(total)} ر.س</p>
          </div>
        </div>

        <div className="mt-5 flex h-[12px] overflow-hidden rounded-full bg-muted">
          {charges.map((line, index) => {
            const share = total > 0 ? line.amount / total : 0;
            return (
              <span
                key={line.label}
                title={line.label}
                style={{
                  width: `${Math.max(share * 100, 0.5)}%`,
                  background: COLORS[index % COLORS.length],
                }}
              />
            );
          })}
        </div>

        <div className="mt-5 grid gap-x-8 md:grid-cols-2">
          {charges.map((line, index) => {
            const share = total > 0 ? line.amount / total : 0;
            return (
              <div
                key={line.label}
                className="flex items-center gap-3 border-b border-border/60 py-2.5"
              >
                <span
                  className="size-2.5 shrink-0 rounded-[3px]"
                  style={{ background: COLORS[index % COLORS.length] }}
                />
                <span className="min-w-0 flex-1 text-[13px]">{line.label}</span>
                <span className="num text-[12px] text-muted-foreground">
                  {percent(share, 1)}
                </span>
                <span className="num min-w-[88px] text-end text-[13px] font-semibold">
                  {money(line.amount)}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <div className="grid gap-3 lg:grid-cols-2">
        <section className="panel p-4">
          <h2 className="text-sm font-semibold">
            {isHunger
              ? "الخصومات التسويقية والمرتجعات"
              : isJahez
                ? "بنود تسوية جاهز"
                : "مؤشرات التسوية"}
          </h2>
          {discounts.length ? (
            <dl className="mt-3">
              {discounts.map((line) => (
                <div
                  key={line.label}
                  className="flex items-center justify-between gap-3 border-b border-border/60 py-2"
                >
                  <dt className="text-[12.5px] text-muted-foreground">{line.label}</dt>
                  <dd className="num text-[13px] font-semibold">{money(line.amount)}</dd>
                </div>
              ))}
            </dl>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">لا توجد قيم في هذه الفترة.</p>
          )}
        </section>

        <section className="panel p-4">
          <h2 className="text-sm font-semibold">حالات الطلبات</h2>
          <dl className="mt-3">
            {Object.entries(s.statusCounts ?? {})
              .sort((a, b) => b[1] - a[1])
              .map(([status, value]) => (
                <div
                  key={status}
                  className="flex items-center justify-between gap-3 border-b border-border/60 py-2"
                >
                  <dt className="text-[12.5px] text-muted-foreground">{status}</dt>
                  <dd className="num text-[13px] font-semibold">{count(value)}</dd>
                </div>
              ))}
          </dl>
        </section>
      </div>
    </div>
  );
}
