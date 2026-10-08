import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, Loader2, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ONBOARDING_STATUS_LABELS } from "@/lib/onboarding";
import { CYCLE_LABELS, sarFmt, SUBSCRIPTION_STATUS_LABELS } from "@/lib/ops";
import { deleteOpsClient, updateOpsClient } from "@/lib/ops.functions";
import type { OpsClient } from "@/lib/ops.server";

export function ClientAvatar({ c, size = "size-10" }: { c: Pick<OpsClient, "name" | "logoUrl">; size?: string }) {
  return c.logoUrl ? (
    <img src={c.logoUrl} alt="" className={`${size} shrink-0 rounded-lg border border-border bg-background object-contain`} />
  ) : (
    <span className={`${size} grid shrink-0 place-items-center rounded-lg bg-muted text-sm font-bold`}>{c.name.slice(0, 1)}</span>
  );
}

export function ClientStatusBadge({ c }: { c: Pick<OpsClient, "archived" | "status"> }) {
  if (c.archived) return <span className="rounded-full bg-destructive/10 px-2.5 py-1 text-xs font-semibold text-destructive">مؤرشف</span>;
  const tone =
    c.status === "active" ? "bg-primary/15 text-primary-text" : c.status === "suspended" ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground";
  return <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${tone}`}>{ONBOARDING_STATUS_LABELS[c.status] ?? c.status}</span>;
}

/** One client in a list; the whole row opens the client's profile. */
export function ClientListRow({ c, meta }: { c: OpsClient; meta?: string }) {
  return (
    <Link
      to="/ops/clients/$workspaceId"
      params={{ workspaceId: c.workspaceId }}
      className="panel flex flex-wrap items-center gap-x-4 gap-y-2 p-4 transition-colors hover:border-foreground/25"
    >
      <ClientAvatar c={c} />
      <div className="min-w-44 flex-1">
        <p className="font-semibold">{c.name}</p>
        {c.accountOf ? (
          <p className="text-xs text-primary-text">شركة تابعة لحساب «{c.accountOf}»</p>
        ) : null}
        <p className="text-xs text-muted-foreground" dir="ltr">{c.ownerEmail ?? c.contactEmail ?? "—"}</p>
      </div>
      <ClientStatusBadge c={c} />
      <span className="w-40 text-xs text-muted-foreground">
        {c.subscriptionStatus
          ? `${SUBSCRIPTION_STATUS_LABELS[c.subscriptionStatus]} · ${sarFmt(c.subscriptionPrice ?? 0)} ${CYCLE_LABELS[c.subscriptionCycle ?? "monthly"]}`
          : "بدون اشتراك"}
        {c.subscriptionFromAccount ? <span className="block">من اشتراك الحساب</span> : null}
      </span>
      <span className="w-20 text-xs text-muted-foreground"><span className="num">{c.users}</span> مستخدم</span>
      <span className="w-28 text-xs text-muted-foreground">{meta ?? <span className="num">{c.createdAt.slice(0, 10)}</span>}</span>
      <ChevronLeft className="size-4 text-muted-foreground" />
    </Link>
  );
}

export function EditClientForm({ c, onDone }: { c: OpsClient; onDone: () => void }) {
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

export function DeleteClientConfirm({ c, onCancel, onDeleted }: { c: OpsClient; onCancel: () => void; onDeleted: () => void }) {
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
