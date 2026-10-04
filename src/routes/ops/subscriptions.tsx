import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CYCLE_LABELS, opsCan, sarFmt, SUBSCRIPTION_STATUS_LABELS, type Cycle, type SubscriptionStatus } from "@/lib/ops";
import { listOpsClients, listPlanRequests, listPlans, listSubscriptions, saveSubscription, workspaceOrderUsage } from "@/lib/ops.functions";
import { PLAN_ADDONS, type PlanAddon } from "@/lib/plans";
import { OpsDenied, OpsHeader, useOpsRole } from "@/components/OpsShared";

export const Route = createFileRoute("/ops/subscriptions")({ component: Subscriptions });

const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
type SubForm = { id?: string; workspaceId: string; planId: string | null; price: number; branchCount: number; cycle: Cycle; status: SubscriptionStatus; startsOn: string; endsOn: string | null; notes?: string; addons: PlanAddon[] };
const blank = (): SubForm => ({ workspaceId: "", planId: null, price: 0, branchCount: 1, cycle: "monthly", status: "active", startsOn: new Date().toISOString().slice(0, 10), endsOn: null, addons: [] });
const fmt = (n: number) => Math.round(n).toLocaleString("en-US");

function Subscriptions() {
  const role = useOpsRole();
  const qc = useQueryClient();
  const ok = opsCan(role, "subscriptions");
  const plans = useQuery({ queryKey: ["ops-plans"], queryFn: () => listPlans({ data: {} }), enabled: ok });
  const subs = useQuery({ queryKey: ["ops-subs"], queryFn: () => listSubscriptions({ data: {} }), enabled: ok });
  const clients = useQuery({ queryKey: ["ops-clients"], queryFn: () => listOpsClients({ data: {} }), enabled: ok });
  const requests = useQuery({ queryKey: ["ops-plan-requests"], queryFn: () => listPlanRequests({ data: {} }), enabled: ok });
  const usage = useQuery({ queryKey: ["ops-order-usage"], queryFn: () => workspaceOrderUsage({ data: {} }), enabled: ok });
  const [form, setForm] = useState<SubForm | null>(null);

  const saveSub = useMutation({
    mutationFn: (f: SubForm) => saveSubscription({ data: f }),
    onSuccess: () => { toast.success("تم حفظ الاشتراك"); setForm(null); void qc.invalidateQueries(); },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!ok) return <OpsDenied />;

  /** The plan's price for a cycle: its yearly price when it has one, otherwise its own price and cycle. */
  function applyPlan(f: SubForm, planId: string | null, cycle: Cycle = f.cycle): SubForm {
    const p = plans.data?.find((x) => x.id === planId);
    if (!p) return { ...f, planId, cycle };
    if (p.customPrice) return { ...f, planId, cycle };
    if (cycle === "yearly" && p.priceYearly !== null) return { ...f, planId, cycle, price: p.priceYearly };
    if (cycle === "monthly" && p.cycle === "monthly") return { ...f, planId, cycle, price: p.price };
    return { ...f, planId, cycle: p.cycle, price: p.price };
  }
  const planName = (id: string | null) => plans.data?.find((p) => p.id === id)?.name ?? "مخصص";
  const clientName = (id: string) => clients.data?.find((c) => c.workspaceId === id)?.name ?? "—";
  const subscribed = new Set((subs.data ?? []).filter((x) => x.status !== "cancelled").map((x) => x.workspaceId));
  const openRequests = (requests.data ?? []).filter((r) => !subscribed.has(r.workspaceId) || (subs.data ?? []).some((x) => x.workspaceId === r.workspaceId && x.planId !== r.planId));

  return (
    <div className="space-y-6">
      <OpsHeader title="الاشتراكات" sub="اشتراك كل عميل ومواعيد التجديد">
        {role !== "support" ? <Button onClick={() => setForm(blank())}>+ اشتراك جديد</Button> : null}
      </OpsHeader>

      {openRequests.length ? (
        <section className="panel p-4">
          <h2 className="mb-3 text-sm font-semibold">طلبات الباقات من العملاء</h2>
          <ul className="space-y-2 text-sm">
            {openRequests.map((r) => (
              <li key={r.workspaceId} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
                <span>
                  <span className="font-medium">{clientName(r.workspaceId)}</span> · {planName(r.planId)} · {CYCLE_LABELS[r.cycle]}
                  {r.addons.length ? ` · ${PLAN_ADDONS.filter((a) => r.addons.includes(a.key)).map((a) => a.label).join("، ")}` : ""}
                  <span className="num ms-2 text-xs text-muted-foreground">{r.requestedAt.slice(0, 10)}</span>
                </span>
                {role !== "support" ? (
                  <Button size="sm" variant="outline" onClick={() => setForm(applyPlan({ ...blank(), workspaceId: r.workspaceId, addons: r.addons }, r.planId, r.cycle))}>
                    إنشاء اشتراك
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

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
          <div className="space-y-1"><Label>الدورة</Label><select className={sel} value={form.cycle} onChange={(e) => setForm(applyPlan(form, form.planId, e.target.value as Cycle))}><option value="monthly">شهري</option><option value="yearly">سنوي</option></select></div>
          <div className="space-y-1"><Label>الحالة</Label><select className={sel} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as SubscriptionStatus })}>{Object.entries(SUBSCRIPTION_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="space-y-1"><Label>البداية</Label><Input type="date" value={form.startsOn} onChange={(e) => setForm({ ...form, startsOn: e.target.value })} /></div>
          <div className="space-y-1"><Label>النهاية / التجديد</Label><Input type="date" value={form.endsOn ?? ""} onChange={(e) => setForm({ ...form, endsOn: e.target.value || null })} /></div>
          <div className="space-y-1"><Label>الإضافات</Label>
            {PLAN_ADDONS.map((a) => (
              <label key={a.key} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={form.addons.includes(a.key)} onChange={(e) => setForm({ ...form, addons: e.target.checked ? [...form.addons, a.key] : form.addons.filter((x) => x !== a.key) })} />
                {a.label} <span className="num text-xs text-muted-foreground">({a.price} ر.س / {a.months} أشهر)</span>
              </label>
            ))}</div>
          <div className="space-y-1 sm:col-span-2 lg:col-span-2"><Label>ملاحظات</Label><Input value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
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
            <thead className="bg-muted/50 text-xs text-muted-foreground"><tr>{["العميل", "الباقة", "السعر", "الدورة", "الطلبات (آخر شهر · قبله)", "الحالة", "البداية", "النهاية", ""].map((h) => <th key={h} className="p-3 text-start font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {(subs.data ?? []).map((s) => {
                const late = s.status === "active" && s.endsOn && s.endsOn < new Date().toISOString().slice(0, 10);
                return (
                  <tr key={s.id} className="border-t border-border">
                    <td className="p-3 font-medium">{s.workspaceName}</td>
                    <td className="p-3">{planName(s.planId)}{s.addons.length ? <span className="block text-xs text-muted-foreground">+ إضافات</span> : null}</td>
                    <td className="num p-3">{sarFmt(s.price)}</td>
                    <td className="p-3">{CYCLE_LABELS[s.cycle]}</td>
                    <td className="num p-3">{(() => {
                      const u = usage.data?.find((x) => x.workspaceId === s.workspaceId) ?? { month: null, latest: 0, previous: 0 };
                      const limit = plans.data?.find((p) => p.id === s.planId)?.orderLimit ?? null;
                      const over = (n: number) => limit !== null && n > limit;
                      return (
                        <span title={[u.month ? `آخر شهر بيانات: ${u.month.slice(0, 7)}` : "", limit !== null ? `حد الباقة ${fmt(limit)}` : ""].filter(Boolean).join(" · ") || undefined}>
                          <span className={over(u.latest) ? "font-semibold text-destructive" : ""}>{fmt(u.latest)}</span>
                          {" · "}
                          <span className={over(u.previous) ? "font-semibold text-destructive" : ""}>{fmt(u.previous)}</span>
                          {limit !== null ? <span className="text-xs text-muted-foreground"> / {fmt(limit)}</span> : null}
                          {over(u.latest) && over(u.previous) ? <span className="block text-xs text-destructive">تجاوز شهرين: رقِّ الباقة</span> : null}
                        </span>
                      );
                    })()}</td>
                    <td className="p-3"><span className={late || s.status === "overdue" ? "text-destructive" : ""}>{SUBSCRIPTION_STATUS_LABELS[s.status]}{late ? " · انتهى" : ""}</span></td>
                    <td className="num p-3">{s.startsOn}</td>
                    <td className="num p-3">{s.endsOn ?? "—"}</td>
                    <td className="p-3">{role !== "support" ? <Button size="sm" variant="outline" onClick={() => setForm({ ...s, notes: s.notes ?? undefined, addons: s.addons })}>تعديل</Button> : null}</td>
                  </tr>
                );
              })}
              {!subs.data?.length ? <tr><td colSpan={9} className="p-6 text-center text-muted-foreground">لا توجد اشتراكات بعد.</td></tr> : null}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
