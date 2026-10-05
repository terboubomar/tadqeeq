import { createFileRoute } from "@tanstack/react-router";
import { productPageTitle } from "@/lib/products";
import { ProductName } from "@/components/ProductName";
import { AlertTriangle, CheckCircle2, FileSearch, FileText, MinusCircle, Scale } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/AppShell";
import { Callout, ChartCard, MetricCard, Segmented, SegmentBar } from "@/components/dash/DashKit";
import { arabicDate, money, percent, sar } from "@/lib/format";
import { useSelectedPeriod } from "@/lib/use-period";
import { cn } from "@/lib/utils";

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
  const [view, setView] = useState<"all" | "flagged">("all");
  const flaggedOnly = view === "flagged";

  if (isLoading) {
    return <p className="py-20 text-center text-sm text-muted-foreground">جارٍ التحميل…</p>;
  }
  if (!selected) {
    return <EmptyState title="لا توجد فترات محفوظة" body="ارفع ملفات الفترة لبدء المطابقة." />;
  }

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
  const underClaimed = totalDiff < -DEFAULT_TOLERANCE;

  return (
    <div className="space-y-5">
      <header>
        <h1 className="audit-heading"><ProductName product="mutabiq" /></h1>
        <p className="audit-subtitle">
          {selected.label} · {arabicDate(selected.period_start)} — {arabicDate(selected.period_end)}
        </p>
      </header>

      {!hasOfficialControl ? (
        <Callout tone="warning" icon={AlertTriangle} title="لم تُرفق فاتورة لهذه الفترة">
          {selected.platform === "keeta"
            ? "تمت مطابقة التسوية داخلياً مع Order Summary فقط. هذا الملف لا يحتوي Invoice Details ولم تُرفق فاتورة PDF."
            : selected.platform === "jahez"
              ? "تمت إعادة بناء صافي المطعم والفاتورة من CSV. أرفق فاتورة جاهز PDF لإضافة المطابقة الضريبية الرسمية."
              : "الأرقام أدناه محتسبة من بيانات الطلبات فقط. أعد رفع الفترة مع ملف الفاتورة (PDF) لإظهار الفروقات."}
        </Callout>
      ) : (
        <div className="grid gap-4 lg:grid-cols-12">
          <section
            className={cn(
              "rounded-[14px] border p-5 lg:col-span-5",
              overClaimed ? "border-ink bg-ink text-ink-foreground" : "border-success/25 bg-success/5",
            )}
          >
            <div className="flex items-center justify-between gap-3">
              <p className={cn("text-[12.5px]", overClaimed ? "text-ink-muted" : "text-muted-foreground")}>فرق المطالبة عن المحتسب</p>
              <span
                className={cn(
                  "grid size-8 place-items-center rounded-lg",
                  overClaimed ? "bg-ink-2 text-primary" : "bg-success-soft text-success",
                )}
              >
                {overClaimed ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}
              </span>
            </div>
            <p
              className={cn(
                "num mt-1 whitespace-nowrap text-[32px] font-semibold leading-10 tracking-[-0.02em]",
                overClaimed ? "text-primary" : underClaimed ? "text-success" : "text-foreground",
              )}
            >
              {money(totalDiff)} <span className="font-sans text-sm font-normal opacity-70">ر.س</span>
            </p>
            <p className={cn("mt-2 text-[12.5px] leading-6", overClaimed ? "text-ink-muted" : "text-foreground/75")}>
              {overClaimed
                ? "المنصة طالبت بمبلغ أعلى من المحتسب. راجع البنود المعلَّمة وافتح استثناءً لكل فرق."
                : underClaimed
                  ? "المطالبة أقل من المحتسب."
                  : "البنود القابلة للتحقق مستقلاً مطابقة ضمن هامش التسامح."}
            </p>
          </section>
          <div className="grid gap-4 sm:grid-cols-3 lg:col-span-7">
            <MetricCard
              label="بنود تحتاج مراجعة"
              value={String(flaggedCount)}
              hint={"من أصل " + checks.length + " بند مطابَق"}
              icon={FileSearch}
              tone={flaggedCount ? "negative" : "default"}
            />
            <MetricCard
              label="بنود لم تُقرأ من الفاتورة"
              value={String(missingCount)}
              hint="قيمة المقارنة الرسمية غير متاحة أو لم تُستخرج"
              icon={MinusCircle}
              tone="gold"
            />
            <MetricCard
              label={keetaExcelOnly ? "Invoice amount حسب Invoice Details" : "إجمالي الفاتورة شامل الضريبة"}
              value={keetaExcelOnly ? sar(selected.invoice?.keetaExcelInvoiceAmount ?? 0) : sar(selected.invoice?.totalIncVat ?? 0)}
              hint={
                keetaExcelOnly
                  ? "ضابط رسمي من ورقة Invoice Details داخل ملف كيتا"
                  : selected.invoice?.invoiceNo
                    ? "فاتورة رقم " + selected.invoice.invoiceNo
                    : "حسب ملف PDF"
              }
              icon={FileText}
            />
          </div>
        </div>
      )}

      {checks.length ? (
        <ChartCard title="حالة البنود" action={<span className="text-[11.5px] text-muted-foreground">{checks.length} بند</span>}>
          <SegmentBar
            segments={[
              { key: "ok", label: "مطابق", value: matchedCount, display: String(matchedCount), color: "var(--color-success)" },
              { key: "flag", label: "يحتاج مراجعة", value: flaggedPresent, display: String(flaggedPresent), color: "var(--color-destructive)" },
              { key: "missing", label: "لم يُقرأ", value: missingCount, display: String(missingCount), color: "var(--color-ink-muted)" },
              { key: "inv", label: "من الفاتورة فقط", value: invoiceOnlyCount, display: String(invoiceOnlyCount), color: "var(--color-primary)" },
            ]}
          />
        </ChartCard>
      ) : null}

      <ChartCard
        title="دفتر المطابقة"
        bodyClassName="p-0"
        action={
          <Segmented
            value={view}
            onChange={setView}
            options={[
              { value: "all", label: "كل البنود" },
              { value: "flagged", label: `غير المطابقة (${flaggedCount})` },
            ]}
          />
        }
      >
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
      </ChartCard>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartCard title={keetaExcelOnly ? "الضوابط الرسمية كما وردت في Excel" : "بنود الفاتورة كما وردت"}>
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
        </ChartCard>

        <ChartCard title="أساس الاحتساب" action={<Scale className="size-4 text-muted-foreground" />}>
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
        </ChartCard>
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
