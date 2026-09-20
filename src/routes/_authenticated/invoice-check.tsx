import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, MinusCircle } from "lucide-react";
import { useState } from "react";

import { EmptyState } from "@/components/AppShell";
import { StatCard } from "@/components/StatCard";
import { arabicDate, money, percent, sar } from "@/lib/format";
import { useSelectedPeriod } from "@/lib/use-period";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/invoice-check")({
  head: () => ({
    meta: [
      { title: "مطابقة الفاتورة · تدقيق" },
      {
        name: "description",
        content: "قارن كل بند محتسب من بيانات الطلبات بالمبلغ الذي طالبت به المنصة.",
      },
      { property: "og:title", content: "مطابقة الفاتورة · تدقيق" },
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

  const [flaggedOnly, setFlaggedOnly] = useState(false);
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
      (check.evidence === "data" || check.evidence === "contract" || !check.evidence),
  );
  const totalDiff = independentlyComparable.reduce((sum, check) => {
    const diff = check.invoiced - check.computed;
    const tolerance = check.tolerance ?? DEFAULT_TOLERANCE;
    return sum + (Math.abs(diff) <= tolerance ? 0 : diff);
  }, 0);
  const flaggedCount = checks.filter((check) => {
    if (check.evidence === "invoice_only" || check.evidence === "invoice_derived" || check.evidence === "mixed") {
      return false;
    }
    return Math.abs(check.invoiced - check.computed) > (check.tolerance ?? DEFAULT_TOLERANCE);
  }).length;
  const missingCount = checks.filter(
    (check) => check.invoiced === 0 && check.evidence !== "invoice_only",
  ).length;
  const visibleChecks = flaggedOnly
    ? checks.filter((check) => {
        if (check.evidence === "invoice_only" || check.evidence === "invoice_derived" || check.evidence === "mixed") {
          return false;
        }
        return Math.abs(check.invoiced - check.computed) > (check.tolerance ?? DEFAULT_TOLERANCE);
      })
    : checks;

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="audit-heading">مطابقة الفاتورة</h1>
          <p className="audit-subtitle">
            {selected.label} · {arabicDate(selected.period_start)} — {arabicDate(selected.period_end)}
          </p>
        </div>
        <label data-noprint className="flex cursor-pointer items-center gap-2 text-[12.5px] text-foreground/80">
          <input
            type="checkbox"
            checked={flaggedOnly}
            onChange={(event) => setFlaggedOnly(event.target.checked)}
            className="size-[15px] accent-primary"
          />
          البنود غير المطابقة فقط
        </label>
      </header>

      {!hasOfficialControl ? (
        <div className="panel flex items-start gap-3 border-warning/40 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
          <div>
            <p className="font-semibold">لم تُرفق فاتورة لهذه الفترة</p>
            <p className="mt-1 text-sm text-muted-foreground">
              {selected.platform === "keeta"
                ? "تمت مطابقة التسوية داخلياً مع Order Summary فقط. هذا الملف لا يحتوي Invoice Details ولم تُرفق فاتورة PDF."
                : selected.platform === "jahez"
                  ? "تمت إعادة بناء صافي المطعم والفاتورة من CSV. أرفق فاتورة جاهز PDF لإضافة المطابقة الضريبية الرسمية."
                  : "الأرقام أدناه محتسبة من بيانات الطلبات فقط. أعد رفع الفترة مع ملف الفاتورة (PDF) لإظهار الفروقات."}
            </p>
          </div>
        </div>
      ) : (
        <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div
            className={cn(
              "rounded-[10px] border p-4",
              Math.abs(totalDiff) > DEFAULT_TOLERANCE
                ? "border-destructive/25 bg-destructive/[0.035]"
                : "border-success/25 bg-success/[0.035]",
            )}
          >
            <p className="text-xs font-semibold text-foreground/80">فرق المطالبة عن المحتسب</p>
            <p
              className={cn(
                "num mt-2 text-[30px] font-semibold tracking-[-0.02em]",
                totalDiff > DEFAULT_TOLERANCE
                  ? "text-destructive"
                  : totalDiff < -DEFAULT_TOLERANCE
                    ? "text-success"
                    : "text-foreground",
              )}
            >
              {money(totalDiff)} <span className="font-sans text-sm font-normal text-muted-foreground">ر.س</span>
            </p>
            <p className="mt-2 text-[12.5px] leading-6 text-foreground/75">
              {totalDiff > DEFAULT_TOLERANCE
                ? "المنصة طالبت بمبلغ أعلى من المحتسب. راجع البنود المعلَّمة."
                : totalDiff < -DEFAULT_TOLERANCE
                  ? "المطالبة أقل من المحتسب."
                  : "البنود القابلة للتحقق مستقلاً مطابقة ضمن هامش التسامح."}
            </p>
          </div>
          <StatCard
            label="بنود تحتاج مراجعة"
            value={String(flaggedCount)}
            hint={"من أصل " + checks.length + " بند مطابَق"}
            tone={flaggedCount ? "negative" : "default"}
          />
          <StatCard
            label="بنود بلا مقابل في الفاتورة"
            value={String(missingCount)}
            hint="محتسبة من البيانات ولم تُطالب بها المنصة"
            tone="gold"
          />
          <StatCard
            label={
              selected.platform === "keeta" && !hasPdfInvoice && hasKeetaExcelControl
                ? "Invoice amount حسب Invoice Details"
                : "إجمالي الفاتورة شامل الضريبة"
            }
            value={
              selected.platform === "keeta" && !hasPdfInvoice && hasKeetaExcelControl
                ? sar(selected.invoice?.keetaExcelInvoiceAmount ?? 0)
                : sar(selected.invoice?.totalIncVat ?? 0)
            }
            hint={
              selected.platform === "keeta" && !hasPdfInvoice && hasKeetaExcelControl
                ? "ضابط رسمي من ورقة Invoice Details داخل ملف كيتا"
                : selected.invoice?.invoiceNo
                  ? "فاتورة رقم " + selected.invoice.invoiceNo
                  : "حسب ملف PDF"
            }
          />
        </section>
      )}

      <section className="overflow-hidden rounded-[10px] border border-border bg-white">
        <div className="flex items-center justify-between gap-3 border-b border-border/80 px-4 py-3">
          <h2 className="text-sm font-semibold">دفتر المطابقة</h2>
          <span className="text-[11.5px] text-muted-foreground">
            الحدود تختلف حسب نوع البند ومصدر الدليل
          </span>
        </div>
        <div data-scroll className="overflow-x-auto">
        <table className="w-full min-w-[780px] text-[13.5px]">
          <thead className="bg-surface-raised">
            <tr>
              <th className="border-b border-border px-3.5 py-2.5 text-start text-[11.5px] font-semibold text-muted-foreground">
                البند
              </th>
              <th className="border-b border-border px-3.5 py-2.5 text-start text-[11.5px] font-semibold text-muted-foreground">
                المحتسب من البيانات
              </th>
              <th className="border-b border-border px-3.5 py-2.5 text-start text-[11.5px] font-semibold text-muted-foreground">
                قيمة المنصة / المستند الرسمي
              </th>
              <th className="border-b border-border px-3.5 py-2.5 text-start text-[11.5px] font-semibold text-muted-foreground">
                الفرق
              </th>
              <th className="border-b border-border px-3.5 py-2.5 text-start text-[11.5px] font-semibold text-muted-foreground">
                الحالة
              </th>
            </tr>
          </thead>
          <tbody>
            {visibleChecks.map((check, index) => {
              const evidence = check.evidence ?? "data";
              const invoiceOnly = evidence === "invoice_only";
              const invoiceDerived = evidence === "invoice_derived";
              const mixed = evidence === "mixed";
              const diff = check.invoiced - check.computed;
              const tolerance = check.tolerance ?? DEFAULT_TOLERANCE;
              const roundingMatch =
                check.label === "رسوم الدفع الإلكتروني" &&
                Math.abs(diff) > 0.005 &&
                Math.abs(diff) <= tolerance;
              const missing = check.invoiced === 0 && !invoiceOnly;
              const over = diff > tolerance;
              const under = diff < -tolerance;
              return (
                <tr
                  key={check.label}
                  className={cn(
                    "align-top",
                    index % 2 ? "bg-background/55" : "bg-white",
                    over && "bg-destructive/[0.025]",
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
                    <span className="num">{missing ? "—" : money(check.invoiced)}</span>
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
                        {money(diff)}
                      </span>
                    )}
                  </td>
                  <td className="whitespace-nowrap border-b border-border/60 px-3.5 py-2.5">
                    {invoiceOnly ? (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                        <AlertTriangle className="size-4" /> فاتورة فقط — يحتاج تحقق
                      </span>
                    ) : invoiceDerived ? (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                        <AlertTriangle className="size-4" /> نسبة مستنتجة من الفاتورة
                      </span>
                    ) : mixed ? (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                        <AlertTriangle className="size-4" /> تسوية تشمل بنوداً غير مستقلة
                      </span>
                    ) : missing ? (
                      <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <MinusCircle className="size-4" /> غير متاح
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
                    ) : (
                      <span className="flex items-center gap-1.5 text-xs font-semibold text-success">
                        <CheckCircle2 className="size-4" /> مطابق
                      </span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2">
        <div className="panel p-4">
          <h2 className="text-sm font-semibold">
            {selected.platform === "keeta" && !hasPdfInvoice && hasKeetaExcelControl
              ? "الضوابط الرسمية كما وردت في Excel"
              : "بنود الفاتورة كما وردت"}
          </h2>
          {selected.invoice?.lines?.length ? (
            <ul className="mt-3 space-y-2 text-sm">
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
            <p className="mt-3 text-sm text-muted-foreground">لم تُقرأ أي بنود أو ضوابط رسمية إضافية.</p>
          )}
        </div>

        <div className="panel p-4">
          <h2 className="text-sm font-semibold">أساس الاحتساب</h2>
          <dl className="mt-3 space-y-2 text-sm">
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
                selected.summary.bankRate > 0 ? percent(selected.summary.bankRate) : "غير محددة"
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
          </dl>
        </div>
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
