import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Paperclip, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { opsCan, sarFmt } from "@/lib/ops";
import { deletePayment, getReceiptUrl, listOpsClients, listPayments, recordPayment } from "@/lib/ops.functions";
import { OpsDenied, OpsHeader, useOpsRole } from "@/components/OpsShared";

export const Route = createFileRoute("/ops/payments")({ component: Payments });

const readFile = (f: File) => new Promise<string>((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result)); r.onerror = () => rej(new Error("تعذّر قراءة الملف")); r.readAsDataURL(f); });

function Payments() {
  const role = useOpsRole();
  const qc = useQueryClient();
  const ok = opsCan(role, "payments");
  const pays = useQuery({ queryKey: ["ops-payments"], queryFn: () => listPayments({ data: {} }), enabled: ok });
  const clients = useQuery({ queryKey: ["ops-clients"], queryFn: () => listOpsClients({ data: {} }), enabled: ok });
  const [f, setF] = useState({ workspaceId: "", amount: 0, paidOn: new Date().toISOString().slice(0, 10), reference: "", notes: "" });
  const [file, setFile] = useState<File | null>(null);
  const [filter, setFilter] = useState("");

  const save = useMutation({
    mutationFn: async () => recordPayment({ data: { ...f, receiptDataUrl: file ? await readFile(file) : undefined } }),
    onSuccess: () => { toast.success("تم تسجيل الدفعة"); setF({ ...f, amount: 0, reference: "", notes: "" }); setFile(null); void qc.invalidateQueries(); },
    onError: (e) => toast.error((e as Error).message),
  });
  const del = useMutation({
    mutationFn: (id: string) => deletePayment({ data: { id } }),
    onSuccess: () => void qc.invalidateQueries(),
    onError: (e) => toast.error((e as Error).message),
  });

  if (!ok) return <OpsDenied />;
  const rows = (pays.data ?? []).filter((p) => !filter || p.workspaceId === filter);
  const total = rows.reduce((a, p) => a + p.amount, 0);

  return (
    <div className="space-y-5">
      <OpsHeader title="المدفوعات" sub="تسجيل التحويلات البنكية يدوياً" />
      <section className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-6">
        <div className="space-y-1 lg:col-span-2"><Label>العميل</Label>
          <select className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={f.workspaceId} onChange={(e) => setF({ ...f, workspaceId: e.target.value })}>
            <option value="">اختر…</option>
            {(clients.data ?? []).map((c) => <option key={c.workspaceId} value={c.workspaceId}>{c.name}</option>)}
          </select></div>
        <div className="space-y-1"><Label>المبلغ (ر.س)</Label><Input type="number" value={f.amount || ""} onChange={(e) => setF({ ...f, amount: Number(e.target.value) })} /></div>
        <div className="space-y-1"><Label>تاريخ التحويل</Label><Input type="date" value={f.paidOn} onChange={(e) => setF({ ...f, paidOn: e.target.value })} /></div>
        <div className="space-y-1 lg:col-span-2"><Label>رقم المرجع</Label><Input value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></div>
        <div className="space-y-1 lg:col-span-3"><Label>ملاحظات</Label><Input value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></div>
        <div className="space-y-1 lg:col-span-2"><Label>الإيصال (PDF أو صورة، حتى 5MB)</Label><Input type="file" accept="application/pdf,image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></div>
        <div className="flex items-end"><Button className="w-full" disabled={!f.workspaceId || f.amount <= 0 || save.isPending} onClick={() => save.mutate()}>{save.isPending ? <Loader2 className="size-4 animate-spin" /> : null}تسجيل</Button></div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={filter} onChange={(e) => setFilter(e.target.value)}>
          <option value="">كل العملاء</option>
          {(clients.data ?? []).map((c) => <option key={c.workspaceId} value={c.workspaceId}>{c.name}</option>)}
        </select>
        <p className="text-sm">الإجمالي: <b className="num">{sarFmt(total)}</b></p>
      </div>

      <section className="panel overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{["التاريخ", "العميل", "المبلغ", "المرجع", "ملاحظات", ""].map((h) => <th key={h} className="p-3 text-start font-medium">{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((p) => (
              <tr key={p.id} className="border-t border-border">
                <td className="num p-3">{p.paidOn}</td>
                <td className="p-3 font-medium">{p.workspaceName}</td>
                <td className="num p-3">{sarFmt(p.amount)}</td>
                <td className="p-3">{p.reference ?? "—"}</td>
                <td className="p-3 text-muted-foreground">{p.notes ?? ""}</td>
                <td className="flex gap-1 p-3">
                  {p.hasReceipt ? <Button size="sm" variant="ghost" onClick={async () => { try { const url = await getReceiptUrl({ data: { id: p.id } }); if (url) window.open(url, "_blank"); } catch (e) { toast.error((e as Error).message); } }}><Paperclip className="size-4" /></Button> : null}
                  <Button size="sm" variant="ghost" onClick={() => { if (window.confirm("حذف هذه الدفعة؟")) del.mutate(p.id); }}><Trash2 className="size-4" /></Button>
                </td>
              </tr>
            ))}
            {!rows.length ? <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">لا توجد مدفوعات.</td></tr> : null}
          </tbody>
        </table>
      </section>
    </div>
  );
}
