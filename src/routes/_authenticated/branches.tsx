import { createFileRoute } from "@tanstack/react-router";

import { EmptyState } from "@/components/AppShell";
import { ReportTable, type Column } from "@/components/ReportTable";
import type { BranchRow } from "@/lib/analysis/types";
import { useSelectedPeriod } from "@/lib/use-period";

export const Route = createFileRoute("/_authenticated/branches")({
  head: () => ({
    meta: [
      { title: "تقرير الفروع · تدقيق" },
      { name: "description", content: "مبيعات وعمولات ورسوم كل فرع خلال الفترة." },
      { property: "og:title", content: "تقرير الفروع · تدقيق" },
      { property: "og:description", content: "مبيعات وعمولات ورسوم كل فرع خلال الفترة." },
    ],
  }),
  component: BranchesPage,
});

const HUNGER_COLUMNS: Column<BranchRow>[] = [
  { key: "branch", header: "الفرع", type: "text" },
  { key: "branchAuditLabel", header: "حالة المطابقة", type: "text" },
  { key: "orders", header: "الطلبات", type: "number" },
  { key: "creditSales", header: "مبيعات الائتمان (بدون ضريبة)" },
  { key: "invoiceCreditSales", header: "مبيعات الفاتورة" },
  { key: "creditSalesVariance", header: "فرق المبيعات" },
  { key: "grossSales", header: "المبيعات (شامل الضريبة)" },
  { key: "netSales", header: "الأساس الخاضع للعمولة" },
  { key: "commission", header: "العمولة" },
  { key: "invoiceCommission", header: "عمولة الفاتورة" },
  { key: "commissionVariance", header: "فرق العمولة" },
  { key: "commissionPct", header: "نسبة العمولة", type: "percent" },
  { key: "bankFeeSuccess", header: "رسوم البطاقات الناجحة" },
  { key: "invoicePaymentFees", header: "رسوم الدفع بالفاتورة" },
  { key: "paymentFeeVariance", header: "فرق رسوم الدفع" },
  { key: "bankFeeRefunded", header: "رسوم دفع مرتجعة" },
  { key: "walletFee", header: "رسوم المحافظ" },
  { key: "rdfCampaigns", header: "حملات التوصيل المجاني" },
  { key: "compensation", header: "تعويضات العملاء" },
  { key: "jokerFees", header: "رسوم العروض" },
  { key: "waitingTimeFees", header: "وقت الانتظار" },
  { key: "invoiceOnlyBranchCharges", header: "بنود الفرع من الفاتورة فقط" },
  { key: "totalCharges", header: "إجمالي الخصومات" },
  { key: "totalCollections", header: "التحصيلات المحتسبة" },
  { key: "invoiceCollections", header: "تحصيلات الفاتورة" },
  { key: "collectionsVariance", header: "فرق التحصيلات" },
  { key: "walletAmount", header: "محافظ العملاء" },
  { key: "partialRefund", header: "مرتجعات جزئية" },
];

const KEETA_COLUMNS: Column<BranchRow>[] = [
  { key: "branch", header: "المتجر", type: "text" },
  { key: "branchId", header: "Store ID", type: "text" },
  { key: "orders", header: "الطلبات", type: "number" },
  { key: "grossSales", header: "المبيعات شامل الضريبة" },
  { key: "keetaSalesExVat", header: "المبيعات بدون الضريبة" },
  { key: "commission", header: "العمولة بدون الضريبة" },
  { key: "commissionPct", header: "نسبة العمولة الفعلية", type: "percent" },
  { key: "keetaBankFeesExVat", header: "رسوم البنك بدون الضريبة" },
  { key: "keetaDeliveryCampaignExVat", header: "التوصيل / الحملات" },
  { key: "keetaAdvertisingExVat", header: "الإعلانات" },
  { key: "keetaCompensationExVat", header: "تعويضات / خصومات المنصة" },
  { key: "keetaOtherExpensesExVat", header: "مصروفات أخرى" },
  { key: "keetaTotalCostExVat", header: "إجمالي تكلفة المنصة بدون الضريبة" },
  { key: "keetaInputVat", header: "ضريبة المدخلات" },
  { key: "keetaTotalCostInclVat", header: "تكلفة المنصة شامل الضريبة" },
  { key: "netSales", header: "صافي التسوية المحتسب" },
  { key: "keetaSourcePayable", header: "Payable حسب كيتا" },
  { key: "keetaSettlementVariance", header: "فرق التسوية" },
  { key: "keetaPlatformCostPct", header: "تكلفة المنصة %", type: "percent" },
  { key: "keetaAvgOrderValueInclVat", header: "متوسط الطلب شامل الضريبة" },
];

function BranchesPage() {
  const { selected, isLoading } = useSelectedPeriod();

  if (isLoading) {
    return <p className="py-20 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>;
  }
  if (!selected) {
    return <EmptyState title="لا توجد فترات محفوظة" body="ارفع ملفات الفترة لعرض تقرير الفروع." />;
  }

  return (
    <div className="space-y-5">
      <header>
        <h1 className="text-2xl font-black">تقرير الفروع</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          اضغط على عنوان أي عمود للترتيب تصاعدياً أو تنازلياً.
        </p>
      </header>
      <ReportTable
        title={selected.label}
        rows={selected.branches as unknown as Record<string, unknown>[]}
        columns={
          (selected.platform === "hungerstation"
            ? HUNGER_COLUMNS
            : KEETA_COLUMNS) as unknown as Column<Record<string, unknown>>[]
        }
        filename={`branches-${selected.period_start ?? "period"}`}
        searchKey="branch"
        caption={
          selected.platform === "hungerstation"
            ? "حالة المطابقة تقارن كل فرع في ملف الطلبات مع صفحات تفاصيل فاتورة هنقرستيشن. الفروق الصغيرة قد تكون تقريباً من المنصة."
            : "الأرقام معاد احتسابها من Order Summary. فرق التسوية يقارن صافي التسوية المحتسب مع Payable to merchant من ملف كيتا."
        }
      />
    </div>
  );
}
