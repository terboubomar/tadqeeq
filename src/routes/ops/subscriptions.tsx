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
import { PLAN_ADDONS, planIncludesAddon, type PlanAddon } from "@/lib/plans";
import { OpsDenied, OpsHeader, useOpsRole } from "@/components/OpsShared";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/ops/subscriptions")({ component: Subscriptions });

const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";
type SubForm = { id?: string; workspaceId: string; planId: string | null; price: number; branchCount: number; cycle: Cycle; status: SubscriptionStatus; startsOn: string; endsOn: string | null; notes?: string; addons: PlanAddon[] };
/** Renewal date one cycle after `start` (YYYY-MM-DD). */
function renewalDate(start: string, cycle: Cycle): string {
  const date = new Date(`${start}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return start;
  if (cycle === "yearly") date.setUTCFullYear(date.getUTCFullYear() + 1);
  else date.setUTCMonth(date.getUTCMonth() + 1);
  return date.toISOString().slice(0, 10);
}
const blank = (): SubForm => {
  const startsOn = new Date().toISOString().slice(0, 10);
  return { workspaceId: "", planId: null, price: 0, branchCount: 1, cycle: "monthly", status: "active", startsOn, endsOn: renewalDate(startsOn, "monthly"), addons: [] };
};
const LIVE: SubscriptionStatus[] = ["trial", "active", "overdue"];
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

  // A subscription can also activate or suspend the client and settle its plan request.
  const refresh = () =>
    Promise.all(
      [["ops-subs"], ["ops-plan-requests"], ["ops-clients"], ["ops-client"], ["ops-overview"], ["ops-tasks"], ["ops-logs"]].map((queryKey) =>
        qc.invalidateQueries({ queryKey }),
      ),
    );
  const saveSub = useMutation({
    mutationFn: (f: SubForm) => saveSubscription({ data: f }),
    onSuccess: () => { toast.success("تم حفظ الاشتراك"); setForm(null); void refresh(); },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!ok) return <OpsDenied />;

  /** The plan's price for a cycle: its yearly price when it has one, otherwise its own price and cycle. */
  function applyPlan(f: SubForm, planId: string | null, cycle: Cycle = f.cycle): SubForm {
    const p = plans.data?.find((x) => x.id === planId);
    const next: SubForm = (() => {
      if (!p || p.customPrice) return { ...f, planId, cycle };
      if (cycle === "yearly" && p.priceYearly !== null) return { ...f, planId, cycle, price: p.priceYearly };
      if (cycle === "monthly" && p.cycle === "monthly") return { ...f, planId, cycle, price: p.price };
      return { ...f, planId, cycle: p.cycle, price: p.price };
    })();
    // A new subscription renews one cycle after it starts; an existing one keeps its dates.
    return f.id ? next : { ...next, endsOn: renewalDate(next.startsOn, next.cycle) };
  }
  /** The client's current subscription (the one keeping the account open), if any. */
  const liveSub = (workspaceId: string) => (subs.data ?? []).find((x) => x.workspaceId === workspaceId && LIVE.includes(x.status));
  const formPlan = form ? plans.data?.find((p) => p.id === form.planId) ?? null : null;
  const planName = (id: string | null) => plans.data?.find((p) => p.id === id)?.name ?? "مخصص";
  const clientName = (id: string) => clients.data?.find((c) => c.workspaceId === id)?.name ?? "—";
  /** Orders in the last two data months against the plan's limit; red when over it. */
  const usageCell = (s: { workspaceId: string; planId: string | null }) => {
    const u = usage.data?.find((x) => x.workspaceId === s.workspaceId) ?? { month: null, latest: 0, previous: 0 };
    const limit = plans.data?.find((p) => p.id === s.planId)?.orderLimit ?? null;
    const over = (n: number) => limit !== null && n > limit;
    return (
      <span title={[u.month ? `آخر شهر بيانات: ${u.month.slice(0, 7)}` : "", limit !== null ? `حد الباقة ${fmt(limit)}` : ""].filter(Boolean).join(" · ") || undefined}>
        <span className={cn("num", over(u.latest) && "font-semibold text-destructive")}>{fmt(u.latest)}</span>
        {" · "}
        <span className={cn("num", over(u.previous) && "font-semibold text-destructive")}>{fmt(u.previous)}</span>
        {limit !== null ? <span className="text-xs text-muted-foreground"> / <span className="num">{fmt(limit)}</span></span> : null}
        {over(u.latest) && over(u.previous) ? <span className="block text-xs text-destructive">تجاوز شهرين: رقِّ الباقة</span> : null}
      </span>
    );
  };
  const openRequests = requests.data ?? [];

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
                {role !== "support" ? (() => {
                  // Upgrades and downgrades change the current subscription instead of adding a second one.
                  const current = liveSub(r.workspaceId);
                  return (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setForm(
                          current
                            ? applyPlan({ ...current, notes: current.notes ?? undefined, status: "active", addons: r.addons }, r.planId, r.cycle)
                            : applyPlan({ ...blank(), workspaceId: r.workspaceId, addons: r.addons }, r.planId, r.cycle),
                        )
                      }
                    >
                      {current ? "تحديث الاشتراك الحالي" : "إنشاء اشتراك"}
                    </Button>
                  );
                })() : null}
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
              {(plans.data ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}{p.active ? "" : " (مخفية)"}</option>)}
            </select></div>
          <div className="space-y-1"><Label>السعر لكل دورة (ر.س)</Label><Input type="number" value={form.price} onChange={(e) => setForm({ ...form, price: Number(e.target.value) })} /></div>
          <div className="space-y-1"><Label>الدورة</Label><select className={sel} value={form.cycle} onChange={(e) => setForm(applyPlan(form, form.planId, e.target.value as Cycle))}><option value="monthly">شهري</option><option value="yearly">سنوي</option></select></div>
          <div className="space-y-1"><Label>الحالة</Label><select className={sel} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as SubscriptionStatus })}>{Object.entries(SUBSCRIPTION_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
          <div className="space-y-1"><Label>البداية</Label><Input type="date" value={form.startsOn} onChange={(e) => setForm(form.id ? { ...form, startsOn: e.target.value } : { ...form, startsOn: e.target.value, endsOn: renewalDate(e.target.value, form.cycle) })} /></div>
          <div className="space-y-1"><Label>النهاية / التجديد</Label><Input type="date" value={form.endsOn ?? ""} onChange={(e) => setForm({ ...form, endsOn: e.target.value || null })} /></div>
          <div className="space-y-1"><Label>الإضافات</Label>
            {PLAN_ADDONS.map((a) => {
              const inPlan = !!formPlan && planIncludesAddon(formPlan.features, a.key);
              return (
                <label key={a.key} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" disabled={inPlan} checked={inPlan || form.addons.includes(a.key)} onChange={(e) => setForm({ ...form, addons: e.target.checked ? [...form.addons, a.key] : form.addons.filter((x) => x !== a.key) })} />
                  {a.label} <span className="text-xs text-muted-foreground">{inPlan ? "(مشمولة في الباقة)" : <span className="num">({a.price} ر.س / {a.months} أشهر)</span>}</span>
                </label>
              );
            })}</div>
          <div className="space-y-1 sm:col-span-2 lg:col-span-2"><Label>ملاحظات</Label><Input value={form.notes ?? ""} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></div>
          <div className="flex items-end gap-2">
            <Button disabled={!form.workspaceId || saveSub.isPending} onClick={() => saveSub.mutate({ ...form, addons: form.addons.filter((a) => !(formPlan && planIncludesAddon(formPlan.features, a))) })}>حفظ</Button>
            <Button variant="ghost" onClick={() => setForm(null)}>إلغاء</Button>
          </div>
          {!form.id && form.workspaceId && liveSub(form.workspaceId) ? (
            <p className="flex flex-wrap items-center gap-2 rounded-md bg-warning/10 p-2 text-xs sm:col-span-4">
              لهذا العميل اشتراك ساري. للترقية أو تغيير الباقة عدّل الاشتراك الحالي بدل إنشاء اشتراك ثانٍ.
              <Button size="sm" variant="outline" onClick={() => { const c = liveSub(form.workspaceId)!; setForm({ ...c, notes: c.notes ?? undefined, addons: c.addons }); }}>
                تعديل الاشتراك الحالي
              </Button>
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground sm:col-span-4">
            «نشط» يفتح حساب العميل وينهي التجربة المجانية. الإيقاف أو الإلغاء يقفل الحساب، إلا إذا كان للعميل اشتراك آخر ساري.
          </p>
        </section>
      ) : null}

      <section className="space-y-2 md:hidden">
        {subs.isLoading ? <Loader2 className="m-4 size-5 animate-spin" /> : null}
        {(subs.data ?? []).map((s) => {
          const late = s.status === "active" && s.endsOn && s.endsOn < new Date().toISOString().slice(0, 10);
          return (
            <article key={s.id} className="panel space-y-2 p-4 text-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-semibold">{s.workspaceName}</p>
                  <p className="text-xs text-muted-foreground">
                    {planName(s.planId)}
                    {s.addons.length ? " + إضافات" : ""} · {CYCLE_LABELS[s.cycle]}
                  </p>
                </div>
                <span className="num shrink-0 font-semibold">{sarFmt(s.price)}</span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span className={late || s.status === "overdue" ? "font-semibold text-destructive" : "text-foreground"}>
                  {SUBSCRIPTION_STATUS_LABELS[s.status]}
                  {late ? " · انتهى" : ""}
                </span>
                <span>
                  <span className="num">{s.startsOn}</span> ← <span className="num">{s.endsOn ?? "—"}</span>
                </span>
              </div>
              <div className="flex items-end justify-between gap-3 border-t border-border pt-2 text-xs">
                <div>
                  <p className="text-muted-foreground">الطلبات (آخر شهر · قبله)</p>
                  <div className="mt-0.5">{usageCell(s)}</div>
                </div>
                {role !== "support" ? (
                  <Button size="sm" variant="outline" onClick={() => setForm({ ...s, notes: s.notes ?? undefined, addons: s.addons })}>
                    تعديل
                  </Button>
                ) : null}
              </div>
            </article>
          );
        })}
        {!subs.isLoading && !subs.data?.length ? <p className="panel p-6 text-center text-sm text-muted-foreground">لا توجد اشتراكات بعد.</p> : null}
      </section>
      <section className="panel hidden overflow-x-auto md:block">
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
                    <td className="p-3"><span className="num">{sarFmt(s.price)}</span></td>
                    <td className="p-3">{CYCLE_LABELS[s.cycle]}</td>
                    <td className="p-3">{usageCell(s)}</td>
                    <td className="p-3"><span className={late || s.status === "overdue" ? "text-destructive" : ""}>{SUBSCRIPTION_STATUS_LABELS[s.status]}{late ? " · انتهى" : ""}</span></td>
                    <td className="p-3"><span className="num">{s.startsOn}</span></td>
                    <td className="p-3"><span className="num">{s.endsOn ?? "—"}</span></td>
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
