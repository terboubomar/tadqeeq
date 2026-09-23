import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Banknote,
  CreditCard,
  Percent,
  Receipt,
  RefreshCw,
  ShoppingBag,
  Sparkles,
  Store,
  TrendingUp,
  Wallet,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { EmptyState } from "@/components/AppShell";
import { AI_UI_ENABLED } from "@/lib/ai/config";
import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { arabicDate, count, money, percent, sar, short } from "@/lib/format";
import { reanalyzeAuditPeriod } from "@/lib/reanalyze-period.functions";
import { setSelectedPeriodId, useSelectedPeriod } from "@/lib/use-period";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "اللوحة التنفيذية · تدقيق" },
      { name: "description", content: "ملخص المبيعات والعمولات والرسوم للفترة المختارة." },
      { property: "og:title", content: "اللوحة التنفيذية · تدقيق" },
      { property: "og:description", content: "ملخص المبيعات والعمولات والرسوم للفترة المختارة." },
    ],
  }),
  component: Dashboard,
});

const chartStyle = {
  contentStyle: {
    background: "var(--color-popover)",
    border: "1px solid var(--color-border)",
    borderRadius: "12px",
    fontSize: "12px",
    direction: "rtl" as const,
  },
  labelStyle: { color: "var(--color-muted-foreground)" },
};

