import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CYCLE_LABELS, opsCan, sarFmt, type Cycle } from "@/lib/ops";
import { listPlans, listSubscriptions, savePlan } from "@/lib/ops.functions";
import { PLAN_FEATURES, type PlanFeature } from "@/lib/plans";
import { OpsDenied, OpsHeader, useOpsRole } from "@/components/OpsShared";

export const Route = createFileRoute("/ops/plans")({ component: Plans });

const sel = "h-9 w-full rounded-md border border-input bg-background px-2 text-sm";

function Plans() {
  const role = useOpsRole();
  const ok = opsCan(role, "subscriptions");
  const plans = useQuery({ queryKey: ["ops-plans"], queryFn: () => listPlans({ data: {} }), enabled: ok });
  const subs = useQuery({ queryKey: ["ops-subs"], queryFn: () => listSubscriptions({ data: {} }), enabled: ok });
  if (!ok) return <OpsDenied />;
  const subscribers = new Map<string, number>();
  for (const s of subs.data ?? []) if (s.planId && (s.status === "active" || s.status === "overdue" || s.status === "trial")) subscribers.set(s.planId, (subscribers.get(s.planId) ?? 0) + 1);
  return (
    <div>
      <OpsHeader title="الباقات" sub="السعر حسب الميزات وعدد مرات الرفع شهرياً — تظهر للعملاء في صفحة الاشتراك" />
      {plans.isLoading ? <Loader2 className="size-5 animate-spin" /> : <PlansEditor plans={plans.data ?? []} canEdit={role === "owner" || role === "finance"} subscribers={subscribers} />}
    </div>
  );
}

type PlanRow = { id: string; name: string; price: number; cycle: Cycle; active: boolean; features: PlanFeature[]; uploadLimit: number | null; description: string; highlighted: boolean; sortOrder: number };
const blankPlan = (): Omit<PlanRow, "id"> & { id?: string } => ({ name: "", price: 0, cycle: "monthly", active: true, features: [], uploadLimit: 10, description: "", highlighted: false, sortOrder: 0 });

function PlansEditor({ plans, canEdit, subscribers }: { plans: PlanRow[]; canEdit: boolean; subscribers: Map<string, number> }) {
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
        <h2 className="text-sm font-semibold">{plans.length} باقة</h2>
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
            <p className="num mt-2 text-xs">{subscribers.get(p.id) ?? 0} مشترك حالياً{p.active ? "" : " · مخفية"}</p>
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
