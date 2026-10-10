import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Check, Minus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OPS_ACCESS, OPS_ROLE_LABELS, opsCan, type OpsRole, type OpsSection } from "@/lib/ops";
import { addOpsStaff, listOpsStaff, removeOpsStaff } from "@/lib/ops.functions";
import { OpsConfirm, OpsDenied, OpsHeader, useOpsRole } from "@/components/OpsShared";

export const Route = createFileRoute("/ops/staff")({ component: Staff });

const SECTION_AR: Record<OpsSection, string> = { overview: "نظرة عامة", clients: "العملاء", subscriptions: "الاشتراكات", payments: "المدفوعات", usage: "الاستخدام", logs: "السجلات", staff: "الفريق" };

function Staff() {
  const role = useOpsRole();
  const qc = useQueryClient();
  const ok = opsCan(role, "staff");
  const q = useQuery({ queryKey: ["ops-staff"], queryFn: () => listOpsStaff({ data: {} }), enabled: ok });
  const [f, setF] = useState({ email: "", fullName: "", role: "support" as OpsRole, password: "" });
  const [removeId, setRemoveId] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: () => addOpsStaff({ data: { ...f, password: f.password || undefined } }),
    onSuccess: () => { toast.success("تمت الإضافة"); setF({ email: "", fullName: "", role: "support", password: "" }); void qc.invalidateQueries({ queryKey: ["ops-staff"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const del = useMutation({
    mutationFn: (userId: string) => removeOpsStaff({ data: { userId } }),
    onSuccess: () => {
      setRemoveId(null);
      void qc.invalidateQueries({ queryKey: ["ops-staff"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  if (!ok) return <OpsDenied />;
  return (
    <div className="space-y-5">
      <OpsHeader title="فريق العمليات" sub="من يستطيع دخول هذه اللوحة وماذا يرى" />
      <section className="panel p-4">
        <h2 className="mb-3 text-sm font-semibold">إضافة عضو للفريق</h2>
        <form
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_1.2fr_1fr_10rem_auto] lg:items-end"
          onSubmit={(e) => {
            e.preventDefault();
            if (f.email && !add.isPending) add.mutate();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="staff-name">الاسم</Label>
            <Input id="staff-name" value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-email">البريد الإلكتروني</Label>
            <Input id="staff-email" dir="ltr" type="email" autoComplete="off" placeholder="email@tadqeeq.app" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-password">كلمة المرور</Label>
            <Input id="staff-password" dir="ltr" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="staff-role">الدور</Label>
            <select id="staff-role" className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm" value={f.role} onChange={(e) => setF({ ...f, role: e.target.value as OpsRole })}>
              {Object.entries(OPS_ROLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
          </div>
          <Button type="submit" disabled={!f.email || add.isPending}>إضافة</Button>
        </form>
        <p className="mt-2 text-xs text-muted-foreground">كلمة المرور مطلوبة فقط إذا لم يكن للبريد حساب بعد.</p>
      </section>
      <section className="panel divide-y divide-border">
        {(q.data ?? []).map((s) => (
          <div key={s.userId} className="flex items-center gap-3 p-4">
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium">{s.fullName || s.email}</p>
              <p className="truncate text-xs text-muted-foreground" dir="ltr" style={{ textAlign: "right" }}>{s.email}</p>
            </div>
            <span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs">{OPS_ROLE_LABELS[s.role]}</span>
            <Button size="sm" variant="ghost" aria-label={"إزالة " + (s.fullName || s.email)} title="إزالة من الفريق" onClick={() => setRemoveId(s.userId)}>
              <Trash2 className="size-4" />
            </Button>
          </div>
        ))}
      </section>
      <section className="panel overflow-x-auto">
        <h2 className="px-4 pt-4 text-sm font-semibold">صلاحيات الأدوار</h2>
        <table className="mt-2 w-full min-w-[560px] text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2 text-start font-medium">الدور</th>
              {(Object.keys(SECTION_AR) as OpsSection[]).map((section) => (
                <th key={section} className="px-2 py-2 text-center font-medium">{SECTION_AR[section]}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(Object.keys(OPS_ACCESS) as OpsRole[]).map((r) => (
              <tr key={r} className="border-t border-border">
                <td className="px-4 py-2.5 font-semibold">{OPS_ROLE_LABELS[r]}</td>
                {(Object.keys(SECTION_AR) as OpsSection[]).map((section) => (
                  <td key={section} className="px-2 py-2.5 text-center">
                    {OPS_ACCESS[r].includes(section) ? (
                      <Check className="mx-auto size-4 text-success" aria-label="مسموح" />
                    ) : (
                      <Minus className="mx-auto size-4 text-muted-foreground/50" aria-label="غير مسموح" />
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <OpsConfirm
        open={removeId !== null}
        title="إزالة من فريق العمليات؟"
        description={(() => {
          const member = (q.data ?? []).find((x) => x.userId === removeId);
          return member ? `لن يستطيع ${member.fullName || member.email} دخول لوحة العمليات بعد الآن.` : undefined;
        })()}
        confirmLabel="إزالة"
        busy={del.isPending}
        onConfirm={() => removeId && del.mutate(removeId)}
        onCancel={() => setRemoveId(null)}
      />
    </div>
  );
}
