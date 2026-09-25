import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { OPS_ACCESS, OPS_ROLE_LABELS, opsCan, type OpsRole } from "@/lib/ops";
import { addOpsStaff, listOpsStaff, removeOpsStaff } from "@/lib/ops.functions";
import { OpsDenied, OpsHeader, useOpsRole } from "../ops";

export const Route = createFileRoute("/ops/staff")({ component: Staff });

const SECTION_AR: Record<string, string> = { overview: "نظرة عامة", clients: "العملاء", subscriptions: "الاشتراكات", payments: "المدفوعات", usage: "الاستخدام", logs: "السجلات", staff: "الفريق" };

function Staff() {
  const role = useOpsRole();
  const qc = useQueryClient();
  const ok = opsCan(role, "staff");
  const q = useQuery({ queryKey: ["ops-staff"], queryFn: () => listOpsStaff({ data: {} }), enabled: ok });
  const [f, setF] = useState({ email: "", fullName: "", role: "support" as OpsRole, password: "" });
  const add = useMutation({
    mutationFn: () => addOpsStaff({ data: { ...f, password: f.password || undefined } }),
    onSuccess: () => { toast.success("تمت الإضافة"); setF({ email: "", fullName: "", role: "support", password: "" }); void qc.invalidateQueries({ queryKey: ["ops-staff"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const del = useMutation({
    mutationFn: (userId: string) => removeOpsStaff({ data: { userId } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["ops-staff"] }),
    onError: (e) => toast.error((e as Error).message),
  });
  if (!ok) return <OpsDenied />;
  return (
    <div className="space-y-5">
      <OpsHeader title="فريق العمليات" sub="من يستطيع دخول هذه اللوحة وماذا يرى" />
      <section className="panel grid gap-2 p-4 sm:grid-cols-5">
        <Input placeholder="الاسم" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
        <Input dir="ltr" type="email" placeholder="email@tadqeeq.app" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
        <Input dir="ltr" type="password" placeholder="كلمة المرور (للحساب الجديد)" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
        <select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as OpsRole })}>
          {Object.entries(OPS_ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <Button disabled={!f.email || add.isPending} onClick={() => add.mutate()}>إضافة</Button>
      </section>
      <section className="panel divide-y divide-border">
        {(q.data ?? []).map((s) => (
          <div key={s.userId} className="flex items-center gap-3 p-4">
            <div className="flex-1"><p className="font-medium">{s.fullName || s.email}</p><p className="text-xs text-muted-foreground" dir="ltr">{s.email}</p></div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs">{OPS_ROLE_LABELS[s.role]}</span>
            <Button size="sm" variant="ghost" onClick={() => { if (window.confirm("إزالة من الفريق؟")) del.mutate(s.userId); }}><Trash2 className="size-4" /></Button>
          </div>
        ))}
      </section>
      <section className="panel p-4 text-sm">
        <p className="mb-2 font-semibold">صلاحيات الأدوار</p>
        {(Object.keys(OPS_ACCESS) as OpsRole[]).map((r) => (
          <p key={r} className="text-muted-foreground"><b className="text-foreground">{OPS_ROLE_LABELS[r]}:</b> {OPS_ACCESS[r].map((s) => SECTION_AR[s]).join("، ")}</p>
        ))}
      </section>
    </div>
  );
}
