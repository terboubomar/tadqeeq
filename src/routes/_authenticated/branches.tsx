import { PageHeader } from "@/components/workspace/PageKit";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { BookOpenCheck } from "lucide-react";
import { useState } from "react";

import { BranchJournalsDialog, JournalEntryDialog } from "@/components/journal/JournalEntryDialog";
import type { BranchJournal } from "@/components/journal/journal-export";
import { useJournalAccounts } from "@/components/journal/use-journal-accounts";
import { Button } from "@/components/ui/button";
import { branchJournalEntry, type JournalEntry } from "@/lib/journal-entries";

import { listBranchRegistry, resolveBranchName } from "@/lib/branch-registry";
import { displayBranchName, platformCostPct, totalPlatformCharges } from "@/lib/reporting-metrics";

import { EmptyState } from "@/components/AppShell";
import { ReportTable, type Column } from "@/components/ReportTable";
import type { BranchRow as AnalysisBranchRow } from "@/lib/analysis/types";

/** Display-only: Keeta "other" expenses without the POS installment, which they include. */
type BranchRow = AnalysisBranchRow & { keetaOtherExclPosExVat?: number; platformCostPctGross?: number };
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
  { key: "commission", header: "العمولة (بدون الضريبة)" },
  { key: "invoiceCommission", header: "عمولة الفاتورة (بدون الضريبة)" },
  { key: "commissionVariance", header: "فرق العمولة (بدون الضريبة)" },
  { key: "commissionPct", header: "نسبة العمولة", type: "percent" },
  { key: "bankFeeSuccess", header: "رسوم البطاقات الناجحة (بدون الضريبة)" },
  { key: "invoicePaymentFees", header: "إجمالي رسوم الدفع بالفاتورة (بدون الضريبة)" },
  { key: "invoiceWalletFee", header: "رسوم المحافظ بالفاتورة (بدون الضريبة)" },
  { key: "invoiceCardPaymentFees", header: "رسوم البطاقات بالفاتورة (بدون الضريبة)" },
  { key: "paymentFeeVariance", header: "فرق رسوم البطاقات (بدون الضريبة)" },
  { key: "bankFeeRefunded", header: "رسوم بطاقات مرتجعة (بدون الضريبة)" },
  { key: "walletFee", header: "رسوم المحافظ حسب الفاتورة (بدون الضريبة)" },
  { key: "rdfCampaigns", header: "حملات التوصيل المجاني (بدون الضريبة)" },
  { key: "compensation", header: "تعويضات العملاء (بدون الضريبة)" },
  { key: "jokerFees", header: "رسوم العروض (بدون الضريبة)" },
  { key: "waitingTimeFees", header: "وقت الانتظار (بدون الضريبة)" },
  { key: "invoiceOnlyBranchCharges", header: "بنود الفرع من الفاتورة فقط (بدون الضريبة)" },
  { key: "totalCharges", header: "إجمالي الخصومات (بدون الضريبة)" },
  { key: "platformCostPctGross", header: "تكلفة المنصة % من إجمالي المبيعات", type: "percent" },
  { key: "totalCollections", header: "التحصيلات المحتسبة" },
  { key: "invoiceCollections", header: "تحصيلات الفاتورة" },
  { key: "collectionsVariance", header: "فرق التحصيلات" },
  { key: "walletAmount", header: "محافظ العملاء" },
  { key: "partialRefund", header: "مرتجعات جزئية" },
];

