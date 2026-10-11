import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, FileSpreadsheet, RotateCcw, Loader2, Search, Upload, X } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

const STORE_KEY = "tadqeeq-compensation-scan-v1";
import * as XLSX from "xlsx";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { searchCompensationEvidence } from "@/lib/compensation-evidence.functions";
import type { CompensationEvidenceRecord } from "@/lib/compensation-evidence.server";
import { sar } from "@/lib/format";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const marks = () => (supabase as any).from("compensation_appeal_marks");

export interface CompensatedOrder {
  key: string;
  orderNumber: string;
  branch: string;
  amount: number;
  reason: string;
  source: string;
}

const ORDER_RE = /order.?(id|no|number|code|#)|^order$|رقم.?الطلب|^الطلب$|order_id/i;
const COMP_RE = /compensat|refund|reimburs|تعويض|استرداد|مسترد/i;
const BRANCH_RE = /branch|vendor|store|restaurant|outlet|الفرع|المطعم|المتجر/i;
const AMOUNT_RE = /amount|value|total|المبلغ|القيمة/i;
const ORDER_VALUE_RE = /^subtotal$|order.?(value|total)|قيمة.?الطلب|المجموع.?الفرعي/i;
const COMPLAINT_FLAG_RE = /has.?complaint|complaint\?|يوجد.?شكوى/i;
const COMPLAINT_REASON_RE = /complaint.?reason|سبب.?الشكوى/i;
const TEXT_RE = /type|reason|description|category|note|remark|السبب|النوع|الوصف/i;

function toNumber(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return 0;
  const n = Number(value.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function cleanOrder(value: unknown): string {
  return String(value ?? "").trim().replace(/\.0+$/, "");
}

export function extractCompensatedOrders(buffer: ArrayBuffer, fileName: string): CompensatedOrder[] {
  const workbook = XLSX.read(buffer, { type: "array" });
  const found = new Map<string, CompensatedOrder>();

  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName]!, {
      header: 1,
      defval: "",
      raw: true,
    });
    const headerIndex = rows
      .slice(0, 20)
      .findIndex((row) => row.some((cell) => ORDER_RE.test(String(cell).trim())));
    if (headerIndex < 0) continue;
    const header = rows[headerIndex]!.map((cell) => String(cell).trim());
    const orderCol = header.findIndex((h) => ORDER_RE.test(h));
    const compCols = header.flatMap((h, i) => (COMP_RE.test(h) ? [i] : []));
    const flagCol = header.findIndex((h) => COMPLAINT_FLAG_RE.test(h));
    const complaintReasonCol = header.findIndex((h) => COMPLAINT_REASON_RE.test(h));
    const textCols = header.flatMap((h, i) =>
      TEXT_RE.test(h) && i !== complaintReasonCol ? [i] : [],
    );
    const amountCol = header.findIndex((h) => AMOUNT_RE.test(h) && !COMP_RE.test(h));
    const orderValueCol = header.findIndex((h) => ORDER_VALUE_RE.test(h));
    const branchCol = header.findIndex((h) => BRANCH_RE.test(h) && !ORDER_RE.test(h));
    const sheetIsComp = COMP_RE.test(sheetName);

    for (const row of rows.slice(headerIndex + 1)) {
      const orderNumber = cleanOrder(row[orderCol]);
      if (!orderNumber || orderNumber.length < 3) continue;

      let amount = 0;
      const reasons: string[] = [];
      for (const col of compCols) {
        const value = toNumber(row[col]);
        if (value !== 0) {
          amount += Math.abs(value);
          reasons.push(header[col]!);
        }
      }
      const textHit = textCols
        .map((col) => String(row[col] ?? "").trim())
        .find((text) => COMP_RE.test(text));
      if (amount === 0 && (textHit || sheetIsComp) && amountCol >= 0) {
        amount = Math.abs(toNumber(row[amountCol]));
        if (textHit) reasons.push(textHit);
      }
      const flag = flagCol >= 0 ? String(row[flagCol] ?? "").trim().toLowerCase() : "";
      const complaintReason =
        complaintReasonCol >= 0 ? String(row[complaintReasonCol] ?? "").trim() : "";
      const hasComplaint = ["y", "yes", "true", "1", "نعم"].includes(flag) || complaintReason !== "";
      if (amount === 0 && !hasComplaint) continue;
      if (hasComplaint && amount === 0 && orderValueCol >= 0) {
        amount = Math.abs(toNumber(row[orderValueCol]));
      }
      if (hasComplaint) reasons.unshift(`شكوى: ${complaintReason || "بدون سبب"}`);

      const branch = branchCol >= 0 ? String(row[branchCol] ?? "").trim() : "";
      const key = `${orderNumber}`;
      const existing = found.get(key);
      if (existing) {
        existing.amount += amount;
      } else {
        found.set(key, {
          key,
          orderNumber,
          branch,
          amount,
          reason: reasons.join("، ") || "تعويض",
          source: `${fileName} · ${sheetName}`,
        });
      }
    }
  }
  return [...found.values()].sort((a, b) => b.amount - a.amount);
}

