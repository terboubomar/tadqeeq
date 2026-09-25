import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { PLAN_FEATURES, type PlanFeature } from "@/lib/plans";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CYCLE_LABELS, opsCan, sarFmt, SUBSCRIPTION_STATUS_LABELS, type Cycle, type SubscriptionStatus } from "@/lib/ops";
import { listOpsClients, listPlans, listSubscriptions, savePlan, saveSubscription } from "@/lib/ops.functions";
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
  const canPlans = role === "owner" || role === "finance";

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
      <OpsHeader title="الاشتراكات" sub="الباقات واشتراك كل عميل">
        {role !== "support" ? <Button onClick={() => setForm(blank())}>+ اشتراك جديد</Button> : null}
      </OpsHeader>

      <PlansEditor plans={plans.data ?? []} canEdit={canPlans} />

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

type PlanRow = { id: string; name: string; price: number; cycle: Cycle; active: boolean; features: PlanFeature[]; uploadLimit: number | null; description: string; highlighted: boolean; sortOrder: number };
const blankPlan = (): Omit<PlanRow, "id"> & { id?: string } => ({ name: "", price: 0, cycle: "monthly", active: true, features: [], uploadLimit: 10, description: "", highlighted: false, sortOrder: 0 });

function PlansEditor({ plans, canEdit }: { plans: PlanRow[]; canEdit: boolean }) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<ReturnType<typeof blankPlan> | null>(null);
  const save = useMutation({
    mutationFn: (p: ReturnType<typeof blankPlan>) => savePlan({ data: p }),
    onSuccess: () => { toast.success("تم حفظ الباقة"); setEdit(null); void qc.invalidateQueries({ queryKey: ["ops-plans"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <section className="panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold">الباقات (السعر حسب الميزات وعدد مرات الرفع شهرياً)</h2>
        {canEdit ? <Button size="sm" variant="outline" onClick={() => setEdit(blankPlan())}>+ باقة</Button> : null}
      </div>
      <div className="grid gap-2 md:grid-cols-3">
        {plans.map((p) => (
          <div key={p.id} className={"rounded-md border p-3 text-sm " + (p.active ? "border-border" : "border-dashed opacity-60")}>
            <div className="flex items-center justify-between">
              <span className="font-semibold">{p.name}{p.highlighted ? " ★" : ""}</span>
              {canEdit ? <Button size="sm" variant="ghost" onClick={() => setEdit({ ...p })}>تعديل</Button> : null}
            </div>
            <p className="num">{sarFmt(p.price)} / {CYCLE_LABELS[p.cycle]} · {p.uploadLimit === null ? "رفع بلا حدود" : `${p.uploadLimit} رفعة/شهر`}</p>
            <p className="mt-1 text-xs text-muted-foreground">{PLAN_FEATURES.filter((f) => p.features.includes(f.key)).map((f) => f.label).join("، ") || "الأساسيات فقط"}</p>
          </div>
        ))}
        {!plans.length ? <p className="text-sm text-muted-foreground">لا توجد باقات بعد.</p> : null}
      </div>
      {edit ? (
        <div className="mt-4 grid gap-3 rounded-md border border-border p-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-1"><Label>اسم الباقة</Label><Input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} /></div>
          <div className="space-y-1"><Label>السعر (ر.س)</Label><Input type="number" value={edit.price || ""} onChange={(e) => setEdit({ ...edit, price: Number(e.target.value) })} /></div>
          <div className="space-y-1"><Label>الدورة</Label><select className={sel} value={edit.cycle} onChange={(e) => setEdit({ ...edit, cycle: e.target.value as Cycle })}><option value="monthly">شهري</option><option value="yearly">سنوي</option></select></div>
          <div className="space-y-1"><Label>رفعات الملفات شهرياً</Label>
            <div className="flex gap-2">
              <Input type="number" min={0} disabled={edit.uploadLimit === null} value={edit.uploadLimit ?? ""} onChange={(e) => setEdit({ ...edit, uploadLimit: Math.max(0, Number(e.target.value)) })} />
              <label className="flex items-center gap-1 whitespace-nowrap text-xs"><input type="checkbox" checked={edit.uploadLimit === null} onChange={(e) => setEdit({ ...edit, uploadLimit: e.target.checked ? null : 10 })} />بلا حدود</label>
            </div></div>
          <div className="space-y-1 sm:col-span-2"><Label>وصف قصير</Label><Input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} /></div>
          <div className="space-y-1"><Label>الترتيب</Label><Input type="number" value={edit.sortOrder} onChange={(e) => setEdit({ ...edit, sortOrder: Number(e.target.value) })} /></div>
          <div className="flex flex-col justify-end gap-1 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={edit.highlighted} onChange={(e) => setEdit({ ...edit, highlighted: e.target.checked })} />الأكثر طلباً</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={edit.active} onChange={(e) => setEdit({ ...edit, active: e.target.checked })} />ظاهرة ومتاحة</label>
          </div>
          <div className="space-y-2 sm:col-span-2 lg:col-span-4">
            <Label>الميزات المشمولة (الأساسيات: اللوحة والتقارير والرفع والمستخدمون مشمولة دائماً)</Label>
            <div className="flex flex-wrap gap-3 text-sm">
              {PLAN_FEATURES.map((f) => (
                <label key={f.key} className="flex items-center gap-2">
                  <input type="checkbox" checked={edit.features.includes(f.key)} onChange={(e) => setEdit({ ...edit, features: e.target.checked ? [...edit.features, f.key] : edit.features.filter((x) => x !== f.key) })} />
                  {f.label}
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-2">
            <Button disabled={!edit.name.trim() || save.isPending} onClick={() => save.mutate(edit)}>حفظ</Button>
            <Button variant="ghost" onClick={() => setEdit(null)}>إلغاء</Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
