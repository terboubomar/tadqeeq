import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, ChevronDown, Loader2, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ONBOARDING_STATUS_LABELS, type OnboardingStatus } from "@/lib/onboarding";
import { sarFmt, SUBSCRIPTION_STATUS_LABELS, CYCLE_LABELS } from "@/lib/ops";
import {
  addClientNote,
  deleteOpsClient,
  listClientNotes,
  setOpsClientArchived,
  setOpsClientStatus,
  updateOpsClient,
} from "@/lib/ops.functions";
import type { OpsClient } from "@/lib/ops.server";

const STEPS: { status: OnboardingStatus; label: string }[] = [
  { status: "awaiting_payment", label: "بانتظار التحويل" },
  { status: "onboarding", label: "تم الدفع — بدء التهيئة" },
  { status: "active", label: "تفعيل" },
  { status: "suspended", label: "إيقاف" },
];

export function ClientRow({ c, canEdit, canDelete }: { c: OpsClient; canEdit: boolean; canDelete: boolean }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const refresh = () => void qc.invalidateQueries({ queryKey: ["ops-clients"] });
  const archive = useMutation({
    mutationFn: (archived: boolean) => setOpsClientArchived({ data: { workspaceId: c.workspaceId, archived } }),
    onSuccess: (_, archived) => {
      toast.success(archived ? "تمت أرشفة العميل وإيقاف وصوله · تجده في «الأرشيف والمحذوفة»" : "تمت استعادة العميل إلى قائمة العملاء");
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });
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
        {c.archived ? (
          <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">مؤرشف</span>
        ) : (
          <span className="rounded-full bg-muted px-2.5 py-1 text-xs">{ONBOARDING_STATUS_LABELS[c.status] ?? c.status}</span>
        )}
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
            <div className="flex flex-wrap gap-2 border-b border-border pb-4">
              <Button size="sm" variant="outline" onClick={() => setEditing((v) => !v)}>
                <Pencil className="size-3.5" />
                {editing ? "إغلاق التعديل" : "تعديل البيانات"}
              </Button>
              <Button size="sm" variant="outline" disabled={archive.isPending} onClick={() => archive.mutate(!c.archived)}>
                {c.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
                {c.archived ? "استعادة من الأرشيف" : "أرشفة"}
              </Button>
              {canDelete ? (
                <Button size="sm" variant="destructive" onClick={() => setConfirmingDelete((v) => !v)}>
                  <Trash2 className="size-3.5" />
                  حذف نهائي
                </Button>
              ) : null}
            </div>
          ) : null}
          {editing && canEdit ? <EditClientForm c={c} onDone={() => { setEditing(false); refresh(); }} /> : null}
          {confirmingDelete && canDelete ? <DeleteClientConfirm c={c} onCancel={() => setConfirmingDelete(false)} onDeleted={refresh} /> : null}
          {canEdit && !c.archived ? (
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

function EditClientForm({ c, onDone }: { c: OpsClient; onDone: () => void }) {
  const [form, setForm] = useState({
    name: c.name,
    legalName: c.legalName ?? "",
    brandName: c.brandName ?? "",
    crNumber: c.crNumber ?? "",
    vatNumber: c.vatNumber ?? "",
    contactName: c.contactName ?? "",
    contactMobile: c.contactMobile ?? "",
    contactEmail: c.contactEmail ?? "",
    contactNationalId: c.contactNationalId ?? "",
    branchCount: c.branchCount === null ? "" : String(c.branchCount),
    adminNote: c.adminNote ?? "",
  });
  const save = useMutation({
    mutationFn: () =>
      updateOpsClient({
        data: {
          workspaceId: c.workspaceId,
          ...form,
          branchCount: form.branchCount.trim() === "" ? null : Number(form.branchCount),
        },
      }),
    onSuccess: () => {
      toast.success("تم حفظ بيانات العميل");
      onDone();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const fields: Array<[keyof typeof form, string, string?]> = [
    ["name", "اسم الشركة في تدقيق"],
    ["legalName", "الاسم القانوني"],
    ["brandName", "العلامة التجارية"],
    ["crNumber", "السجل التجاري", "ltr"],
    ["vatNumber", "الرقم الضريبي", "ltr"],
    ["branchCount", "عدد الفروع", "ltr"],
    ["contactName", "جهة الاتصال"],
    ["contactMobile", "الجوال", "ltr"],
    ["contactEmail", "البريد", "ltr"],
    ["contactNationalId", "الهوية", "ltr"],
  ];
  return (
    <form
      className="space-y-3 rounded-lg border border-border bg-muted/30 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
    >
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {fields.map(([key, label, dir]) => (
          <label key={key} className="text-xs text-muted-foreground">
            {label}
            <Input
              dir={dir}
              inputMode={key === "branchCount" ? "numeric" : undefined}
              value={form[key]}
              onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
              className="mt-1 bg-background text-sm text-foreground"
            />
          </label>
        ))}
      </div>
      <label className="block text-xs text-muted-foreground">
        ملاحظة داخلية
        <Input value={form.adminNote} onChange={(e) => setForm((f) => ({ ...f, adminNote: e.target.value }))} className="mt-1 bg-background text-sm text-foreground" />
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" disabled={save.isPending || !form.name.trim()}>
          {save.isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
          حفظ
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={onDone}>إلغاء</Button>
      </div>
    </form>
  );
}

function DeleteClientConfirm({ c, onCancel, onDeleted }: { c: OpsClient; onCancel: () => void; onDeleted: () => void }) {
  const qc = useQueryClient();
  const [typed, setTyped] = useState("");
  const remove = useMutation({
    mutationFn: () => deleteOpsClient({ data: { workspaceId: c.workspaceId, confirmName: typed } }),
    onSuccess: (r) => {
      toast.success(`تم حذف ${c.name} نهائياً · حُذف ${r.usersDeleted} حساب مستخدم${r.usersKept ? ` وأُبقي ${r.usersKept}` : ""}`);
      onDeleted();
      void qc.invalidateQueries({ queryKey: ["ops-deleted-clients"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <div className="space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <p className="font-semibold text-destructive">حذف نهائي لا يمكن التراجع عنه</p>
      <p className="leading-6 text-muted-foreground">
        سيُحذف كل ما يخص هذا العميل: الفترات والملفات والعقود والتعويضات والاشتراكات والمدفوعات، وحسابات المستخدمين التابعة له فقط
        (لا تُحذف حسابات فريق العمليات أو المستخدمين المرتبطين بشركات أخرى). يبقى قيد الحذف في «الأرشيف والمحذوفة».
        إذا كنت تريد فقط إيقاف وصوله مع إمكانية الاستعادة، استخدم «أرشفة».
      </p>
      <label className="block text-xs text-muted-foreground">
        اكتب اسم الشركة للتأكيد: <span className="font-semibold text-foreground">{c.name}</span>
        <Input value={typed} onChange={(e) => setTyped(e.target.value)} className="mt-1 bg-background" />
      </label>
      <div className="flex gap-2">
        <Button size="sm" variant="destructive" disabled={typed.trim() !== c.name.trim() || remove.isPending} onClick={() => remove.mutate()}>
          {remove.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
          حذف نهائي
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>إلغاء</Button>
      </div>
    </div>
  );
}
