import { createFileRoute } from "@tanstack/react-router";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";

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
  const charges: Line[] = (
    isHunger
      ? [
          { label: "عمولة المبيعات", amount: s.commission },
          {
            label: "رسوم الدفع الإلكتروني",
            amount: s.bankFeeSuccess + s.bankFeeRefunded + (s.walletFee ?? 0),
          },
          { label: "حملات التوصيل المجاني", amount: s.rdfCampaigns },
          { label: "تعويضات العملاء", amount: s.compensation },
          { label: "رسوم العروض السريعة", amount: s.jokerFees },
          { label: "رسوم وقت الانتظار", amount: s.waitingTimeFees },
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
          <h1 className="text-2xl font-black">تفصيل البنود</h1>
          <p className="mt-1 text-sm text-muted-foreground">{selected.label}</p>
        </div>
        <Button
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

      <div className="grid gap-5 lg:grid-cols-5">
        <section className="panel p-5 lg:col-span-3">
          <h2 className="text-base font-bold">
            {isHunger ? "مما تتكوّن خصومات المنصة" : "مما تتكوّن تكلفة كيتا (بدون الضريبة)"}
          </h2>
          <ul className="mt-4 space-y-3">
            {charges.map((line, index) => {
              const share = total > 0 ? line.amount / total : 0;
              return (
                <li key={line.label}>
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <span className="font-medium">{line.label}</span>
                    <span className="num font-bold">{money(line.amount)}</span>
                  </div>
                  <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-secondary">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${Math.max(share * 100, 0.5)}%`,
                        background: COLORS[index % COLORS.length],
                      }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">{percent(share, 1)}</p>
                </li>
              );
            })}
          </ul>
        </section>

        <section className="panel p-5 lg:col-span-2">
          <h2 className="text-base font-bold">التوزيع</h2>
          <div className="mt-2 h-64" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={charges}
                  dataKey="amount"
                  nameKey="label"
                  innerRadius={54}
                  outerRadius={92}
                  paddingAngle={2}
                >
                  {charges.map((line, index) => (
                    <Cell key={line.label} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value: number) => money(value)}
                  contentStyle={{
                    background: "var(--color-popover)",
                    border: "1px solid var(--color-border)",
                    borderRadius: "12px",
                    fontSize: "12px",
                    direction: "rtl",
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <p className="mt-2 text-center text-sm">
            الإجمالي <span className="num font-bold text-primary">{money(total)}</span> ر.س
          </p>
        </section>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="text-base font-bold">
            {isHunger ? "الخصومات التسويقية والمرتجعات" : "مؤشرات التسوية"}
          </h2>
          {discounts.length ? (
            <ul className="mt-3 space-y-2 text-sm">
              {discounts.map((line) => (
                <li
                  key={line.label}
                  className="flex items-center justify-between gap-3 border-b border-border/50 pb-2"
                >
                  <span className="text-muted-foreground">{line.label}</span>
                  <span className="num font-semibold">{money(line.amount)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 text-sm text-muted-foreground">لا توجد قيم في هذه الفترة.</p>
          )}
        </section>

        <section className="panel p-5">
          <h2 className="text-base font-bold">حالات الطلبات</h2>
          <ul className="mt-3 space-y-2 text-sm">
            {Object.entries(s.statusCounts ?? {})
              .sort((a, b) => b[1] - a[1])
              .map(([status, value]) => (
                <li
                  key={status}
                  className="flex items-center justify-between gap-3 border-b border-border/50 pb-2"
                >
                  <span className="text-muted-foreground">{status}</span>
                  <span className="num font-semibold">{count(value)}</span>
                </li>
              ))}
          </ul>
        </section>
      </div>
    </div>
  );
}
