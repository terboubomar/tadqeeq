import { useMutation } from "@tanstack/react-query";
import { FileSpreadsheet, Loader2, Search, Upload, X } from "lucide-react";
import { useRef, useState, type ReactNode } from "react";
import * as XLSX from "xlsx";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { searchCompensationEvidence } from "@/lib/compensation-evidence.functions";
import type { CompensationEvidenceRecord } from "@/lib/compensation-evidence.server";
import { sar } from "@/lib/format";

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
  const inputRef = useRef<HTMLInputElement>(null);
  const [orders, setOrders] = useState<CompensatedOrder[] | null>(null);
  const [fileNames, setFileNames] = useState<string[]>([]);
  const [evidence, setEvidence] = useState<Record<string, CompensationEvidenceRecord[]>>({});
  const [loadingKey, setLoadingKey] = useState<string | null>(null);

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
    try {
      const all: CompensatedOrder[] = [];
      for (const file of Array.from(files)) {
        all.push(...extractCompensatedOrders(await file.arrayBuffer(), file.name));
      }
      setOrders(all);
      setFileNames(Array.from(files).map((f) => f.name));
      setEvidence({});
      if (all.length === 0) toast.info("لم يتم العثور على طلبات فيها تعويض في الملف");
    } catch {
      toast.error("تعذّر قراءة الملف. استخدم ملف Excel أو CSV.");
    }
  }

  const total = orders?.reduce((sum, o) => sum + o.amount, 0) ?? 0;

  return (
    <section className="rounded-[10px] border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">طلبات التعويض من الملف</h2>
          <p className="text-sm text-muted-foreground">
            ارفع ملف المنصة (هنقرستيشن، كيتا، جاهز) ويظهر لك فقط الطلبات التي فيها تعويض.
          </p>
        </div>
        <div className="flex gap-2">
          {orders ? (
            <Button variant="outline" size="sm" onClick={() => { setOrders(null); setFileNames([]); }}>
              <X className="size-4" /> مسح
            </Button>
          ) : null}
          <Button onClick={() => inputRef.current?.click()}>
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
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); void handleFiles(e.dataTransfer.files); }}
          className="mt-4 flex w-full flex-col items-center gap-2 rounded-[10px] border-2 border-dashed border-border p-8 text-muted-foreground hover:bg-muted/40"
        >
          <FileSpreadsheet className="size-8" />
          <span className="text-sm">اسحب الملف هنا أو اضغط للاختيار (Excel / CSV)</span>
        </button>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
            <span>{fileNames.join("، ")}</span>
            <span>عدد الطلبات: <b className="text-foreground">{orders.length}</b></span>
            <span>إجمالي التعويض: <b className="text-foreground">{sar(total)}</b></span>
          </div>
          <div className="max-h-[520px] overflow-auto rounded-[8px] border border-border">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="sticky top-0 bg-muted text-muted-foreground">
                <tr>
                  <th className="p-2 text-right font-medium">رقم الطلب</th>
                  <th className="p-2 text-right font-medium">الفرع</th>
                  <th className="p-2 text-right font-medium">النوع</th>
                  <th className="p-2 text-left font-medium">المبلغ</th>
                  <th className="p-2 text-right font-medium">الدليل</th>
                </tr>
              </thead>
              <tbody>
                {orders.map((order) => {
                  const items = evidence[order.key];
                  return (
                    <tr key={order.key} className="border-t border-border align-top">
                      <td className="p-2 font-mono tabular-nums">{order.orderNumber}</td>
                      <td className="p-2">{order.branch || "—"}</td>
                      <td className="p-2 text-muted-foreground">{order.reason}</td>
                      <td className="p-2 text-left tabular-nums">{sar(order.amount)}</td>
                      <td className="p-2">
                        {items && items.length > 0 ? (
                          <div className="space-y-2">{items.map((item) => <div key={item.id}>{renderEvidence(item)}</div>)}</div>
                        ) : (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={loadingKey === order.key}
                            onClick={() => lookup.mutate(order)}
                          >
                            {loadingKey === order.key ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                            {items ? "لا يوجد — إعادة" : "جلب الدليل"}
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </section>
  );
}
