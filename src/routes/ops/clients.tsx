import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { ChevronDown, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ONBOARDING_STATUS_LABELS, type OnboardingStatus } from "@/lib/onboarding";
import { opsCan, sarFmt, SUBSCRIPTION_STATUS_LABELS, CYCLE_LABELS } from "@/lib/ops";
import { addClientNote, listClientNotes, listOpsClients, setOpsClientStatus } from "@/lib/ops.functions";
import type { OpsClient } from "@/lib/ops.server";
import { OpsDenied, OpsHeader, useOpsRole } from "@/components/OpsShared";

export const Route = createFileRoute("/ops/clients")({ component: Clients });

const STEPS: { status: OnboardingStatus; label: string }[] = [
  { status: "awaiting_payment", label: "بانتظار التحويل" },
  { status: "onboarding", label: "تم الدفع — بدء التهيئة" },
  { status: "active", label: "تفعيل" },
  { status: "suspended", label: "إيقاف" },
];

function Clients() {
  const role = useOpsRole();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<string>("all");
  const q = useQuery({ queryKey: ["ops-clients"], queryFn: () => listOpsClients({ data: {} }), enabled: opsCan(role, "clients") });
  if (!opsCan(role, "clients")) return <OpsDenied />;
  const rows = (q.data ?? []).filter((c) => {
    const text = `${c.name} ${c.legalName ?? ""} ${c.crNumber ?? ""} ${c.contactEmail ?? ""} ${c.ownerEmail ?? ""}`.toLowerCase();
    return (filter === "all" || c.status === filter) && text.includes(search.toLowerCase());
  });
  return (
    <div>
      <OpsHeader title="العملاء" sub={`${q.data?.length ?? 0} شركة`}>
        <div className="flex gap-2">
          <Input placeholder="بحث بالاسم، السجل، البريد" value={search} onChange={(e) => setSearch(e.target.value)} className="w-56" />
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className="rounded-md border border-input bg-background px-2 text-sm">
            <option value="all">كل الحالات</option>
            {Object.entries(ONBOARDING_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
      </OpsHeader>
      {q.isLoading ? <Loader2 className="size-5 animate-spin" /> : q.error ? <p className="text-sm text-destructive">{(q.error as Error).message}</p> : (
        <div className="space-y-2">{rows.map((c) => <ClientRow key={c.workspaceId} c={c} canEdit={role !== "support"} />)}</div>
      )}
    </div>
  );
}

function ClientRow({ c, canEdit }: { c: OpsClient; canEdit: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const notes = useQuery({ queryKey: ["ops-notes", c.workspaceId], queryFn: () => listClientNotes({ data: { workspaceId: c.workspaceId } }), enabled: open });
  const status = useMutation({
    mutationFn: (s: OnboardingStatus) => setOpsClientStatus({ data: { workspaceId: c.workspaceId, status: s } }),
    onSuccess: () => { toast.success("تم التحديث"); void qc.invalidateQueries({ queryKey: ["ops-clients"] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const addNote = useMutation({
    mutationFn: () => addClientNote({ data: { workspaceId: c.workspaceId, body: note } }),
    onSuccess: () => { setNote(""); void qc.invalidateQueries({ queryKey: ["ops-notes", c.workspaceId] }); },
    onError: (e) => toast.error((e as Error).message),
  });
  const Field = ({ k, v }: { k: string; v: string | number | null }) => (
    <div><p className="text-[11px] text-muted-foreground">{k}</p><p className="num text-sm">{v ?? "—"}</p></div>
  );
  return (
    <div className="panel">
      <button onClick={() => setOpen(!open)} className="flex w-full flex-wrap items-center gap-3 p-4 text-start">
        {c.logoUrl ? <img src={c.logoUrl} alt="" className="size-9 rounded object-contain" /> : <span className="grid size-9 place-items-center rounded bg-muted text-sm font-bold">{c.name.slice(0, 1)}</span>}
        <div className="min-w-40 flex-1">
          <p className="font-semibold">{c.name}</p>
          <p className="text-xs text-muted-foreground">{c.ownerEmail ?? c.contactEmail ?? "—"}</p>
        </div>
        <span className="rounded-full bg-muted px-2.5 py-1 text-xs">{ONBOARDING_STATUS_LABELS[c.status] ?? c.status}</span>
        <span className="text-xs text-muted-foreground">{c.subscriptionStatus ? `${SUBSCRIPTION_STATUS_LABELS[c.subscriptionStatus]} · ${sarFmt(c.subscriptionPrice ?? 0)} ${CYCLE_LABELS[c.subscriptionCycle ?? "monthly"]}` : "بدون اشتراك"}</span>
        <span className="num text-xs text-muted-foreground">{c.users} مستخدم</span>
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="space-y-4 border-t border-border p-4">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
            <Field k="الاسم القانوني" v={c.legalName} />
            <Field k="السجل التجاري" v={c.crNumber} />
            <Field k="الرقم الضريبي" v={c.vatNumber} />
            <Field k="عدد الفروع" v={c.branchCount} />
            <Field k="جهة الاتصال" v={c.contactName} />
            <Field k="الجوال" v={c.contactMobile} />
            <Field k="الهوية" v={c.contactNationalId} />
            <Field k="البريد" v={c.contactEmail} />
            <Field k="موعد الاجتماع" v={c.meetingAt ? new Date(c.meetingAt).toLocaleString("ar-SA", { timeZone: "Asia/Riyadh" }) : null} />
            <Field k="تاريخ التسجيل" v={c.createdAt.slice(0, 10)} />
            <Field k="نهاية الاشتراك" v={c.subscriptionEndsOn} />
            <Field k="إجمالي المدفوع" v={sarFmt(c.paidTotal)} />
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              {STEPS.map((s) => (
                <Button key={s.status} size="sm" variant={s.status === "suspended" ? "destructive" : c.status === s.status ? "default" : "outline"} disabled={status.isPending || c.status === s.status} onClick={() => status.mutate(s.status)}>{s.label}</Button>
              ))}
            </div>
          ) : null}
          <div>
            <p className="mb-2 text-sm font-semibold">ملاحظات</p>
            <div className="flex gap-2">
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="أضف ملاحظة…" />
              <Button size="sm" disabled={!note.trim() || addNote.isPending} onClick={() => addNote.mutate()}>إضافة</Button>
            </div>
            <ul className="mt-3 space-y-2">
              {(notes.data ?? []).map((n) => (
                <li key={n.id} className="rounded-md bg-muted/50 p-2.5 text-sm">{n.body}<p className="mt-1 text-[11px] text-muted-foreground">{n.author} · {new Date(n.createdAt).toLocaleString("ar-SA")}</p></li>
              ))}
            </ul>
          </div>
        </div>
      ) : null}
    </div>
  );
}