function Dashboard() {
  const queryClient = useQueryClient();
  const { selected, isLoading } = useSelectedPeriod();
  const [reanalyzing, setReanalyzing] = useState(false);

  if (isLoading) {
    return <p className="py-20 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>;
  }

  if (!selected) {
    return (
      <EmptyState
        title="لا توجد فترات محفوظة"
        body="ارفع ملف الطلبات وفاتورة المنصة لبدء أول تدقيق."
      />
    );
  }

  const s = selected.summary;
  const isHunger = selected.platform === "hungerstation";
  const isKeeta = selected.platform === "keeta";
  const isJahez = selected.platform === "jahez";
  const platformLabel = isHunger ? "هنقرستيشن" : isKeeta ? "كيتا" : "جاهز";
  const costLabel = isHunger ? "عمولة" : isJahez ? "تكلفة الفاتورة" : "تكلفة المنصة";
  async function reanalyzeCurrentPeriod() {
    setReanalyzing(true);
    try {
      const response = await reanalyzeAuditPeriod({
        data: { periodId: selected.id },
      });
      setSelectedPeriodId(response.periodId);
      await queryClient.invalidateQueries({ queryKey: ["periods"] });
      toast.success(
        "تم إنشاء إصدار جديد من التدقيق باستخدام ملفات المصدر الأصلية.",
        {
          description:
            "الإصدار السابق محفوظ كسجل تاريخي · المحرك " +
            response.engineVersion,
        },
      );
    } catch (cause) {
      toast.error(
        cause instanceof Error
          ? cause.message
          : "تعذّرت إعادة تحليل هذه الفترة.",
      );
    } finally {
      setReanalyzing(false);
    }
  }

  const topBranches = [...selected.branches].slice(0, 8).map((branch) => ({
    name: branch.branch.length > 18 ? `${branch.branch.slice(0, 18)}…` : branch.branch,
    [costLabel]: Number(
      (
        isHunger
          ? branch.commission
          : isKeeta
            ? (branch.keetaTotalCostExVat ?? branch.totalCharges)
            : branch.totalCharges
      ).toFixed(2),
    ),
    مبيعات: Number((isHunger ? branch.netSales : branch.grossSales).toFixed(2)),
  }));

  const daily = selected.daily
    .filter(
      (day) =>
        (!selected.period_start || day.date >= selected.period_start) &&
        (!selected.period_end || day.date <= selected.period_end),
    )
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((day) => ({
      date: day.date.slice(8, 10) + "/" + day.date.slice(5, 7),
      مبيعات: Number((isHunger ? day.netSales : day.grossSales).toFixed(2)),
      [costLabel]: Number(day.commission.toFixed(2)),
    }));

  return (
    <div className="space-y-6">
      <header>
        <h1 className="audit-heading">اللوحة التنفيذية</h1>
        <p className="audit-subtitle">
          {selected.label} · {arabicDate(selected.period_start)} — {arabicDate(selected.period_end)} ·{" "}
          {platformLabel} · <span className="num">{count(s.branchCount)}</span> فرع ·{" "}
          <span className="num">{count(s.orders)}</span> طلب
        </p>
      </header>

      <section className="rounded-xl border border-border bg-white px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold">نسخة التدقيق</p>
            <p className="num mt-1 text-[11.5px] text-muted-foreground">
              Engine {selected.engine_version}
              {selected.supersedes_period_id ? " · إعادة تحليل" : " · الإصدار الأصلي"}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={reanalyzing}
            onClick={() => void reanalyzeCurrentPeriod()}
          >
            <RefreshCw className={reanalyzing ? "size-3.5 animate-spin" : "size-3.5"} />
            {reanalyzing ? "جارٍ إعادة التحليل…" : "إعادة التحليل من ملفات المصدر"}
          </Button>
        </div>
      </section>

      {AI_UI_ENABLED ? (
        <section className="rounded-xl border border-primary/15 bg-secondary/25 p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <Sparkles className="size-4 text-primary" />
                <h2 className="text-sm font-bold">إجراء سريع</h2>
              </div>
              <p className="mt-1.5 text-xs leading-6 text-muted-foreground">
                افتح مساحة Tadqeeq AI للحصول على ملخص الفترة، مقارنة الفترة السابقة، وتفسير التغيّرات.
              </p>
            </div>
            <Button asChild size="sm" className="shrink-0">
              <Link to="/ai">
                <Sparkles className="size-3.5" />
                فتح Tadqeeq AI
              </Link>
            </Button>
          </div>
        </section>
  
      ) : null}

      <section className="audit-kpi-strip grid gap-0 sm:grid-cols-2 xl:grid-cols-4 [&>*]:rounded-none [&>*]:border-0 [&>*]:border-s [&>*]:border-border/70 [&>*:first-child]:border-s-0">
        <StatCard
          label={isHunger ? "المبيعات الإجمالية (شامل الضريبة)" : "المبيعات الإجمالية (شامل الضريبة)"}
          value={sar(s.grossSales)}
          icon={ShoppingBag}
          tone="gold"
        />
        <StatCard
          label={
            isHunger
              ? "صافي المبيعات الخاضعة للعمولة"
              : isJahez
                ? "صافي المطعم حسب جاهز"
                : "صافي التسوية المحتسب"
          }
          value={sar(s.netSales)}
          icon={TrendingUp}
        />
        <StatCard
          label={
            isHunger
              ? "إجمالي العمولة"
              : isJahez
                ? "عمولة جاهز (بدون الضريبة)"
                : "عمولة كيتا (بدون الضريبة)"
          }
          value={sar(s.commission)}
          hint={`بنسبة ${percent(s.commissionPct)} من الأساس`}
          icon={Percent}
          tone="negative"
        />
        <StatCard
          label={
            isHunger
              ? "إجمالي ما خصمته المنصة"
              : isJahez
                ? "فاتورة جاهز المحتسبة (بدون الضريبة)"
                : "تكلفة المنصة (بدون الضريبة)"
          }
          value={sar(s.totalCharges)}
          hint={
            isHunger
              ? "عمولة + رسوم دفع + حملات + تعويضات"
              : isJahez
                ? "عمولة + رسوم مدفوعات + عروض توصيل حسب قواعد الفاتورة"
                : `تكلفة فعلية ${percent(s.keetaPlatformCostPct ?? 0)} من المبيعات بدون الضريبة`
          }
          icon={Receipt}
          tone="negative"
        />
      </section>

      {isHunger ? (
        <section className="audit-kpi-strip grid gap-0 sm:grid-cols-2 xl:grid-cols-4 [&>*]:rounded-none [&>*]:border-0 [&>*]:border-s [&>*]:border-border/70 [&>*:first-child]:border-s-0">
          <StatCard
            label="صافي مدفوعات البطاقات"
            value={sar(s.netBankCards ?? s.ccSuccess)}
            hint="التحصيل الفعلي بعد استبعاد Failed by vendor"
            icon={CreditCard}
          />
          <StatCard
            label="رسوم الدفع الإلكتروني"
            value={sar(
              selected.invoice?.paymentFees ??
                s.bankFeeSuccess + s.bankFeeRefunded + (s.walletFee ?? 0),
            )}
            hint={
              selected.invoice?.paymentFees !== undefined
                ? `الفاتورة: ${sar(selected.invoice.paymentFees)} · بطاقات قابلة للتحقق: ${sar(
                    s.bankFeeSuccess + s.bankFeeRefunded,
                  )} · محافظ حسب الفاتورة: ${sar(s.walletFee ?? 0)}`
                : s.bankRate > 0
                  ? `رسوم البطاقات المحتسبة بنسبة ${percent(s.bankRate)} ${
                      s.bankRateSource === "invoice"
                        ? "(مستنتجة من الفاتورة — غير مستقلة)"
                        : s.bankRateSource === "manual"
                          ? "(نسبة العقد)"
                          : ""
                    }`
                  : "لم تُحدَّد نسبة — أدخل نسبة العقد أو أرفق الفاتورة للتسوية"
            }
            icon={Banknote}
            tone={s.bankRate > 0 ? "default" : "negative"}
          />
          <StatCard label="محافظ العملاء" value={sar(s.walletAmount)} icon={Wallet} />
          <StatCard label="محافظ المندوبين" value={sar(s.riderWallet)} icon={Store} />
        </section>
      ) : isJahez ? (
        <section className="audit-kpi-strip grid gap-0 sm:grid-cols-2 xl:grid-cols-4 [&>*]:rounded-none [&>*]:border-0 [&>*]:border-s [&>*]:border-border/70 [&>*:first-child]:border-s-0">
          <StatCard
            label="رسوم المدفوعات"
            value={sar(s.jahezPaymentFeesExVat ?? 0)}
            hint="Payment Fees من ملخص CSV"
            icon={CreditCard}
          />
          <StatCard
            label="VAT رسوم المدفوعات المخصوم"
            value={sar(s.jahezPaymentFeesVat ?? 0)}
            hint="مجموع الضريبة المخصومة على مستوى الطلب"
            icon={Receipt}
          />
          <StatCard
            label="عروض التوصيل المخصومة"
            value={sar(s.jahezDeliveryOfferInclVat ?? 0)}
            hint="القيمة المخصومة من التسوية شامل الضريبة"
            icon={Store}
          />
          <StatCard
            label="فرق صافي المطعم"
            value={sar(s.jahezSettlementVariance ?? 0)}
            hint="إعادة الاحتساب ناقص Restaurant Amount"
            icon={Banknote}
            tone={Math.abs(s.jahezSettlementVariance ?? 0) > 0.05 ? "negative" : "default"}
          />
        </section>
      ) : (
        <section className="audit-kpi-strip grid gap-0 sm:grid-cols-2 xl:grid-cols-4 [&>*]:rounded-none [&>*]:border-0 [&>*]:border-s [&>*]:border-border/70 [&>*:first-child]:border-s-0">
          <StatCard
            label={s.keetaExcelPayable !== undefined ? "Payable الرسمي حسب كيتا" : "Payable حسب Order Summary"}
            value={sar(s.keetaExcelPayable ?? s.keetaSourcePayable ?? 0)}
            hint={
              s.keetaExcelPayable !== undefined
                ? "من ورقة Invoice Details داخل ملف كيتا"
                : "من عمود Payable to Restaurant في Order Summary"
            }
            icon={Banknote}
          />
          <StatCard
            label="فرق التسوية"
            value={sar(s.keetaExcelPayableVariance ?? s.keetaSettlementVariance ?? 0)}
            hint={
              s.keetaExcelPayable !== undefined
                ? "المحتسب ناقص Payable في Invoice Details"
                : "المحتسب ناقص Payable في Order Summary"
            }
            icon={Receipt}
            tone={
              Math.abs(s.keetaExcelPayableVariance ?? s.keetaSettlementVariance ?? 0) > 0.05
                ? "negative"
                : "default"
            }
          />
          <StatCard
            label="رسوم البنك (بدون الضريبة)"
            value={sar(s.keetaBankFeesExVat ?? 0)}
            icon={CreditCard}
          />
          <StatCard
            label="التوصيل والحملات (بدون الضريبة)"
            value={sar(s.keetaDeliveryCampaignExVat ?? 0)}
            icon={Store}
          />
        </section>
      )}

      {isJahez && s.jahezCompensationTransactions !== undefined ? (
        <section className="audit-kpi-strip grid gap-0 sm:grid-cols-2 xl:grid-cols-4 [&>*]:rounded-none [&>*]:border-0 [&>*]:border-s [&>*]:border-border/70 [&>*:first-child]:border-s-0">
          <StatCard
            label="تعويضات مخصومة"
            value={sar(s.jahezCompensationDebit ?? 0)}
            hint={
              (s.jahezCompensationTransactions ?? 0) +
              " حركة" +
              ((s.jahezCompensationMatchedHistorical ?? 0) > 0
                ? " · " + (s.jahezCompensationMatchedHistorical ?? 0) + " مرتبطة بفترة سابقة"
                : "")
            }
            icon={Receipt}
            tone="negative"
          />
          <StatCard
            label="تعويضات مضافة"
            value={sar(s.jahezCompensationCredit ?? 0)}
            hint="Credit في تقرير التعويضات"
            icon={Banknote}
            tone="positive"
          />
          <StatCard
            label="صافي أثر التعويضات"
            value={sar(s.jahezCompensationNetImpact ?? 0)}
            hint={
              (s.jahezCompensationDuplicateCandidates ?? 0) > 0
                ? (s.jahezCompensationDuplicateCandidates ?? 0) + " حالة تكرار مشتبه بها"
                : "Debit ناقص Credit"
            }
            icon={Receipt}
            tone={(s.jahezCompensationNetImpact ?? 0) > 0 ? "negative" : "default"}
          />
          <StatCard
            label="صافي المطعم بعد التعويضات"
            value={sar(s.jahezAdjustedRestaurantAmount ?? s.netSales)}
            hint={
              (s.jahezCompensationUnknownOrders ?? 0) > 0
                ? (s.jahezCompensationUnknownOrders ?? 0) + " طلب تعويض بدون مصدر متاح"
                : "Restaurant Amount ناقص صافي التعويضات"
            }
            icon={Banknote}
          />
        </section>
      ) : null}

      <div className="grid gap-5 xl:grid-cols-5">
        <section className="panel p-4 xl:col-span-3">
          <h2 className="text-sm font-semibold">
            {isHunger ? "المبيعات والعمولة يومياً" : isJahez ? "المبيعات وعمولة جاهز يومياً" : "المبيعات وتكلفة المنصة يومياً"}
          </h2>
          <div className="mt-4 h-72" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={daily} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.5} />
                    <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                <YAxis
                  tickFormatter={(value: number) => short(value)}
                  tick={{ fontSize: 11 }}
                  stroke="var(--color-muted-foreground)"
                  width={50}
                />
                <Tooltip
                  {...chartStyle}
                  formatter={(value: number) => money(value)}
                />
                <Area
                  type="monotone"
                  dataKey="مبيعات"
                  stroke="var(--color-chart-1)"
                  fill="url(#salesFill)"
                  strokeWidth={2}
                />
                <Area
                  type="monotone"
                  dataKey={costLabel}
                  stroke="var(--color-chart-4)"
                  fill="transparent"
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </section>

        <section className="panel p-4 xl:col-span-2">
          <h2 className="text-sm font-semibold">
            {isHunger ? "أعلى الفروع عمولةً" : isJahez ? "أعلى الفروع تكلفة فاتورة" : "أعلى الفروع تكلفة منصة"}
          </h2>
          <div className="mt-4 h-72" dir="ltr">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={topBranches} layout="vertical" margin={{ left: 8, right: 12 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" horizontal={false} />
                <XAxis
                  type="number"
                  tickFormatter={(value: number) => short(value)}
                  tick={{ fontSize: 11 }}
                  stroke="var(--color-muted-foreground)"
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fontSize: 10 }}
                  stroke="var(--color-muted-foreground)"
                />
                <Tooltip {...chartStyle} formatter={(value: number) => money(value)} />
                <Bar dataKey={costLabel} fill="var(--color-chart-1)" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      </div>
    </div>
  );
}
