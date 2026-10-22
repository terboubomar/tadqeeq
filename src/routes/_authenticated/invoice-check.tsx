import { createFileRoute, Link } from "@tanstack/react-router";
import { PRODUCTS, productPageTitle } from "@/lib/products";
import { ProductName } from "@/components/ProductName";
import { AlertTriangle, CheckCircle2, FileSearch, FileText, History, MinusCircle, Percent, Receipt, ShieldAlert, Upload } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/AppShell";
import { Callout, Segmented, SegmentBar } from "@/components/dash/DashKit";
import { PlatformName } from "@/components/brand/PlatformLogo";
import { ActionBar, ActionDivider, NumberTiles, PageHeader, Section } from "@/components/workspace/PageKit";
import { arabicDate, money, percent, sar } from "@/lib/format";
import { BALANCE_DIRECTION_AR, balanceDirection, statementFormula } from "@/lib/statement-of-account";
import { costReconciliation } from "@/lib/cost-reconciliation";
import type { StoredPeriod } from "@/lib/periods";
import { useSelectedPeriod } from "@/lib/use-period";
import { cn } from "@/lib/utils";
import { ALLOCATION_RULE_AR, invoiceOnlyAllocation } from "@/lib/invoice-only-allocation";
import { PLATFORM_COST_DEFINITION_AR, displayBranchName, vatBreakdown } from "@/lib/reporting-metrics";

export const Route = createFileRoute("/_authenticated/invoice-check")({
  head: () => ({
    meta: [
      { title: productPageTitle("mutabiq") },
      {
        name: "description",
        content: "قارن كل بند محتسب من بيانات الطلبات بالمبلغ الذي طالبت به المنصة.",
      },
      { property: "og:title", content: productPageTitle("mutabiq") },
      {
        property: "og:description",
        content: "قارن كل بند محتسب من بيانات الطلبات بالمبلغ الذي طالبت به المنصة.",
      },
    ],
  }),
  component: InvoiceCheck,
});

const DEFAULT_TOLERANCE = 1; // ريال

function InvoiceCheck() {
  const { selected, isLoading } = useSelectedPeriod();

  if (isLoading) {
    return <p className="py-20 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>;
  }
  if (!selected) {
    return <EmptyState title="لا توجد فترات محفوظة" body="ارفع ملفات الفترة لبدء المطابقة." />;
  }
  return <InvoiceCheckBody selected={selected} />;
}