const KEETA_COLUMNS: Column<BranchRow>[] = [
  { key: "branch", header: "المتجر", type: "text" },
  { key: "branchId", header: "Store ID", type: "text" },
  { key: "branchAuditLabel", header: "حالة المطابقة", type: "text" },
  { key: "orders", header: "الطلبات", type: "number" },
  { key: "grossSales", header: "المبيعات شامل الضريبة" },
  { key: "keetaSalesExVat", header: "المبيعات بدون الضريبة" },
  { key: "commission", header: "عمولة الطلب بدون الضريبة" },
  { key: "commissionPct", header: "نسبة العمولة الفعلية", type: "percent" },
  { key: "keetaBankFeesExVat", header: "رسوم البنك بدون الضريبة" },
  { key: "keetaDeliveryCampaignExVat", header: "دعم توصيل كيتا" },
  { key: "keetaProductCampaignExVat", header: "حملات الأصناف" },
  { key: "keetaMerchantAdExVat", header: "إعلانات التاجر" },
  { key: "keetaPosFeesExVat", header: "أقساط POS" },
  // Keeta's "other" columns include the POS installment, so it is shown here without it.
  { key: "keetaOtherExclPosExVat", header: "مصروفات أخرى (غير POS)" },
  { key: "keetaCommissionInvoiceInclVat", header: "فاتورة العمولة المحتسبة" },
  { key: "keetaExcelInvoiceAmount", header: "Invoice amount حسب Excel" },
  { key: "keetaExcelInvoiceVariance", header: "فرق Invoice amount" },
  { key: "keetaPdfCommissionInvoiceInclVat", header: "فاتورة العمولة PDF" },
  { key: "keetaPdfCommissionVariance", header: "فرق فاتورة العمولة" },
  { key: "keetaCreditSales", header: "البيع الآجل المحتسب" },
  { key: "keetaPdfCreditSales", header: "البيع الآجل PDF" },
  { key: "keetaPdfCreditSalesVariance", header: "فرق البيع الآجل" },
  { key: "netSales", header: "صافي المستحق المحتسب" },
  { key: "keetaExcelPayable", header: "Payable حسب Invoice Details" },
  { key: "keetaExcelPayableVariance", header: "فرق Payable الرسمي" },
  { key: "keetaPdfNetDue", header: "صافي المستحق PDF" },
  { key: "keetaPdfNetDueVariance", header: "فرق صافي المستحق" },
  { key: "keetaSourcePayable", header: "Payable حسب Excel" },
  { key: "keetaSettlementVariance", header: "فرق Payable" },
  { key: "keetaTotalCostExVat", header: "كل ما خصمته كيتا بدون الضريبة" },
  { key: "keetaInputVat", header: "ضريبة المدخلات" },
  { key: "keetaTotalCostInclVat", header: "كل ما خصمته كيتا شامل الضريبة" },
  { key: "platformCostPctGross", header: "تكلفة المنصة % من إجمالي المبيعات", type: "percent" },
  { key: "keetaPlatformCostPct", header: "تكلفة كيتا % من المبيعات بدون الضريبة", type: "percent" },
  { key: "keetaAvgOrderValueInclVat", header: "متوسط الطلب شامل الضريبة" },
];


const JAHEZ_COLUMNS: Column<BranchRow>[] = [
  { key: "branch", header: "الفرع", type: "text" },
  { key: "branchAuditLabel", header: "حالة التسوية", type: "text" },
  { key: "orders", header: "الطلبات", type: "number" },
  { key: "grossSales", header: "Order Amount" },
  { key: "jahezReportedRestaurantAmount", header: "Restaurant Amount" },
  { key: "jahezSettlementVariance", header: "فرق صافي المطعم" },
  { key: "commission", header: "عمولة جاهز بدون الضريبة" },
  { key: "jahezCommissionInclVat", header: "عمولة جاهز شامل الضريبة" },
  { key: "commissionPct", header: "نسبة العمولة", type: "percent" },
  { key: "jahezPaymentFeesExVat", header: "Payment Fees" },
  { key: "jahezPaymentFeesVat", header: "Payment Fees VAT" },
  { key: "jahezDeliveryOfferInclVat", header: "Delivery Offer المخصوم" },
  { key: "jahezDeliveryOfferInvoiceExVat", header: "Delivery Offer للفوترة بدون الضريبة" },
  { key: "jahezOfferAmount", header: "Offer Amount" },
  { key: "jahezDeliveryCoupon", header: "Delivery Coupon" },
  { key: "jahezDeliveryCharge", header: "Delivery Charge" },
  { key: "jahezCompensationTransactions", header: "حركات التعويض", type: "number" },
  { key: "jahezCompensationDebit", header: "تعويضات مخصومة" },
  { key: "jahezCompensationCredit", header: "تعويضات مضافة" },
  { key: "jahezCompensationNetImpact", header: "صافي أثر التعويضات" },
  { key: "jahezCompensationDuplicateAmount", header: "تكرار مشتبه" },
  { key: "jahezCompensationUnknownAmount", header: "تعويضات بدون طلب مصدر" },
  { key: "totalCharges", header: "تكلفة الفاتورة المحتسبة بدون الضريبة" },
  { key: "platformCostPctGross", header: "تكلفة المنصة % من إجمالي المبيعات", type: "percent" },
];

