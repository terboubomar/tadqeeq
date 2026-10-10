import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { AlertTriangle, ArrowLeft, ChevronLeft, ChevronRight, Loader2, RefreshCw, Search, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { count, percent, sar } from "@/lib/format";
import { operationPlatformLabel as platformLabel, operationSourceLabels } from "@/lib/operations/catalog";
import { operationCostRatio } from "@/lib/operations/details";
import { getOperationImportDetail } from "@/lib/operations/operations.functions";
import type {
  OperationBranchSummary,
  OperationImportHistoryItem,
  OperationOrderDetail,
  OperationOrderFilter,
  OperationPlatform,
} from "@/lib/operations/types";
import { formatArabicDate } from "@/lib/site-content";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

export function HistoryRow({
  item,
  active,
  canDelete,
  onOpen,
  onDelete,
}: {
  item: OperationImportHistoryItem;
  active: boolean;
  canDelete: boolean;
  onOpen: (importId: string) => void;
  onDelete: (item: OperationImportHistoryItem) => void;
}) {
  return (
    <div className={cn("flex items-center gap-2 rounded-lg border border-border px-3 py-2", active && "border-primary/50 bg-primary/5")}>
      <button type="button" onClick={() => onOpen(item.id)} className="min-w-0 flex-1 text-start">
        <span className="block truncate text-[12.5px] font-medium">{item.originalName}</span>
        <span className="mt-0.5 block truncate text-[10.5px] text-muted-foreground">
          {operationSourceLabels[item.sourceKind]} ·{" "}
          {item.sourceKind === "jahez_adjustments"
            ? `${count(item.rowCount)} حركة`
            : `${count(item.summary.orderCount)} طلب · ${sar(item.summary.grossSales)}`}
        </span>
      </button>
      <Button variant="outline" size="sm" onClick={() => onOpen(item.id)}>
        فتح <ArrowLeft className="size-3.5" />
      </Button>
      {canDelete ? (
        <Button variant="ghost" size="icon-sm" aria-label={`حذف ${item.originalName}`} onClick={() => onDelete(item)}>
          <Trash2 className="size-3.5 text-destructive" />
        </Button>
      ) : null}
    </div>
  );
}

const FILTERS: Array<{ id: OperationOrderFilter; label: string }> = [
  { id: "all", label: "الكل" },
  { id: "cancelled", label: "ملغاة" },
  { id: "complaints", label: "شكاوى" },
  { id: "refunds", label: "استردادات" },
];

export function OrderLedger({
  importId,
  selected,
  platform,
}: {
  importId: string;
  selected: OperationImportHistoryItem | null;
  platform: OperationPlatform;
}) {
  const [page, setPage] = useState(1);
  const [searchText, setSearchText] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<OperationOrderFilter>("all");
  const [branchKey, setBranchKey] = useState("");
  const branches: OperationBranchSummary[] = selected?.summary.branches ?? [];
  const branch = branches.find((item) => item.key === branchKey);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setSearch(searchText.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [searchText]);

  const query = useQuery({
    queryKey: ["operation-import-detail", importId, platform, page, search, filter, branchKey],
    queryFn: () =>
      getOperationImportDetail({
        data: {
          importId,
          platform,
          page,
          pageSize: PAGE_SIZE,
          ...(search ? { search } : {}),
          ...(filter !== "all" ? { filter } : {}),
          ...(branch?.branchId ? { branchId: branch.branchId } : branch?.branchName ? { branchName: branch.branchName } : {}),
        },
      }),
    placeholderData: keepPreviousData,
  });
  const detail = query.data;
  const totalPages = Math.max(1, Math.ceil((detail?.totalRows ?? 0) / PAGE_SIZE));
  const isAdjustments = selected?.sourceKind === "jahez_adjustments";
  const narrowed = Boolean(search || filter !== "all" || branchKey);

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <h2 className="truncate font-display text-[15px] font-bold">
            {selected ? `${isAdjustments ? "حركات" : "طلبات"} ${formatArabicDate(selected.businessDate)}` : "تفاصيل الملف"}
          </h2>
          <p className="mt-0.5 truncate text-[11.5px] text-muted-foreground">
            {selected ? `${selected.originalName} · ${operationSourceLabels[selected.sourceKind]}${selected.current ? "" : " · مستبدل"}` : ""}
          </p>
        </div>
        {query.isFetching ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
      </div>

      {!isAdjustments ? (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-4 py-3 sm:px-5">
          <label className="relative min-w-0 flex-1 basis-56">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              placeholder="ابحث برقم الطلب أو اسم الفرع"
              aria-label="بحث في الطلبات"
              className="h-9 ps-9"
            />
          </label>
          {branches.length > 1 ? (
            <select
              value={branchKey}
              onChange={(event) => {
                setBranchKey(event.target.value);
                setPage(1);
              }}
              aria-label="الفرع"
              className="h-9 max-w-56 rounded-md border border-input bg-background px-2 text-[12.5px]"
            >
              <option value="">كل الفروع</option>
              {branches.map((item) => (
                <option key={item.key} value={item.key}>
                  {item.branchName ?? item.branchId}
                </option>
              ))}
            </select>
          ) : null}
          <div role="group" aria-label="تصفية الطلبات" className="flex gap-1 rounded-lg bg-muted/60 p-1">
            {FILTERS.map((item) => (
              <button
                key={item.id}
                type="button"
                aria-pressed={filter === item.id}
                onClick={() => {
                  setFilter(item.id);
                  setPage(1);
                }}
                className={cn(
                  "h-7 rounded-md px-2.5 text-[12px] font-medium transition-colors",
                  filter === item.id ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {query.isError ? <ErrorNotice error={query.error} retry={() => void query.refetch()} /> : null}

      {detail?.totals && detail.totalRows > 0 ? (
        <div className="grid grid-cols-2 gap-3 border-b border-border bg-muted/30 px-5 py-3 text-[11.5px] sm:grid-cols-4">
          <TotalCell label={narrowed ? "الطلبات المطابقة" : "طلبات اليوم"} value={count(detail.totalRows)} />
          <TotalCell label="المبيعات" value={sar(detail.totals.grossSales)} />
          <TotalCell
            label="تكلفة المنصة"
            value={sar(detail.totals.chargesTotal)}
            note={percent(operationCostRatio(detail.totals.chargesTotal, detail.totals.grossSales))}
          />
          <TotalCell label="صافي التحويل" value={sar(detail.totals.settlementAmount)} />
        </div>
      ) : null}

      {detail?.orders.length ? <OrdersTable rows={detail.orders} platform={platform} /> : null}
      {detail?.adjustments.length ? <AdjustmentsTable rows={detail.adjustments} /> : null}
      {!query.isLoading && detail && detail.totalRows === 0 ? (
        <div className="px-5 py-10 text-center text-[12.5px] text-muted-foreground">
          {narrowed ? "لا توجد طلبات تطابق البحث أو التصفية." : "لا توجد صفوف مرتبطة بهذا الملف؛ استُبدل بملف أحدث لليوم نفسه."}
        </div>
      ) : null}
      {query.isLoading ? (
        <div className="grid min-h-48 place-items-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : null}
      {detail && detail.totalRows > PAGE_SIZE ? (
        <div className="flex items-center justify-between border-t border-border px-4 py-3">
          <p className="text-[11.5px] text-muted-foreground">
            صفحة {count(page)} من {count(totalPages)} · {count(detail.totalRows)} صف
          </p>
          <div className="flex gap-1.5">
            <Button variant="outline" size="icon-sm" aria-label="الصفحة السابقة" disabled={page <= 1 || query.isFetching} onClick={() => setPage(page - 1)}>
              <ChevronRight />
            </Button>
            <Button variant="outline" size="icon-sm" aria-label="الصفحة التالية" disabled={page >= totalPages || query.isFetching} onClick={() => setPage(page + 1)}>
              <ChevronLeft />
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function TotalCell({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="min-w-0">
      <p className="text-muted-foreground">{label}</p>
      <p className="mt-0.5 flex min-w-0 items-baseline gap-1.5">
        <span className="num truncate font-semibold">{value}</span>
        {note ? <span className="num shrink-0 text-muted-foreground">{note}</span> : null}
      </p>
    </div>
  );
}

function OrdersTable({ rows, platform }: { rows: OperationOrderDetail[]; platform: OperationPlatform }) {
  const columns = orderMoneyColumns(platform);
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full min-w-[1500px] border-collapse text-start text-[11.5px]">
          <thead className="bg-muted/55 text-muted-foreground">
            <tr>
              {["رقم الطلب", "التاريخ", "الفرع", "الحالة", ...columns.map((column) => column.label)].map((label) => (
                <th key={label} className="whitespace-nowrap border-b border-border px-3 py-2.5 text-start font-medium">
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={row.orderId} className="hover:bg-muted/25">
                <td className="whitespace-nowrap px-3 py-3 font-medium"><span className="num">{row.orderId}</span></td>
                <td className="whitespace-nowrap px-3 py-3 text-muted-foreground"><span className="num">{row.businessDate}</span></td>
                <td className="max-w-44 truncate px-3 py-3" title={row.branchName ?? row.branchId ?? undefined}>
                  {row.branchName ?? row.branchId ?? "—"}
                </td>
                <td className="max-w-36 truncate px-3 py-3 text-muted-foreground" title={row.status ?? undefined}>
                  {row.status ?? "—"}
                </td>
                {columns.map((column) => (
                  <MoneyCell
                    key={column.key}
                    value={row[column.key]}
                    strong={column.strong}
                    warning={column.key === "refundAmount" && (row.refundAmount !== 0 || row.complaint)}
                  />
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-y divide-border md:hidden">
        {rows.map((row) => (
          <OrderCard key={row.orderId} row={row} />
        ))}
      </ul>
      <p className="border-t border-border px-4 py-2.5 text-[10.5px] text-muted-foreground">
        القيم مأخوذة من صفوف ملف {platformLabel(platform)} المحفوظة؛ صفر يعني أن الحقل غير موجود أو بلا قيمة في المصدر.
      </p>
    </>
  );
}

/** Phone view of one order: the figures that matter, the rest one tap away. */
function OrderCard({ row }: { row: OperationOrderDetail }) {
  const cancelled = /cancel/i.test(row.status ?? "");
  const details: Array<[string, number]> = [
    ["العمولة", row.commissionAmount],
    ["رسوم الدفع", row.paymentFeeAmount],
    ["خصم ممول منك", row.merchantFundedDiscountAmount],
    ["قسيمة ممولة منك", row.merchantFundedVoucherAmount],
    ["رسوم أخرى", row.otherFeeAmount],
    ["التوصيل", row.deliveryAmount],
    ["الاسترداد", row.refundAmount],
  ];
  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="num truncate text-[13px] font-semibold">{row.orderId}</p>
          <p className="truncate text-[11px] text-muted-foreground">{row.branchName ?? row.branchId ?? "—"}</p>
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[10.5px]",
            cancelled ? "bg-destructive-soft text-destructive" : row.complaint ? "bg-warning/15" : "bg-muted text-muted-foreground",
          )}
        >
          {row.status ?? "—"}
          {row.complaint ? " · شكوى" : ""}
        </span>
      </div>
      <dl className="mt-2 grid grid-cols-3 gap-2 text-[11px]">
        <div>
          <dt className="text-muted-foreground">المبيعات</dt>
          <dd className="num font-semibold">{sar(row.grossSales)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">التكلفة</dt>
          <dd className="num">{sar(row.chargesTotal)}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">التحويل</dt>
          <dd className="num font-semibold">{sar(row.settlementAmount)}</dd>
        </div>
      </dl>
      <details className="mt-1.5">
        <summary className="cursor-pointer text-[11px] text-primary-text">التفاصيل</summary>
        <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          {details
            .filter(([, value]) => value !== 0)
            .map(([label, value]) => (
              <div key={label} className="flex justify-between gap-2">
                <dt className="text-muted-foreground">{label}</dt>
                <dd className="num">{sar(value)}</dd>
              </div>
            ))}
        </dl>
        {row.complaintReason ? <p className="mt-1 text-[11px] text-muted-foreground">السبب: {row.complaintReason}</p> : null}
      </details>
    </li>
  );
}

type MoneyKey = {
  [Key in keyof OperationOrderDetail]: OperationOrderDetail[Key] extends number ? Key : never;
}[keyof OperationOrderDetail];

function orderMoneyColumns(platform: OperationPlatform): Array<{ key: MoneyKey; label: string; strong?: boolean }> {
  const ending: Array<{ key: MoneyKey; label: string; strong?: boolean }> = [
    { key: "refundAmount", label: "الاسترداد" },
    { key: "chargesTotal", label: "إجمالي التكلفة", strong: true },
    { key: "estimatedEarningsAmount", label: "الأرباح المقدرة" },
    { key: "settlementAmount", label: "التحويل", strong: true },
  ];
  if (platform === "hungerstation")
    return [
      { key: "subtotalAmount", label: "Subtotal" },
      { key: "packagingAmount", label: "التغليف" },
      { key: "grossSales", label: "المبيعات", strong: true },
      { key: "deliveryAmount", label: "توصيل ممول منك" },
      { key: "merchantFundedDiscountAmount", label: "خصم ممول منك" },
      { key: "merchantFundedVoucherAmount", label: "قسيمة ممولة منك" },
      { key: "commissionAmount", label: "العمولة" },
      { key: "paymentFeeAmount", label: "رسوم الدفع" },
      { key: "otherFeeAmount", label: "رسوم أخرى" },
      ...ending,
    ];
  if (platform === "keeta")
    return [
      { key: "subtotalAmount", label: "المبيعات الأصلية" },
      { key: "grossSales", label: "المبيعات", strong: true },
      { key: "deliveryAmount", label: "رسوم التوصيل" },
      { key: "merchantFundedDiscountAmount", label: "Promotion expense" },
      { key: "commissionAmount", label: "العمولة" },
      { key: "paymentFeeAmount", label: "رسوم الدفع" },
      { key: "otherFeeAmount", label: "Other expenses" },
      ...ending,
    ];
  return [
    { key: "subtotalAmount", label: "قيمة الطلب" },
    { key: "grossSales", label: "المبيعات", strong: true },
    { key: "deliveryAmount", label: "صافي التوصيل" },
    { key: "merchantFundedDiscountAmount", label: "عرض المطعم" },
    { key: "merchantFundedVoucherAmount", label: "قسيمة التوصيل" },
    { key: "commissionAmount", label: "العمولة" },
    { key: "paymentFeeAmount", label: "رسوم الدفع" },
    ...ending,
  ];
}

function AdjustmentsTable({
  rows,
}: {
  rows: NonNullable<Awaited<ReturnType<typeof getOperationImportDetail>>["adjustments"]>;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[850px] border-collapse text-start text-[11.5px]">
        <thead className="bg-muted/55 text-muted-foreground">
          <tr>
            {["رقم الطلب", "التاريخ", "الفرع", "نوع الحركة", "السبب", "المبلغ", "التعليق"].map((label) => (
              <th key={label} className="border-b border-border px-3 py-2.5 text-start font-medium">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {rows.map((row) => (
            <tr key={row.fingerprint} className="hover:bg-muted/25">
              <td className="px-3 py-3 font-medium"><span className="num">{row.orderId}</span></td>
              <td className="px-3 py-3"><span className="num">{row.businessDate}</span></td>
              <td className="px-3 py-3">{row.branchName ?? "—"}</td>
              <td className="px-3 py-3">{row.transactionType === "debit" ? "خصم" : "إضافة"}</td>
              <td className="px-3 py-3">{row.reason ?? "—"}</td>
              <MoneyCell value={row.amount} warning={row.transactionType === "debit"} />
              <td className="px-3 py-3 text-muted-foreground">{row.comment ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MoneyCell({ value, strong, warning }: { value: number; strong?: boolean; warning?: boolean }) {
  return (
    <td className={cn("whitespace-nowrap px-3 py-3", strong && "font-semibold", warning && "text-destructive")}>
      <span className="num">{sar(value)}</span>
    </td>
  );
}

export function ErrorNotice({ error, retry }: { error: unknown; retry: () => void }) {
  return (
    <div className="flex items-start gap-3 border-b border-destructive/20 bg-destructive-soft p-4 text-sm text-destructive">
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="flex-1">{error instanceof Error ? error.message : "تعذّر تحميل البيانات."}</div>
      <Button variant="outline" size="sm" onClick={retry}>
        <RefreshCw className="size-3.5" />
        إعادة المحاولة
      </Button>
    </div>
  );
}