function InvoiceCheckBody({ selected }: { selected: StoredPeriod }) {
  const [view, setView] = useState<"all" | "flagged">("all");
  const flaggedOnly = view === "flagged";

  const checks = selected.invoice?.checks ?? [];
  const hasPdfInvoice =
    selected.platform === "hungerstation"
      ? Boolean(selected.invoice?.lines?.length)
      : selected.platform === "keeta"
        ? Boolean(
            selected.invoice?.keetaBranches?.length ||
              selected.invoice?.salesCommission !== undefined ||
              selected.invoice?.netDue !== undefined ||
              selected.invoice?.keetaTaxInvoiceExVat !== undefined,
          )
        : Boolean(
            selected.invoice?.jahezCommissionExVat !== undefined ||
              selected.invoice?.totalIncVat !== undefined,
          );
  const hasKeetaExcelControl =
    selected.platform === "keeta" &&
    (selected.invoice?.keetaExcelInvoiceAmount !== undefined ||
      selected.invoice?.keetaExcelPayable !== undefined);
  const hasOfficialControl = hasPdfInvoice || hasKeetaExcelControl;
  // Headline variance should only use one non-overlapping settlement control.
  const headlineLabels =
    selected.platform === "hungerstation"
      ? new Set([
          "عمولة المبيعات",
          "رسوم الدفع الإلكتروني",
          "عمولات أخرى القابلة للتحقق من البيانات",
        ])
      : selected.platform === "keeta"
        ? new Set([
            hasPdfInvoice
              ? "صافي المستحق مقابل فاتورة كيتا"
              : hasKeetaExcelControl
                ? "صافي المستحق مقابل Invoice Details"
                : "صافي التسوية مقابل Order Summary Payable",
          ])
        : new Set(["إجمالي فاتورة جاهز شامل الضريبة"]);
  const independentlyComparable = checks.filter(
    (check) =>
      headlineLabels.has(check.label) &&
      check.invoiced !== undefined &&
      (check.evidence === "data" || check.evidence === "contract" || !check.evidence),
  );
  const totalDiff = independentlyComparable.reduce((sum, check) => {
    const diff = (check.invoiced ?? check.computed) - check.computed;
    const tolerance = check.tolerance ?? DEFAULT_TOLERANCE;
    return sum + (Math.abs(diff) <= tolerance ? 0 : diff);
  }, 0);
  const needsReview = (check: (typeof checks)[number]) => {
    if (
      check.evidence === "invoice_only" ||
      check.evidence === "invoice_derived" ||
      check.evidence === "mixed"
    ) {
      return false;
    }
    if (check.invoiced === undefined) return true;
    return Math.abs(check.invoiced - check.computed) > (check.tolerance ?? DEFAULT_TOLERANCE);
  };
  const flaggedCount = checks.filter(needsReview).length;
  const missingCount = checks.filter(
    (check) => check.invoiced === undefined && check.evidence !== "invoice_only",
  ).length;
  const visibleChecks = flaggedOnly ? checks.filter(needsReview) : checks;
  const invoiceOnlyCount = checks.filter((check) => check.evidence === "invoice_only").length;
  const flaggedPresent = checks.filter((check) => needsReview(check) && check.invoiced !== undefined).length;
  const matchedCount = Math.max(checks.length - flaggedPresent - missingCount - invoiceOnlyCount, 0);
  const keetaExcelOnly = selected.platform === "keeta" && !hasPdfInvoice && hasKeetaExcelControl;
  const overClaimed = totalDiff > DEFAULT_TOLERANCE;
  const vat = vatBreakdown(selected);
  const underClaimed = totalDiff < -DEFAULT_TOLERANCE;

  const lineSummary =
    flaggedCount > 0 ? flaggedCount + " بند يحتاج مراجعة من " + checks.length : checks.length + " بند · كلها مطابقة";

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: "الرئيسية", to: "/dashboard" }, { label: "التدقيق" }, { label: PRODUCTS.mutabiq.name }]}
        title={<ProductName product="mutabiq" />}
        subtitle={
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
            {selected.label} · {arabicDate(selected.period_start)} — {arabicDate(selected.period_end)} ·
            <PlatformName platform={selected.platform} iconClassName="size-4 rounded" />
          </span>
        }
        aside={
          hasOfficialControl ? (
            <span
              className={cn(
                "rounded-full px-3 py-1 text-[12px] font-semibold",
                flaggedCount ? "bg-destructive-soft text-destructive" : "bg-success-soft text-success",
              )}
            >
              {flaggedCount ? "بفروقات" : "مطابقة"}
            </span>
          ) : null
        }
      />

      <ActionBar>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "all", label: "كل البنود" },
            { value: "flagged", label: `غير المطابقة (${flaggedCount})` },
          ]}
        />
        <ActionDivider />
        <Link to="/exceptions" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] hover:bg-muted">
          <ShieldAlert className="size-4 text-primary-text" />
          <span>{"الاستثناءات في «" + PRODUCTS.radar.name + "»"}</span>
        </Link>
        <Link to="/history" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] hover:bg-muted">
          <History className="size-4 text-primary-text" />
          الفترات السابقة
        </Link>
        <Link to="/import" className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-[13px] hover:bg-muted">
          <Upload className="size-4 text-primary-text" />
          رفع فترة
        </Link>
      </ActionBar>

      {!hasOfficialControl ? (
        <Callout tone="warning" icon={AlertTriangle} title="لم تُرفق فاتورة لهذه الفترة">
          {selected.platform === "keeta"
            ? "تمت مطابقة التسوية داخلياً مع Order Summary فقط. هذا الملف لا يحتوي Invoice Details ولم تُرفق فاتورة PDF."
            : selected.platform === "jahez"
              ? "تمت إعادة بناء صافي المطعم والفاتورة من CSV. أرفق فاتورة جاهز PDF لإضافة المطابقة الضريبية الرسمية."
              : "الأرقام أدناه محتسبة من بيانات الطلبات فقط. أعد رفع الفترة مع ملف الفاتورة (PDF) لإظهار الفروقات."}
        </Callout>
      ) : (
        <>
          <NumberTiles
            items={[
              {
                label: "فرق المطالبة عن المحتسب",
                value: money(totalDiff) + " ر.س",
                hint: overClaimed
                  ? "المنصة طالبت بأكثر من المحتسب"
                  : underClaimed
                    ? "المطالبة أقل من المحتسب"
                    : "ضمن هامش التسامح",
                icon: overClaimed ? AlertTriangle : CheckCircle2,
                tone: overClaimed ? "danger" : "success",
              },
              {
                label: "بنود تحتاج مراجعة",
                value: String(flaggedCount),
                hint: "من أصل " + checks.length + " بند مطابَق",
                icon: FileSearch,
                tone: flaggedCount ? "gold" : "plain",
              },
              {
                label: "بنود لم تُقرأ من الفاتورة",
                value: String(missingCount),
                hint: "قيمة المقارنة الرسمية غير متاحة",
                icon: MinusCircle,
              },
              {
                label: keetaExcelOnly ? "Invoice amount حسب Invoice Details" : "إجمالي الفاتورة شامل الضريبة",
                value: keetaExcelOnly ? sar(selected.invoice?.keetaExcelInvoiceAmount ?? 0) : sar(selected.invoice?.totalIncVat ?? 0),
                hint: keetaExcelOnly
                  ? "من ورقة Invoice Details"
                  : selected.invoice?.invoiceNo
                    ? "فاتورة رقم " + selected.invoice.invoiceNo
                    : "حسب ملف PDF",
                icon: FileText,
              },
            ]}
          />
          {vat ? (
            <NumberTiles
              items={[
                {
                  label: "رسوم المنصة (بدون الضريبة)",
                  value: sar(vat.totalChargesExVat),
                  hint: vat.source === "invoice" ? "حسب الفاتورة" : "محتسبة من بيانات الطلبات",
                  icon: Receipt,
                },
                {
                  label: "ضريبة القيمة المضافة 15%",
                  value: sar(vat.vat15Pct),
                  hint: vat.source === "invoice" ? "حسب الفاتورة" : "محتسبة: 15% من الرسوم",
                  icon: Percent,
                },
                {
                  label: "رسوم المنصة (شامل الضريبة)",
                  value: sar(vat.totalChargesIncVat),
                  hint: "لا تقارنها بأرقام «بدون الضريبة»",
                  icon: Receipt,
                },
              ]}
            />
          ) : null}
          {overClaimed ? (
            <p className="text-[12.5px] leading-6 text-muted-foreground">
              المنصة طالبت بمبلغ أعلى من المحتسب. راجع البنود المعلَّمة وافتح استثناءً لكل فرق.
            </p>
          ) : null}
        </>
      )}

      {checks.length ? (
        <Section title="حالة البنود" summary={lineSummary}>
          <div className="p-5">
            <SegmentBar
              segments={[
                { key: "ok", label: "مطابق", value: matchedCount, display: String(matchedCount), color: "var(--color-success)" },
                { key: "flag", label: "يحتاج مراجعة", value: flaggedPresent, display: String(flaggedPresent), color: "var(--color-destructive)" },
                { key: "missing", label: "لم يُقرأ", value: missingCount, display: String(missingCount), color: "var(--color-ink-muted)" },
                { key: "inv", label: "من الفاتورة فقط", value: invoiceOnlyCount, display: String(invoiceOnlyCount), color: "var(--color-primary)" },
              ]}
            />
          </div>
        </Section>
      ) : null}

      <Section title="دفتر المطابقة" summary={flaggedOnly ? "غير المطابقة فقط" : checks.length + " بند"}>
        <p className="border-b border-border/70 px-5 py-2 text-[11.5px] text-muted-foreground">الحدود تختلف حسب نوع البند ومصدر الدليل.</p>
        <div data-scroll className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-[13.5px]">
          <thead className="bg-muted/40">
            <tr>
              <th className="border-b border-border px-3.5 py-2.5 text-start text-[11.5px] font-semibold text-muted-foreground">
                البند
              </th>
              <th className="border-b border-border px-3.5 py-2.5 text-start text-[11.5px] font-semibold text-muted-foreground">
                المحتسب من البيانات
              </th>
              <th className="border-b border-border px-3.5 py-2.5 text-start text-[11.5px] font-semibold text-muted-foreground">
                قيمة المقارنة / المستند الرسمي
              </th>
              <th className="border-b border-border px-3.5 py-2.5 text-start text-[11.5px] font-semibold text-muted-foreground">
                الفرق
              </th>
              <th className="border-b border-border px-3.5 py-2.5 text-start text-[11.5px] font-semibold text-muted-foreground">
                النتيجة
              </th>
              <th className="border-b border-border px-3.5 py-2.5 text-start text-[11.5px] font-semibold text-muted-foreground">
                نوع التحقق
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleChecks.map((check, index) => {
              const evidence = check.evidence ?? "data";
              const invoiceOnly = evidence === "invoice_only";
              const invoiceDerived = evidence === "invoice_derived";
              const mixed = evidence === "mixed";
              const missing = check.invoiced === undefined && !invoiceOnly;
              const diff =
                check.invoiced !== undefined ? check.invoiced - check.computed : undefined;
              const tolerance = check.tolerance ?? DEFAULT_TOLERANCE;
              const roundingMatch =
                diff !== undefined &&
                check.label === "رسوم الدفع الإلكتروني" &&
                Math.abs(diff) > 0.005 &&
                Math.abs(diff) <= tolerance;
              const over = diff !== undefined && diff > tolerance;
              const under = diff !== undefined && diff < -tolerance;
              const withinTolerance =
                diff !== undefined && !invoiceOnly && !over && !under;
              const exactMatch =
                withinTolerance && Math.abs(diff) <= 0.005;
              return (
                <tr
                  key={check.label}
                  className={cn(
                    "align-top",
                    index % 2 ? "bg-background/55" : "bg-white",
                    over && !mixed && "bg-destructive/[0.025]",
                    (over || under) && mixed && "bg-warning/[0.035]",
                  )}
                >
                  <td className="border-b border-border/60 px-3.5 py-2.5">
                    <p className="font-semibold">{check.label}</p>
                    {check.hint ? (
                      <p className="mt-1 max-w-sm text-xs leading-6 text-muted-foreground">
                        {check.hint}
                      </p>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap border-b border-border/60 px-3.5 py-2.5">
                    <span className="num">{invoiceOnly ? "—" : money(check.computed)}</span>
                  </td>
                  <td className="whitespace-nowrap border-b border-border/60 px-3.5 py-2.5">
                    <span className={missing ? "text-xs text-muted-foreground" : "num"}>
                      {missing ? "لم يُقرأ من الفاتورة" : money(check.invoiced ?? 0)}
                    </span>
                  </td>
                  <td className="whitespace-nowrap border-b border-border/60 px-3.5 py-2.5">
                    {missing || invoiceOnly ? (
                      "—"
                    ) : (
                      <span
                        className={cn(
                          "num font-bold",
                          over ? "text-destructive" : under ? "text-success" : "text-foreground",
                        )}
                      >
                        {money(diff ?? 0)}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap border-b border-border/60 px-3.5 py-2.5">
                    {invoiceOnly ? (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                        <AlertTriangle className="size-4" /> يحتاج تحقق
                      </span>
                    ) : missing ? (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MinusCircle className="size-4" /> بيانات مفقودة
                      </span>
                    ) : mixed && (over || under) ? (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                        <AlertTriangle className="size-4" /> فرق داخلي يحتاج مراجعة
                      </span>
                    ) : invoiceDerived && (over || under) ? (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                        <AlertTriangle className="size-4" /> فرق حسابي يحتاج مراجعة
                      </span>
                    ) : roundingMatch ? (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-success">
                        <CheckCircle2 className="size-4" /> مطابق ضمن تقريب هنقرستيشن
                      </span>
                    ) : over ? (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-destructive">
                        <AlertTriangle className="size-4" /> زيادة في المطالبة
                      </span>
                    ) : under ? (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-success">
                        <CheckCircle2 className="size-4" /> أقل من المحتسب
                      </span>
                    ) : exactMatch ? (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-success">
                        <CheckCircle2 className="size-4" /> مطابق
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-success">
                        <CheckCircle2 className="size-4" /> مطابق ضمن هامش التقريب
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap border-b border-border/60 px-3.5 py-2.5">
                    {invoiceOnly ? (
                      <span className="rounded-full bg-warning/10 px-2 py-1 text-[11px] font-semibold text-warning">
                        من الفاتورة فقط
                      </span>
                    ) : invoiceDerived ? (
                      <span className="rounded-full bg-warning/10 px-2 py-1 text-[11px] font-semibold text-warning">
                        مشتق من الفاتورة
                      </span>
                    ) : mixed ? (
                      <span className="rounded-full bg-secondary px-2 py-1 text-[11px] font-semibold text-secondary-foreground">
                        فحص داخلي
                      </span>
                    ) : evidence === "contract" ? (
                      <span className="rounded-full bg-primary/10 px-2 py-1 text-[11px] font-semibold text-primary">
                        تحقق مستقل + عقد
                      </span>
                    ) : (
                      <span className="rounded-full bg-success/10 px-2 py-1 text-[11px] font-semibold text-success">
                        تحقق مستقل
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
        {!visibleChecks.length ? <p className="px-5 py-8 text-center text-sm text-muted-foreground">لا توجد بنود غير مطابقة — كل شيء ضمن هامش التسامح.</p> : null}
      </Section>

      {selected.invoice?.lineDetails?.length ? <InvoiceLinesSection period={selected} /> : null}
      {selected.invoice?.statementOfAccount ? <StatementSection period={selected} /> : null}
      <CostReconciliationSection period={selected} />

      <section className="grid items-start gap-4 lg:grid-cols-2">
        <Section
          title={keetaExcelOnly ? "الضوابط الرسمية كما وردت في Excel" : "بنود الفاتورة كما وردت"}
          summary={(selected.invoice?.lines?.length ?? 0) + " بند"}
          defaultOpen={false}
        >
          <div className="p-5">
          {selected.invoice?.lines?.length ? (
            <ul className="space-y-2 text-sm">
              {selected.invoice.lines.map((line) => (
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
            <p className="text-sm text-muted-foreground">لم تُقرأ أي بنود أو ضوابط رسمية إضافية.</p>
          )}
          </div>
        </Section>

        <Section title="أساس الاحتساب" summary="النسب والأسس المستخدمة" defaultOpen={false}>
          <div className="p-5">
          <dl className="space-y-2 text-sm">
            {selected.platform === "jahez" ? (
              <>
                <Row label="Order Amount" value={sar(selected.summary.grossSales)} />
                <Row
                  label="Restaurant Amount"
                  value={sar(selected.summary.jahezReportedRestaurantAmount ?? selected.summary.netSales)}
                />
                <Row
                  label="عمولة جاهز شامل الضريبة"
                  value={sar(selected.summary.jahezCommissionInclVat ?? 0)}
                />
                <Row
                  label="Payment Fees"
                  value={sar(selected.summary.jahezPaymentFeesExVat ?? 0)}
                />
                <Row
                  label="Payment Fees VAT"
                  value={sar(selected.summary.jahezPaymentFeesVat ?? 0)}
                />
                <Row
                  label="Delivery Offer المخصوم"
                  value={sar(selected.summary.jahezDeliveryOfferInclVat ?? 0)}
                />
                {(selected.summary.jahezCompensationTransactions ?? 0) > 0 ? (
                  <>
                    <Row
                      label="تعويضات مخصومة"
                      value={sar(selected.summary.jahezCompensationDebit ?? 0)}
                    />
                    <Row
                      label="تعويضات مضافة"
                      value={sar(selected.summary.jahezCompensationCredit ?? 0)}
                    />
                    <Row
                      label="صافي أثر التعويضات"
                      value={sar(selected.summary.jahezCompensationNetImpact ?? 0)}
                    />
                    <Row
                      label="صافي المطعم بعد التعويضات"
                      value={sar(
                        selected.summary.jahezAdjustedRestaurantAmount ??
                          selected.summary.jahezReportedRestaurantAmount ??
                          selected.summary.netSales,
                      )}
                    />
                  </>
                ) : null}
              </>
            ) : (
              <>
                <Row label="نسبة العمولة الفعلية" value={percent(selected.summary.commissionPct)} />
                <Row
                  label="نسبة العقد المستخدمة"
                  value={
                    selected.summary.bankRateSource === "manual" && selected.summary.bankRate > 0
                      ? percent(selected.summary.bankRate)
                      : "لم تُدخل"
                  }
                />
                <Row
                  label="النسبة المستنتجة من الفاتورة"
                  value={
                    (selected.summary.invoiceImpliedBankRate ?? 0) > 0
                      ? percent(selected.summary.invoiceImpliedBankRate ?? 0)
                      : "غير متاحة"
                  }
                />
                <Row
                  label="النسبة المطبّقة بالحساب"
                  value={
                    selected.summary.bankRate > 0
                      ? percent(selected.summary.bankRate)
                      : "غير محددة"
                  }
                />
                <Row label="أساس رسوم البطاقات الناجحة" value={sar(selected.summary.ccSuccess)} />
                <Row label="أساس رسوم المحافظ" value={sar(selected.summary.walletFeeBase ?? 0)} />
                <Row label="رسوم المحافظ المحتسبة" value={sar(selected.summary.walletFee ?? 0)} />
                <Row
                  label="صافي مدفوعات البطاقات المحصلة"
                  value={sar(selected.summary.netBankCards ?? selected.summary.ccSuccess)}
                />
                <Row label="مدفوعات بطاقات مرتجعة" value={sar(selected.summary.ccRejected)} />
                {(selected.summary.totalCollections ?? 0) > 0 ? (
                  <Row
                    label="إجمالي التحصيلات المعاد احتسابه"
                    value={sar(selected.summary.totalCollections ?? 0)}
                  />
                ) : null}
                <Row label="حملات التوصيل المجاني" value={sar(selected.summary.rdfCampaigns)} />
                <Row label="تعويضات العملاء" value={sar(selected.summary.compensation)} />
                <Row label="رسوم العروض السريعة" value={sar(selected.summary.jokerFees)} />
                <Row label="رسوم وقت الانتظار" value={sar(selected.summary.waitingTimeFees)} />
                {selected.summary.invoiceOnlyExtras ? (
                  <Row
                    label="بنود مأخوذة من الفاتورة"
                    value={sar(selected.summary.invoiceOnlyExtras)}
                  />
                ) : null}
                {selected.invoice?.cpc ? (
                  <Row label="فاتورة الإعلانات CPC (شامل الضريبة)" value={sar(selected.invoice.cpc)} />
                ) : null}
              </>
            )}
          </dl>
          </div>
        </Section>
      </section>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/50 pb-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="num font-semibold">{value}</dd>
    </div>
  );
}

const RECONCILIATION_SIGN = { start: "", less: "−", plus: "+", total: "=", residual: "−", info: "" } as const;

/** From the charges behind platform cost % to the platform's invoice, line by line, with anything left over named. */
function CostReconciliationSection({ period }: { period: StoredPeriod }) {
  const reconciliation = costReconciliation(period);
  if (!reconciliation) return null;
  const closes = Math.abs(reconciliation.residual) < 0.01;
  return (
    <Section title="من نسبة التكلفة إلى الفاتورة" summary={closes ? "لا فرق غير مفسّر" : `فرق ${sar(reconciliation.residual)}`} defaultOpen={false}>
      <div className="space-y-3 p-5">
        <table className="w-full border-collapse text-[13px]">
          <tbody>
            {reconciliation.lines.map((line) => (
              <tr
                key={line.label}
                className={cn(
                  "border-b border-border/50",
                  line.kind === "total" && "font-semibold",
                  line.kind === "residual" && "text-warning",
                  line.kind === "info" && "text-muted-foreground",
                )}
              >
                <td className="w-5 py-2 align-top">
                  <span className="num font-semibold">{RECONCILIATION_SIGN[line.kind]}</span>
                </td>
                <td className="py-2 pe-3">
                  {line.label}
                  {line.note ? <span className="mt-0.5 block text-[11.5px] font-normal text-muted-foreground">{line.note}</span> : null}
                </td>
                <td className="whitespace-nowrap py-2 text-end align-top">
                  <span className="num">{sar(line.amount)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {closes ? (
          <p className="flex items-center gap-1.5 text-[12.5px] text-success">
            <CheckCircle2 className="size-4" /> كل الفرق بين الرقمين مفسَّر ببنود محفوظة في التدقيق.
          </p>
        ) : null}
        <p className="text-[11.5px] leading-5 text-muted-foreground">{PLATFORM_COST_DEFINITION_AR}</p>
      </div>
    </Section>
  );
}

/** A balance as printed, with who owes whom in words. */
function BalanceRow({ label, value }: { label: string; value: number }) {
  const direction = balanceDirection(value);
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border/50 pb-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-end">
        <span className="num block font-semibold">{sar(value)}</span>
        <span className={cn("mt-0.5 block text-[11.5px] font-medium", direction === "platform_owes" ? "text-success" : direction === "restaurant_owes" ? "text-primary-text" : "text-muted-foreground")}>
          {BALANCE_DIRECTION_AR[direction]}
        </span>
      </dd>
    </div>
  );
}

const UNIT_LABELS = { orders: "طلب", sar_base: "أساس ر.س", count: "عدد" } as const;

/** Every summary row of the invoice as printed: what was counted, at what rate, for how much. */
function InvoiceLinesSection({ period }: { period: StoredPeriod }) {
  const lines = period.invoice?.lineDetails ?? [];
  const compensation = lines.find((line) => line.key === "customer_compensation");
  const recalculated = period.platform === "hungerstation" ? period.summary.compensation : undefined;
  const compensationDiff =
    compensation && typeof recalculated === "number" ? Math.round((recalculated - compensation.amount) * 100) / 100 : null;
  const flashDeals = lines.find((line) => line.key === "flash_deals");
  const flashRecalculated = period.platform === "hungerstation" ? period.summary.jokerFees : undefined;
  const flashDiff =
    flashDeals && typeof flashRecalculated === "number" ? Math.round((flashRecalculated - flashDeals.amount) * 100) / 100 : null;

  return (
    <Section title="سطور الفاتورة كما وردت" summary={lines.length + " سطر · الكمية والمعدل والمبلغ"} defaultOpen={false}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-[13px]">
          <thead className="bg-surface-raised text-[11.5px] text-muted-foreground">
            <tr>
              <th className="px-4 py-2.5 text-start font-semibold">السطر</th>
              <th className="px-4 py-2.5 text-right font-semibold">الكمية</th>
              <th className="px-4 py-2.5 text-right font-semibold">متوسط المعدل</th>
              <th className="px-4 py-2.5 text-right font-semibold">المبلغ (بدون الضريبة)</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line) => (
              <tr key={line.key} className="border-t border-border/70">
                <td className="px-4 py-2.5 font-medium">{line.label}</td>
                <td className="px-4 py-2.5 text-right">
                  {line.quantity === null ? (
                    "—"
                  ) : (
                    <span className="inline-flex items-baseline gap-1.5">
                      <span className="num">{line.unit === "sar_base" ? money(line.quantity) : line.quantity.toLocaleString("en-US")}</span>
                      {line.unit ? <span className="text-[11px] text-muted-foreground">{UNIT_LABELS[line.unit]}</span> : null}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  {line.avgRate === null ? (
                    "—"
                  ) : (
                    <span className="num">{line.rateKind === "percent" ? line.avgRate + "%" : money(line.avgRate)}</span>
                  )}
                </td>
                <td className="px-4 py-2.5 text-right">
                  <span className="num font-semibold">{money(line.amount)}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="space-y-1.5 border-t border-border/70 px-4 py-3 text-[12px] leading-6 text-muted-foreground">
        {compensation && compensationDiff !== null ? (
          <p>
            تعويضات العملاء: الفاتورة <span className="num">{money(compensation.amount)}</span> · المحتسب من ورقة Compensated Orders
            (شامل الضريبة ÷ 1.15) <span className="num">{money(recalculated ?? 0)}</span> · الفرق{" "}
            <span className="num">{compensationDiff.toFixed(2)}</span>
            {Math.abs(compensationDiff) <= 0.01 ? " (ضمن هامش التقريب)" : ""}
          </p>
        ) : null}
        {flashDeals && flashDiff !== null ? (
          <p>
            رسوم العروض السريعة: الفاتورة <span className="num">{money(flashDeals.amount)}</span> · المحتسب من عمود Flash Deals Fee في ملف
            الطلبات <span className="num">{money(flashRecalculated ?? 0)}</span> · الفرق <span className="num">{flashDiff.toFixed(2)}</span>
            {Math.abs(flashDiff) <= 0.01 ? " (ضمن هامش التقريب)" : ""}
          </p>
        ) : null}
      </div>
      <AllocationTable period={period} />
    </Section>
  );
}

/** Where each invoice-only charge sits and by which rule, adding up to the invoice-only total. */
function AllocationTable({ period }: { period: StoredPeriod }) {
  const allocation = invoiceOnlyAllocation(period);
  if (!allocation.rows.length) return null;
  return (
    <div className="border-t border-border/70">
      <p className="px-4 pt-3 text-[12.5px] font-semibold">توزيع بنود الفاتورة فقط على الفروع</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-[12.5px]">
          <thead className="text-[11.5px] text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-start font-semibold">الفرع</th>
              <th className="px-4 py-2 text-start font-semibold">البند</th>
              <th className="px-4 py-2 text-start font-semibold">قاعدة التوزيع</th>
              <th className="px-4 py-2 text-right font-semibold">المبلغ (بدون الضريبة)</th>
            </tr>
          </thead>
          <tbody>
            {allocation.rows.map((row, index) => (
              <tr key={(row.branch ?? "") + row.label + index} className="border-t border-border/70">
                <td className="px-4 py-2 font-medium">{row.branch ? displayBranchName(row.branch) : "غير موزّع"}</td>
                <td className="px-4 py-2">{row.label}</td>
                <td className="px-4 py-2 text-muted-foreground">{ALLOCATION_RULE_AR[row.rule]}</td>
                <td className="px-4 py-2 text-right">
                  <span className="num">{money(row.amount)}</span>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-[12px]">
            <tr className="border-t border-border">
              <td colSpan={3} className="px-4 py-2">
                على الفروع <span className="num">{money(allocation.allocated)}</span> + غير موزّع{" "}
                <span className="num">{money(allocation.unallocated)}</span>
              </td>
              <td className="px-4 py-2 text-right">
                <span className="num font-semibold">{money(allocation.total)}</span>
              </td>
            </tr>
            {allocation.invoiceTotal !== null ? (
              <tr>
                <td colSpan={4} className="px-4 pb-3 text-muted-foreground">
                  {Math.abs(allocation.residual ?? 0) < 0.01 ? (
                    <>يطابق إجمالي البنود المأخوذة من الفاتورة <span className="num">{money(allocation.invoiceTotal)}</span>.</>
                  ) : (
                    <>
                      إجمالي البنود المأخوذة من الفاتورة <span className="num">{money(allocation.invoiceTotal)}</span> · فرق غير موزّع{" "}
                      <span className="num">{money(allocation.residual ?? 0)}</span>
                    </>
                  )}
                </td>
              </tr>
            ) : null}
          </tfoot>
        </table>
      </div>
    </div>
  );
}

/** «Simple SOA of the Month»: kept apart from the commission total; the advertising invoice checked against the CPC invoice. */
function StatementSection({ period }: { period: StoredPeriod }) {
  const soa = period.invoice?.statementOfAccount;
  if (!soa) return null;
  const cpc = period.invoice?.cpc;
  const advertising = soa.advertisingServicesInvoice;
  const verified = typeof advertising === "number" && typeof cpc === "number" && Math.abs(advertising - cpc) < 0.01;
  // The balances (third item) also say who owes whom.
  const rows: Array<[string, number | undefined, boolean?]> = [
    ["الرصيد الافتتاحي (دفعة مقدمة + مستحق سابق)", soa.openingBalance, true],
    ["فاتورة العمولة (شامل الضريبة)", soa.commissionInvoice],
    ["فاتورة الخدمات الإعلانية (شامل الضريبة)", advertising],
    ["فاتورة أقساط القرض", soa.loanInstallmentInvoice],
    ["إجمالي المبيعات الإلكترونية", soa.totalOnlineSales],
    ["صافي الرصيد الشهري المستحق", soa.netMonthlyDueBalance, true],
  ];
  const formula = statementFormula(soa);
  return (
    <Section title="كشف حساب الشهر" summary="كما ورد في الفاتورة · منفصل عن إجمالي العمولة" defaultOpen={false}>
      <div className="space-y-3 p-5">
        <dl className="space-y-2 text-sm">
          {rows.map(([label, value, balance]) =>
            typeof value === "number" ? (
              balance ? (
                <BalanceRow key={label} label={label} value={value} />
              ) : (
                <Row key={label} label={label} value={sar(value)} />
              )
            ) : null,
          )}
        </dl>
        {formula ? (
          <div className="rounded-lg bg-muted/50 p-3.5">
            <h3 className="text-[12.5px] font-semibold">كيف يُحسب الرصيد الختامي</h3>
            <p className="mt-0.5 text-[11.5px] text-muted-foreground">الرصيد الافتتاحي + الفواتير − ما حصّلته المنصة = الرصيد الختامي</p>
            <dl className="mt-2.5 space-y-1.5 text-[12.5px]">
              {formula.terms.map((term) => (
                <div key={term.label} className="flex items-center justify-between gap-3">
                  <dt className="text-muted-foreground">
                    <span className="num me-1.5 inline-block w-3 text-center font-semibold text-foreground">{term.sign > 0 ? "+" : "−"}</span>
                    {term.label}
                  </dt>
                  <dd className="num">{sar(term.amount)}</dd>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 border-t border-border pt-1.5 font-semibold">
                <dt>
                  <span className="num me-1.5 inline-block w-3 text-center">=</span>
                  الرصيد الختامي المحسوب
                </dt>
                <dd className="num">{sar(formula.computed)}</dd>
              </div>
            </dl>
            {formula.matches ? (
              <p className="mt-2 flex items-center gap-1.5 text-[12px] text-success">
                <CheckCircle2 className="size-4" /> يطابق صافي الرصيد المطبوع في الكشف.
              </p>
            ) : (
              <p className="mt-2 flex items-center gap-1.5 text-[12px] text-warning">
                <AlertTriangle className="size-4" /> يختلف عن الرصيد المطبوع بمقدار <span className="num">{sar(formula.difference)}</span>: بند في الكشف لم يُقرأ من الفاتورة.
              </p>
            )}
          </div>
        ) : null}
        {typeof advertising === "number" ? (
          verified ? (
            <p className="flex items-center gap-1.5 text-[12.5px] text-success">
              <CheckCircle2 className="size-4" /> فاتورة الخدمات الإعلانية مطابقة لفاتورة CPC المرفوعة لهذه الفترة.
            </p>
          ) : (
            <p className="flex items-center gap-1.5 text-[12.5px] text-warning">
              <AlertTriangle className="size-4" /> لم يتم التحقق من فاتورة الخدمات الإعلانية: ارفع فاتورة CPC لهذه الفترة لمطابقتها.
            </p>
          )
        ) : null}
        <p className="text-[11.5px] leading-5 text-muted-foreground">
          إشارة الرصيد كما في كشف المنصة: الموجب مستحق على المطعم للمنصة، والسالب مستحق من المنصة للمطعم.
          فاتورة الخدمات الإعلانية لا تُضاف إلى إجمالي العمولة أو رسوم المنصة.
        </p>
      </div>
    </Section>
  );
}