function BranchesPage() {
  const { selected, isLoading } = useSelectedPeriod();
  const { data: registry = [] } = useQuery({ queryKey: ["branch-registry"], queryFn: listBranchRegistry });
  const accounts = useJournalAccounts();
  const [entry, setEntry] = useState<JournalEntry | null>(null);
  const [journals, setJournals] = useState<BranchJournal[] | null>(null);

  if (isLoading) {
    return <p className="py-20 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>;
  }
  if (!selected) {
    return <EmptyState title="لا توجد فترات محفوظة" body="ارفع ملفات الفترة لعرض تقرير الفروع." />;
  }

  const rows = selected.branches.map((b, index) => ({
    ...b,
    journalIndex: index,
    branch: resolveBranchName(registry, selected.platform, b.branchId, b.branch) ?? displayBranchName(b.branch),
    platformCostPctGross: platformCostPct(totalPlatformCharges(selected.platform, b), b.grossSales) ?? undefined,
    keetaOtherExclPosExVat:
      b.keetaOtherExpensesExVat === undefined ? undefined : b.keetaOtherExpensesExVat - (b.keetaPosFeesExVat ?? 0),
  }));

  const period = selected;
  function openAllBranches() {
    setJournals(
      rows.map((row) => ({
        branch: row.branch,
        entry: branchJournalEntry(period, { ...period.branches[row.journalIndex]!, branch: row.branch }, accounts),
      })),
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "الرئيسية", to: "/dashboard" }, { label: "التقارير" }, { label: "تقرير الفروع" }]}
        title="تقرير الفروع"
        subtitle="اضغط على اسم أي فرع لعرض قيده المحاسبي، أو «قيود كل الفروع» لقيد مستقل لكل فرع، أو على عنوان عمود للترتيب."
        aside={
          <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-full" onClick={openAllBranches}>
            <BookOpenCheck className="size-4" />
            قيود كل الفروع
          </Button>
        }
      />
      <ReportTable
        title={selected.label}
        rows={rows as unknown as Record<string, unknown>[]}
        columns={
          (selected.platform === "hungerstation"
            ? HUNGER_COLUMNS
            : selected.platform === "keeta"
              ? KEETA_COLUMNS
              : JAHEZ_COLUMNS) as unknown as Column<Record<string, unknown>>[]
        }
        filename={`branches-${selected.period_start ?? "period"}`}
        searchKey="branch"
        cellAction={{
          key: "branch",
          label: "عرض القيد المحاسبي للفرع",
          onClick: (row) => {
            const branch = selected.branches[row["journalIndex"] as number];
            if (branch) setEntry(branchJournalEntry(selected, { ...branch, branch: String(row["branch"]) }, accounts));
          },
        }}
        caption={
          selected.platform === "hungerstation"
            ? "حالة المطابقة تقارن كل فرع في ملف الطلبات مع صفحات تفاصيل فاتورة هنقرستيشن. الفروق الصغيرة قد تكون تقريباً من المنصة."
            : selected.platform === "keeta"
              ? "المطابقة تعتمد على Store ID. إذا كان ملف كيتا يحتوي Invoice Details تتم مقارنة Invoice amount وPayable لكل فرع مباشرةً من Excel؛ وعند إرفاق PDF تُضاف مطابقة عمولة الطلب ورسوم البنك والتوصيل وCredit Sales وNet Due."
              : "جاهز لا يوفّر تفاصيل فاتورة حسب الفرع في الملفات الحالية؛ يتم التحقق من Restaurant Amount لكل فرع، ويُضاف تقرير التعويضات حسب الفرع مع كشف التكرار والطلبات غير المعروفة. مطابقة الفاتورة الضريبية تبقى على إجمالي التاجر."
        }
      />
      <JournalEntryDialog entry={entry} onClose={() => setEntry(null)} />
      <BranchJournalsDialog title={selected.label} journals={journals} onClose={() => setJournals(null)} />
    </div>
  );
}
