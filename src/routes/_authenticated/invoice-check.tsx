import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, CheckCircle2, MinusCircle } from "lucide-react";

import { EmptyState } from "@/components/AppShell";
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

  const checks = selected.invoice?.checks ?? [];
  const hasInvoice = checks.some((check) => check.invoiced !== 0);
  // Headline variance should only sum top-level commission-invoice charge categories.
  // Sales, collections and wallet detail checks are diagnostics and would otherwise double-count.
  const headlineLabels = new Set([
    "عمولة المبيعات",
    "رسوم الدفع الإلكتروني",
    "عمولات أخرى القابلة للتحقق من البيانات",
  ]);
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

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-black">مطابقة الفاتورة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {selected.label} · {arabicDate(selected.period_start)} —{" "}
          {arabicDate(selected.period_end)}
        </p>
      </header>

      {!hasInvoice ? (
        <div className="panel flex items-start gap-3 border-warning/40 p-5">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-warning" />
          <div>
            <p className="font-bold">لم تُرفق فاتورة لهذه الفترة</p>
            <p className="mt-1 text-sm text-muted-foreground">
              الأرقام أدناه محتسبة من بيانات الطلبات فقط. أعد رفع الفترة مع ملف الفاتورة (PDF)
              لإظهار الفروقات.
            </p>
          </div>
        </div>
      ) : (
        <div
          className={cn(
            "panel p-5",
            Math.abs(totalDiff) > DEFAULT_TOLERANCE
              ? "border-destructive/50"
              : "border-success/50",
          )}
        >
          <p className="text-sm text-muted-foreground">
            فرق رسوم الفاتورة القابلة للتحقق بشكل مستقل
          </p>
          <p
            className={cn(
              "mt-2 text-3xl font-black",
              totalDiff > DEFAULT_TOLERANCE
                ? "text-destructive"
                : totalDiff < -DEFAULT_TOLERANCE
                  ? "text-success"
                  : "text-foreground",
            )}
          >
            <span className="num">{money(totalDiff)}</span> ر.س
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {totalDiff > DEFAULT_TOLERANCE
              ? "المنصة طالبت بمبلغ أعلى من المحتسب — راجع البنود المعلَّمة بالأحمر."
              : totalDiff < -DEFAULT_TOLERANCE
                ? "المطالبة أقل من المحتسب."
                : "البنود القابلة للتحقق مستقلاً مطابقة ضمن هامش التسامح."}
          </p>
        </div>
      )}

      <section className="panel overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-surface-raised">
            <tr>
              <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground">
                البند
              </th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground">
                المحتسب من البيانات
              </th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground">
                المطالب به بالفاتورة
              </th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground">
                الفرق
              </th>
              <th className="px-4 py-3 text-start text-xs font-semibold text-muted-foreground">
                الحالة
              </th>
            </tr>
          </thead>
          <tbody>
            {checks.map((check) => {
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
                <tr key={check.label} className="border-t border-border/60 align-top">
                  <td className="px-4 py-3">
                    <p className="font-semibold">{check.label}</p>
                    {check.hint ? (
                      <p className="mt-1 max-w-sm text-xs leading-6 text-muted-foreground">
                        {check.hint}
                      </p>
                    ) : null}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="num">{invoiceOnly ? "—" : money(check.computed)}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <span className="num">{missing ? "—" : money(check.invoiced)}</span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
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
                  <td className="whitespace-nowrap px-4 py-3">
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
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="panel p-5">
          <h2 className="text-base font-bold">بنود الفاتورة كما وردت</h2>
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
            <p className="mt-3 text-sm text-muted-foreground">لم تُقرأ أي بنود من ملف الفاتورة.</p>
          )}
        </div>

        <div className="panel p-5">
          <h2 className="text-base font-bold">أساس الاحتساب</h2>
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
