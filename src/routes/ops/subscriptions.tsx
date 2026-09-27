import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CYCLE_LABELS, opsCan, sarFmt, SUBSCRIPTION_STATUS_LABELS, type Cycle, type SubscriptionStatus } from "@/lib/ops";
import { listOpsClients, listPlans, listSubscriptions, saveSubscription } from "@/lib/ops.functions";
import { OpsDenied, OpsHeader, useOpsRole } from "@/components/OpsShared";

export const Route = createFileRoute("/ops/subscriptions")({ component: Subscriptions });

const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
type SubForm = { id?: string; workspaceId: string; planId: string | null; price: number; branchCount: number; cycle: Cycle; status: SubscriptionStatus; startsOn: string; endsOn: string | null; notes?: string };
const blank = (): SubForm => ({ workspaceId: "", planId: null, price: 0, branchCount: 1, cycle: "monthly", status: "active", startsOn: new Date().toISOString().slice(0, 10), endsOn: null });

function Subscriptions() {
  const role = useOpsRole();
  const qc = useQueryClient();
  const ok = opsCan(role, "subscriptions");
  const plans = useQuery({ queryKey: ["ops-plans"], queryFn: () => listPlans({ data: {} }), enabled: ok });
  const subs = useQuery({ queryKey: ["ops-subs"], queryFn: () => listSubscriptions({ data: {} }), enabled: ok });
  const clients = useQuery({ queryKey: ["ops-clients"], queryFn: () => listOpsClients({ data: {} }), enabled: ok });
  const [form, setForm] = useState<SubForm | null>(null);

  const saveSub = useMutation({
    mutationFn: (f: SubForm) => saveSubscription({ data: f }),
    onSuccess: () => { toast.success("تم حفظ الاشتراك"); setForm(null); void qc.invalidateQueries(); },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!ok) return <OpsDenied />;

  function applyPlan(f: SubForm, planId: string | null, branches = f.branchCount): SubForm {
    const p = plans.data?.find((x) => x.id === planId);
    if (!p) return { ...f, planId, branchCount: branches };
    return { ...f, planId, branchCount: branches, cycle: p.cycle, price: p.price };
  }

  return (
    <div className="space-y-6">
      <OpsHeader title="الاشتراكات" sub="اشتراك كل عميل ومواعيد التجديد">
        {role !== "support" ? <Button onClick={() => setForm(blank())}>+ اشتراك جديد</Button> : null}
      </OpsHeader>

      {form ? (
        <section className="panel grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1"><Label>العميل</Label>
            <select className={sel} value={form.workspaceId} onChange={(e) => setForm({ ...form, workspaceId: e.target.value })} disabled={!!form.id}>
              <option value="">اختر…</option>
              {(clients.data ?? []).map((c) => <option key={c.workspaceId} value={c.workspaceId}>{c.name}</option>)}
            </select></div>
          <div className="space-y-1"><Label>الباقة</Label>
            <select className={sel} value={form.planId ?? ""} onChange={(e) => setForm(applyPlan(form, e.target.value || null))}>
              <option value="">مخصص</option>
              {(plans.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></div>
          <div className="space-y-1"><Label>السعر لكل دورة (ر.س)</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} /></div>
          <div className="space-y-1"><Label>الدورة</Label><select className={sel} value={form.cycle} onChange={(e) => setForm({ ...form, cycle: e.target.value as Cycle })}><option value="monthly">شهري</option><option value="yearly">سنوي</option></select></div>
          <div className="space-y-1"><Label>الحالة</Label><select className={sel} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as SubscriptionStatus })}>{Object.entries(SUBSCRIPTION_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="space-y-1"><Label>البداية</Label><Input type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} /></div>
          <div className="space-y-1"><Label>النهاية / التجديد</Label><Input type="date" value={form.endsOn ?? ""} onChange={(e) => setForm({ ...form, endsOn: e.target.value || null })} /></div>
          <div className="space-y-1 sm:col-span-2 lg:col-span-3"><Label>ملاحظات</Label><Input value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex items-end gap-2">
            <Button disabled={!form.workspaceId || saveSub.isPending} onClick={() => saveSub.mutate(form)}>حفظ</Button>
            <Button variant="ghost" onClick={() => setForm(null)}>إلغاء</Button>
          </div>
          <p className="text-xs text-muted-foreground sm:col-span-4">الإيقاف أو الإلغاء يقفل حساب العميل تلقائياً، والتفعيل يعيد فتحه.</p>
        </section>
      ) : null}

      <section className="panel overflow-x-auto">
        {subs.isLoading ? <Loader2 className="m-4 size-5 animate-spin" /> : (
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{["العميل", "الباقة", "السعر", "الدورة", "الحالة", "البداية", "النهاية", ""].map((h) => <th key={h} className="p-3 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {(subs.data ?? []).map((s) => {
                const late = s.status === "active" && s.endsOn && s.endsOn < new Date().toISOString().slice(0, 10);
                return (
                  <tr key={s.id} className="border-t border-border">
                    <td className="p-3 font-medium">{s.workspaceName}</td>
                    <td className="p-3">{plans.data?.find((p) => p.id === s.planId)?.name ?? "مخصص"}</td>
                    <td className="num p-3">{sarFmt(s.price)}</td>
                    <td className="p-3">{CYCLE_LABELS[s.cycle]}</td>
                    <td className="p-3"><span className={late || s.status === "overdue" ? "text-destructive" : ""}>{SUBSCRIPTION_STATUS_LABELS[s.status]}{late ? " · انتهى" : ""}</span></td>
                    <td className="num p-3">{s.startsOn}</td>
                    <td className="num p-3">{s.endsOn ?? "—"}</td>
                    <td className="p-3">{role !== "support" ? <Button size="sm" variant="outline" onClick={() => setForm({ ...s, notes: s.notes ?? undefined })}>تعديل</Button> : null}</td>
                  </tr>
                );
              })}
              {!subs.data?.length ? <tr><td colSpan={8} className="p-6 text-center text-muted-foreground">لا توجد اشتراكات بعد.</td></tr> : null}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