export function CompensationFileScanner({
  renderEvidence,
}: {
  renderEvidence: (item: CompensationEvidenceRecord) => ReactNode;
}) {
  const { context } = useWorkspaceAccess();
  const inputRef = useRef<HTMLInputElement>(null);
  const [orders, setOrders] = useState<CompensatedOrder[] | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [evidence, setEvidence] = useState<Record<string, CompensationEvidenceRecord[]>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, string>>({});
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) ?? "null");
      if (saved) {
        setOrders(saved.orders ?? null);
        setFileNames(saved.fileNames ?? []);
      }
    } catch { /* ignore */ }
    setHydrated(true);
    void marks()
      .select("order_number,submitted_at")
      .then(({ data, error }: { data: { order_number: string; submitted_at: string }[] | null; error: unknown }) => {
        if (error) {
          toast.error("تعذّر تحميل حالات الاعتراض.");
          return;
        }
        setDone(Object.fromEntries((data ?? []).map((r) => [r.order_number, r.submitted_at])));
      });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!orders) localStorage.removeItem(STORE_KEY);
    else localStorage.setItem(STORE_KEY, JSON.stringify({ orders, fileNames }));
  }, [orders, fileNames, hydrated]);

  async function toggleDone(key: string) {
    const wasDone = Boolean(done[key]);
    const stamp = new Date().toISOString();
    setDone((prev) => {
      const next = { ...prev };
      if (wasDone) delete next[key];
      else next[key] = stamp;
      return next;
    });
    const { error } = wasDone
      ? await marks().delete().eq("order_number", key)
      : await marks()
          .upsert(
            {
              user_id: context.dataOwnerUserId,
              workspace_id: context.workspaceId,
              order_number: key,
              submitted_at: stamp,
            },
            { onConflict: "user_id,order_number" },
          );
    if (error) {
      toast.error("تعذّر حفظ الحالة.");
      setDone((prev) => {
        const next = { ...prev };
        if (wasDone) next[key] = stamp;
        else delete next[key];
        return next;
      });
    }
  }

  const lookup = useMutation({
    mutationFn: (order: CompensatedOrder) =>
      searchCompensationEvidence({ data: { orderNumber: order.orderNumber } }),
    onMutate: (order) => setLoadingKey(order.key),
    onSuccess: (result, order) => {
      setEvidence((prev) => ({ ...prev, [order.key]: result.evidence }));
      if (result.evidence.length === 0) toast.info(`لا يوجد دليل في Telegram للطلب ${order.orderNumber}`);
    },
    onError: (error: Error) => toast.error(error.message),
    onSettled: () => setLoadingKey(null),
  });

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    // Copy the list now: the input is cleared right after this call starts, which empties the live FileList.
    const chosen = Array.from(files);
    try {
      const all: CompensatedOrder[] = [];
      for (const file of chosen) {
        all.push(...extractCompensatedOrders(await file.arrayBuffer(), file.name));
      }
      setOrders(all);
      setFileNames(chosen.map((f) => f.name));
      setEvidence({});
      if (all.length === 0) toast.info("لم يتم العثور على طلبات فيها تعويض في الملف");
    } catch {
      toast.error("تعذّر قراءة الملف. استخدم ملف Excel أو CSV.");
    }
  }

  const total = orders?.reduce((sum, o) => sum + o.amount, 0) ?? 0;
  const submitted = orders?.filter((o) => done[o.key]).length ?? 0;
  const clearList = () => {
    if (window.confirm("مسح القائمة؟ (حالات الاعتراض تبقى محفوظة)")) {
      setOrders(null);
      setFileNames([]);
    }
  };

  const evidenceCell = (order: CompensatedOrder) => {
    const items = evidence[order.key];
    return items && items.length > 0 ? (
      <div className="space-y-2">{items.map((item) => <div key={item.id}>{renderEvidence(item)}</div>)}</div>
    ) : (
      <Button size="sm" variant="outline" disabled={loadingKey === order.key} onClick={() => lookup.mutate(order)} aria-busy={loadingKey === order.key}>
        {loadingKey === order.key ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
        {items ? "لا يوجد — إعادة" : "جلب الدليل"}
      </Button>
    );
  };

  const doneButton = (order: CompensatedOrder) =>
    done[order.key] ? (
      <Button size="sm" variant="ghost" className="text-success hover:text-success" onClick={() => toggleDone(order.key)} title="إلغاء">
        <CheckCircle2 className="size-4" /> تم تقديم الاعتراض
        <RotateCcw className="size-3 opacity-60" />
      </Button>
    ) : (
      <Button size="sm" variant="outline" onClick={() => toggleDone(order.key)}>
        <CheckCircle2 className="size-4" /> تم — قُدّم الاعتراض
      </Button>
    );

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div className="min-w-0">
          <h2 className="text-[17px] font-semibold">طلبات التعويض من الملف</h2>
          <p className="mt-0.5 max-w-[65ch] text-sm text-muted-foreground">
            ارفع ملف المنصة (هنقرستيشن، كيتا، جاهز) ويظهر لك فقط الطلبات التي فيها تعويض.
          </p>
        </div>
        <div className="flex gap-2">
          {orders ? (
            <Button variant="outline" size="sm" onClick={clearList}>
              <X className="size-4" /> مسح
            </Button>
          ) : null}
          <Button size={orders ? "sm" : "default"} variant={orders ? "outline" : "default"} onClick={() => inputRef.current?.click()}>
            <Upload className="size-4" /> رفع ملف
          </Button>
        </div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={(e) => { void handleFiles(e.target.files); e.target.value = ""; }}
        />
      </div>

      {!orders ? (
        <div className="px-5 pb-5">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); void handleFiles(e.dataTransfer.files); }}
            className="group flex w-full flex-col items-center gap-3 rounded-xl border border-dashed border-input bg-background px-6 py-10 text-center transition-colors hover:border-primary/50 hover:bg-primary/[0.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-card"
          >
            <span className="grid size-12 place-items-center rounded-full bg-primary/10 text-primary-text transition-transform duration-200 group-hover:-translate-y-0.5 motion-reduce:transition-none">
              <FileSpreadsheet className="size-6" />
            </span>
            <span className="text-sm font-semibold text-foreground">اسحب الملف هنا أو اضغط للاختيار (Excel / CSV)</span>
          </button>
        </div>
      ) : (
        <div>
          <dl className="grid grid-cols-2 gap-px border-y border-border bg-border lg:grid-cols-4">
            <ScanStat label="الملف" value={<span className="block truncate text-sm font-medium" title={fileNames.join("، ")}>{fileNames.join("، ") || "—"}</span>} />
            <ScanStat label="عدد الطلبات" value={<span className="num">{orders.length}</span>} />
            <ScanStat
              label="تم تقديم الاعتراض"
              value={
                <span className="num">
                  {submitted} <span className="text-sm font-normal text-muted-foreground">/ {orders.length}</span>
                </span>
              }
            >
              <div aria-hidden className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-1 rounded-full bg-success transition-[width] duration-300 motion-reduce:transition-none"
                  style={{ width: `${orders.length ? (submitted / orders.length) * 100 : 0}%` }}
                />
              </div>
            </ScanStat>
            <ScanStat label="إجمالي التعويض" value={<span className="tabular-nums">{sar(total)}</span>} />
          </dl>

          <ul className="divide-y divide-border md:hidden">
            {orders.map((order) => (
              <li key={order.key} className={cn("space-y-2.5 px-5 py-3.5", done[order.key] && "bg-muted/50")}>
                <div className="flex items-start justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block font-mono text-sm font-semibold tabular-nums"><bdi>{order.orderNumber}</bdi></span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                      {order.branch || "—"} · {order.reason}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">{sar(order.amount)}</span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {evidenceCell(order)}
                  {doneButton(order)}
                </div>
              </li>
            ))}
          </ul>

          <div className="hidden max-h-[560px] overflow-auto md:block">
            <table className="w-full min-w-[820px] text-sm">
              <thead className="sticky top-0 z-[1] bg-muted text-xs text-muted-foreground">
                <tr>
                  <th className="px-5 py-2.5 text-start font-medium">رقم الطلب</th>
                  <th className="px-2 py-2.5 text-start font-medium">الفرع</th>
                  <th className="px-2 py-2.5 text-start font-medium">النوع</th>
                  <th className="px-2 py-2.5 text-end font-medium">المبلغ</th>
                  <th className="px-2 py-2.5 text-start font-medium">الدليل</th>
                  <th className="px-5 py-2.5 text-start font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => (
                  <tr key={order.key} className={cn("border-t border-border align-middle", done[order.key] && "bg-muted/50 text-muted-foreground")}>
                    <td className="px-5 py-2.5"><span className="font-mono font-semibold tabular-nums" dir="ltr">{order.orderNumber}</span></td>
                    <td className="whitespace-nowrap px-2 py-2.5">{order.branch || "—"}</td>
                    <td className="px-2 py-2.5 text-muted-foreground">{order.reason}</td>
                    <td className="whitespace-nowrap px-2 py-2.5 text-end tabular-nums">{sar(order.amount)}</td>
                    <td className="px-2 py-2.5">{evidenceCell(order)}</td>
                    <td className="px-5 py-2.5">{doneButton(order)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}

function ScanStat({ label, value, children }: { label: string; value: ReactNode; children?: ReactNode }) {
  return (
    <div className="min-w-0 bg-card px-5 py-3.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{value}</dd>
      {children}
    </div>
  );
}
