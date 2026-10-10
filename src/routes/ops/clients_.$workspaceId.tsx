import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Archive, ArchiveRestore, ArrowRight, BellRing, Check, Loader2, Mail, MessageCircle, PauseCircle, Paperclip, Pencil, Trash2 } from "lucide-react";
import { useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlatformIcon, PlatformName } from "@/components/brand/PlatformLogo";
import { ClientAvatar, ClientStatusBadge, DeleteClientConfirm, EditClientForm } from "@/components/OpsClientForms";
import { OpsConfirm, OpsDenied, useOpsRole } from "@/components/OpsShared";
import {
  normalizeSaudiMobile,
  ONBOARDING_STATUS_LABELS,
  SUSPENSION_REASONS,
  type OnboardingStatus,
  type SuspensionInfo,
  type SuspensionReason,
} from "@/lib/onboarding";
import { CYCLE_LABELS, opsActionLabel, opsCan, opsEventSummary, sarFmt, SUBSCRIPTION_STATUS_LABELS } from "@/lib/ops";
import { addClientNote, getOpsClientProfile, getReceiptUrl, listClientNotes, resetMemberTwoFactor, setOpsClientArchived, setOpsClientStatus } from "@/lib/ops.functions";
import type { OpsClientProfile } from "@/lib/ops.server";
import { PLAN_ADDONS } from "@/lib/plans";
import { WORKSPACE_ROLE_LABELS, type WorkspaceRole } from "@/lib/workspace-access";

const TABS = [
  { key: "overview", label: "نظرة عامة" },
  { key: "billing", label: "الاشتراك والمدفوعات" },
  { key: "team", label: "المستخدمون والفروع" },
  { key: "audits", label: "التدقيقات" },
  { key: "activity", label: "سجل النشاط" },
  { key: "notes", label: "الملاحظات" },
] as const;
type Tab = (typeof TABS)[number]["key"];

export const Route = createFileRoute("/ops/clients_/$workspaceId")({
  validateSearch: (search: Record<string, unknown>): { tab?: Tab } =>
    TABS.some((t) => t.key === search["tab"]) ? { tab: search["tab"] as Tab } : {},
  component: ClientProfilePage,
});

const PIPELINE: { status: OnboardingStatus; label: string; date: (j: OpsClientProfile["journey"]) => string | null }[] = [
  { status: "pending_details", label: "التسجيل", date: (j) => j.signedUpAt },
  { status: "meeting_booked", label: "البيانات والاجتماع", date: (j) => j.meetingAt ?? j.submittedAt },
  { status: "awaiting_payment", label: "بانتظار التحويل", date: () => null },
  { status: "onboarding", label: "الدفع والتهيئة", date: (j) => j.paidAt },
  { status: "active", label: "مفعّل", date: (j) => j.activatedAt },
];

const STATUS_ACTIONS: { status: OnboardingStatus; label: string }[] = [
  { status: "awaiting_payment", label: "بانتظار التحويل" },
  { status: "onboarding", label: "تم الدفع — بدء التهيئة" },
  { status: "active", label: "تفعيل" },
  { status: "suspended", label: "إيقاف" },
];

const MEMBER_STATUS: Record<string, string> = { active: "نشط", invited: "مدعو", suspended: "موقوف" };

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", year: "numeric" }) : "—");
const fmtDateTime = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("ar-SA-u-ca-gregory-nu-latn", { timeZone: "Asia/Riyadh", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }) : "—";
function ago(iso: string | null) {
  if (!iso) return "أبداً";
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 864e5);
  return days <= 0 ? "اليوم" : days === 1 ? "أمس" : `قبل ${days} يوم`;
}

function ClientProfilePage() {
  const role = useOpsRole();
  const { workspaceId } = Route.useParams();
  const { tab = "overview" } = Route.useSearch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const allowed = opsCan(role, "clients");
  const q = useQuery({ queryKey: ["ops-client", workspaceId], queryFn: () => getOpsClientProfile({ data: { workspaceId } }), enabled: allowed });
  const [panel, setPanel] = useState<"edit" | "delete" | "suspend" | null>(null);

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["ops-client", workspaceId] });
    void qc.invalidateQueries({ queryKey: ["ops-clients"] });
    void qc.invalidateQueries({ queryKey: ["ops-tasks"] });
  };
  const archive = useMutation({
    mutationFn: (archived: boolean) => setOpsClientArchived({ data: { workspaceId, archived } }),
    onSuccess: (_, archived) => {
      toast.success(archived ? "تمت أرشفة العميل وإيقاف وصوله" : "تمت استعادة العميل");
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });
  const status = useMutation({
    mutationFn: (input: { status: OnboardingStatus; reason?: SuspensionReason; clientMessage?: string }) =>
      setOpsClientStatus({ data: { workspaceId, ...input } }),
    onSuccess: (_, input) => {
      toast.success(input.status === "suspended" ? "تم إيقاف الحساب — سيرى العميل سبب الإيقاف عند الدخول" : "تم تحديث الحالة");
      setPanel(null);
      refresh();
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (!allowed) return <OpsDenied />;
  if (q.isLoading) return <Loader2 className="size-5 animate-spin" />;
  if (q.error || !q.data)
    return (
      <div className="panel mx-auto mt-10 max-w-md p-8 text-center text-sm">
        <p className="text-destructive">{(q.error as Error)?.message ?? "تعذّر تحميل العميل."}</p>
        <Link to="/ops/clients" className="mt-4 inline-block font-semibold underline underline-offset-4">العودة إلى العملاء</Link>
      </div>
    );

  const p = q.data;
  const c = p.client;
  const canEdit = role !== "support";
  const canDelete = role === "owner";
  const mobile = c.contactMobile ? normalizeSaudiMobile(c.contactMobile)?.slice(1) : null;
  const email = c.contactEmail ?? c.ownerEmail;
  const counts: Partial<Record<Tab, number>> = {
    team: p.members.length,
    audits: p.periods.length,
    activity: p.timeline.length,
  };

  return (
    <div className="space-y-5">
      <Link to={c.archived ? "/ops/archive" : "/ops/clients"} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowRight className="size-4" />
        {c.archived ? "الأرشيف" : "العملاء"}
      </Link>

      {/* Header */}
      <section className="panel p-5">
        <div className="flex flex-wrap items-start gap-4">
          <ClientAvatar c={c} size="size-16" />
          <div className="min-w-52 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-bold">{c.name}</h1>
              {c.accountOf ? (
                <p className="w-full text-sm text-primary-text">شركة تابعة لحساب «{c.accountOf}» · الاشتراك والحدود مشتركة مع الحساب</p>
              ) : null}
              <ClientStatusBadge c={c} />
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {[c.legalName, c.brandName && c.brandName !== c.name ? c.brandName : null, c.crNumber ? `س.ت ${c.crNumber}` : null].filter(Boolean).join(" · ") || "لم تُستكمل بيانات الشركة بعد"}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              {mobile ? (
                <a href={`https://wa.me/${mobile}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 hover:bg-muted">
                  <MessageCircle className="size-3.5" /> واتساب <span dir="ltr" className="num">{c.contactMobile}</span>
                </a>
              ) : null}
              {email ? (
                <a href={`mailto:${email}`} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 hover:bg-muted">
                  <Mail className="size-3.5" /> <span dir="ltr">{email}</span>
                </a>
              ) : null}
              <span className="text-muted-foreground">عميل منذ {fmtDate(c.createdAt)}</span>
            </div>
          </div>
          {canEdit ? (
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant={panel === "edit" ? "default" : "outline"} onClick={() => setPanel(panel === "edit" ? null : "edit")}>
                <Pencil className="size-3.5" /> تعديل البيانات
              </Button>
              <Button size="sm" variant="outline" disabled={archive.isPending} onClick={() => archive.mutate(!c.archived)}>
                {c.archived ? <ArchiveRestore className="size-3.5" /> : <Archive className="size-3.5" />}
                {c.archived ? "استعادة" : "أرشفة"}
              </Button>
              {canDelete ? (
                <Button size="sm" variant="destructive" onClick={() => setPanel(panel === "delete" ? null : "delete")}>
                  <Trash2 className="size-3.5" /> حذف نهائي
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
        {panel === "edit" && canEdit ? (
          <div className="mt-4">
            <EditClientForm c={c} onDone={() => { setPanel(null); refresh(); }} />
          </div>
        ) : null}
        {panel === "delete" && canDelete ? (
          <div className="mt-4">
            <DeleteClientConfirm
              c={c}
              onCancel={() => setPanel(null)}
              onDeleted={() => {
                void qc.invalidateQueries({ queryKey: ["ops-clients"] });
                void qc.invalidateQueries({ queryKey: ["ops-tasks"] });
                void navigate({ to: "/ops/archive" });
              }}
            />
          </div>
        ) : null}

        {c.status === "suspended" && p.suspension ? (
          <SuspensionBanner
            info={p.suspension}
            archived={c.archived}
            canEdit={canEdit}
            busy={status.isPending}
            onReactivate={() => status.mutate({ status: "active" })}
          />
        ) : null}

        {/* Pipeline */}
        <div className="mt-5 border-t border-border pt-4">
          <ol className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:overflow-visible sm:px-0 sm:pb-0">
            {PIPELINE.map((s, i) => {
              const current = PIPELINE.findIndex((x) => x.status === c.status);
              const done = c.status === "suspended" ? !!s.date(p.journey) : i < current || (i === current && c.status === "active");
              const here = i === current && !c.archived;
              return (
                <li
                  key={s.status}
                  className={`min-w-36 shrink-0 rounded-lg border px-3 py-2 text-xs sm:min-w-0 ${here ? "border-primary bg-primary/10" : done ? "border-border bg-muted/40" : "border-dashed border-border text-muted-foreground"}`}
                >
                  <p className="flex items-center gap-1.5 font-semibold">
                    {done ? <Check className="size-3.5 text-primary-text" /> : <span className="num opacity-60">{i + 1}</span>}
                    {s.label}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{fmtDate(s.date(p.journey))}</p>
                </li>
              );
            })}
          </ol>
          {canEdit && !c.archived ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">نقل إلى:</span>
              {STATUS_ACTIONS.map((s) => (
                <Button
                  key={s.status}
                  size="sm"
                  variant={s.status === "suspended" ? "destructive" : c.status === s.status ? "default" : "outline"}
                  disabled={status.isPending || c.status === s.status}
                  onClick={() => (s.status === "suspended" ? setPanel(panel === "suspend" ? null : "suspend") : status.mutate({ status: s.status }))}
                >
                  {s.label}
                </Button>
              ))}
            </div>
          ) : null}
          {panel === "suspend" && canEdit ? (
            <SuspendPanel busy={status.isPending} onCancel={() => setPanel(null)} onConfirm={(reason, clientMessage) => status.mutate({ status: "suspended", reason, clientMessage })} />
          ) : null}
        </div>
      </section>

      {/* Key numbers */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Stat label="الاشتراك" value={c.subscriptionStatus ? SUBSCRIPTION_STATUS_LABELS[c.subscriptionStatus] : "بدون"} sub={c.subscriptionFromAccount ? "من اشتراك الحساب" : c.subscriptionEndsOn ? `حتى ${c.subscriptionEndsOn}` : undefined} />
        <Stat label="إجمالي المدفوع" value={sarFmt(c.paidTotal)} numeric />
        <Stat label="المستخدمون" numeric value={String(c.users)} sub={`${p.branches.length} فرع`} />
        <Stat label="التدقيقات" numeric value={String(p.usage.audits)} sub={`${p.usage.uploads} ملف مرفوع`} />
        <Stat label="Tadqeeq AI" numeric value={String(p.usage.aiCalls30d)} sub="آخر 30 يوماً" />
        <Stat label="آخر دخول" value={ago(p.usage.lastLogin)} sub={p.usage.lastUpload ? `آخر رفع ${ago(p.usage.lastUpload)}` : "لم يرفع بعد"} />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-border">
        {TABS.map((t) => (
          <Link
            key={t.key}
            to="/ops/clients/$workspaceId"
            params={{ workspaceId }}
            search={t.key === "overview" ? {} : { tab: t.key }}
            className={`-mb-px inline-flex shrink-0 items-center gap-1.5 border-b-2 px-3 py-2.5 text-sm transition-colors ${tab === t.key ? "border-primary font-semibold text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {t.label}
            {counts[t.key] ? <span className="num rounded-full bg-muted px-1.5 text-[11px] text-muted-foreground">{counts[t.key]}</span> : null}
          </Link>
        ))}
      </div>

      {tab === "overview" ? <OverviewTab p={p} /> : null}
      {tab === "billing" ? <BillingTab p={p} /> : null}
      {tab === "team" ? <TeamTab p={p} /> : null}
      {tab === "audits" ? <AuditsTab p={p} /> : null}
      {tab === "activity" ? <ActivityTab p={p} /> : null}
      {tab === "notes" ? <NotesTab workspaceId={workspaceId} /> : null}
    </div>
  );
}

function SuspensionBanner({
  info,
  archived,
  canEdit,
  busy,
  onReactivate,
}: {
  info: SuspensionInfo;
  archived: boolean;
  canEdit: boolean;
  busy: boolean;
  onReactivate: () => void;
}) {
  return (
    <div className="mt-4 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
      <div className="flex flex-wrap items-start gap-3">
        <PauseCircle className="mt-0.5 size-5 shrink-0 text-destructive" />
        <div className="min-w-52 flex-1 space-y-1">
          <p className="font-semibold">
            الحساب موقوف{archived ? " ومؤرشف" : ""} · {SUSPENSION_REASONS[info.reason].label}
          </p>
          <p className="text-xs text-muted-foreground">
            {info.since ? `منذ ${fmtDateTime(info.since)} · ` : ""}كل الميزات متوقفة، ويرى العميل عند الدخول: «{SUSPENSION_REASONS[info.reason].title}»
          </p>
          {info.message ? <p className="text-xs">رسالتك للعميل: {info.message}</p> : null}
          {info.reactivationRequestedAt ? (
            <p className="flex items-center gap-1.5 pt-1 text-xs font-semibold text-primary-text">
              <BellRing className="size-3.5" /> طلب العميل إعادة التفعيل في {fmtDateTime(info.reactivationRequestedAt)}
            </p>
          ) : null}
        </div>
        {canEdit && !archived ? (
          <Button size="sm" disabled={busy} onClick={onReactivate}>
            إعادة التفعيل
          </Button>
        ) : null}
      </div>
    </div>
  );
}

function SuspendPanel({ busy, onCancel, onConfirm }: { busy: boolean; onCancel: () => void; onConfirm: (reason: SuspensionReason, message?: string) => void }) {
  const [reason, setReason] = useState<SuspensionReason>("payment");
  const [message, setMessage] = useState("");
  return (
    <div className="mt-3 space-y-3 rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm">
      <p className="font-semibold text-destructive">إيقاف الحساب وكل الميزات</p>
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        {(Object.keys(SUSPENSION_REASONS) as SuspensionReason[]).map((r) => (
          <label key={r} className="flex items-center gap-2">
            <input type="radio" name="suspend-reason" checked={reason === r} onChange={() => setReason(r)} />
            {SUSPENSION_REASONS[r].label}
          </label>
        ))}
      </div>
      <label className="block text-xs text-muted-foreground">
        رسالة تظهر للعميل (اختياري)
        <Input
          value={message}
          maxLength={500}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="مثلاً: انتهى اشتراكك في 5 أكتوبر — جدّد لإعادة فتح الحساب"
          className="mt-1 bg-background text-sm text-foreground"
        />
      </label>
      <div className="rounded-md border border-border bg-background p-3 text-xs">
        <p className="text-muted-foreground">ما سيراه العميل عند الدخول:</p>
        <p className="mt-1 font-semibold">{SUSPENSION_REASONS[reason].title}</p>
        <p className="mt-0.5 leading-5 text-muted-foreground">{SUSPENSION_REASONS[reason].body}</p>
      </div>
      <div className="flex gap-2">
        <Button size="sm" variant="destructive" disabled={busy} onClick={() => onConfirm(reason, message.trim() || undefined)}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <PauseCircle className="size-3.5" />}
          إيقاف الحساب
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>إلغاء</Button>
      </div>
    </div>
  );
}

function Stat({ label, value, sub, numeric = false }: { label: string; value: string; sub?: string; numeric?: boolean }) {
  return (
    <div className="panel p-3.5">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="mt-1 truncate text-lg font-bold">{numeric ? <span className="num">{value}</span> : value}</p>
      {sub ? <p className="truncate text-[11px] text-muted-foreground">{sub}</p> : null}
    </div>
  );
}

function Card({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="panel overflow-hidden">
      <header className="flex items-center justify-between gap-2 border-b border-border bg-muted/40 px-4 py-2.5">
        <h2 className="text-sm font-bold">{title}</h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Fields({ rows }: { rows: [string, ReactNode, boolean?][] }) {
  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {rows.map(([k, v, ltr]) => (
        <div key={k}>
          <dt className="text-[11px] text-muted-foreground">{k}</dt>
          <dd className="text-sm">{v === null || v === undefined || v === "" ? "—" : ltr ? <span className="num">{v}</span> : v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-6 text-center text-sm text-muted-foreground">{text}</p>;
}

function Table({ head, children }: { head: string[]; children: ReactNode }) {
  return (
    <div className="-m-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-muted-foreground">
          <tr>{head.map((h) => <th key={h} className="px-4 py-2.5 text-start font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

function OverviewTab({ p }: { p: OpsClientProfile }) {
  const c = p.client;
  const j = p.journey;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="بيانات الشركة">
        <Fields
          rows={[
            ["اسم الشركة في تدقيق", c.name],
            ["الاسم القانوني", c.legalName],
            ["العلامة التجارية", c.brandName],
            ["السجل التجاري", c.crNumber, true],
            ["الرقم الضريبي", c.vatNumber, true],
            ["عدد الفروع المصرّح به", c.branchCount],
          ]}
        />
      </Card>
      <Card title="جهة الاتصال">
        <Fields
          rows={[
            ["الاسم", c.contactName],
            ["الجوال", c.contactMobile, true],
            ["البريد", c.contactEmail, true],
            ["الهوية", c.contactNationalId, true],
            ["بريد المالك", c.ownerEmail, true],
          ]}
        />
      </Card>
      <Card title="رحلة العميل">
        <Fields
          rows={[
            ["التسجيل", fmtDateTime(j.signedUpAt)],
            ["إرسال البيانات", fmtDateTime(j.submittedAt)],
            ["موعد الاجتماع", fmtDateTime(j.meetingAt)],
            ["الدفع", fmtDateTime(j.paidAt)],
            ["التفعيل", fmtDateTime(j.activatedAt)],
            ["رفع التجربة", p.usage.trialUploads ? `${p.usage.trialUploads} ملف` : "لم يرفع"],
          ]}
        />
        {j.meetingNote ? <p className="mt-3 rounded-md bg-muted/50 p-2.5 text-sm">ملاحظة الاجتماع: {j.meetingNote}</p> : null}
      </Card>
      <Card title="الاشتراك الحالي" action={<Link to="/ops/clients/$workspaceId" params={{ workspaceId: c.workspaceId }} search={{ tab: "billing" }} className="text-xs underline underline-offset-4">التفاصيل</Link>}>
        <Fields
          rows={[
            ["الحالة", c.subscriptionStatus ? SUBSCRIPTION_STATUS_LABELS[c.subscriptionStatus] : "بدون اشتراك"],
            ["السعر", c.subscriptionPrice !== null ? `${sarFmt(c.subscriptionPrice)} ${CYCLE_LABELS[c.subscriptionCycle ?? "monthly"]}` : null],
            ["ينتهي في", c.subscriptionEndsOn],
            ["إجمالي المدفوع", sarFmt(c.paidTotal)],
          ]}
        />
        {c.adminNote ? <p className="mt-3 rounded-md bg-muted/50 p-2.5 text-sm">ملاحظة داخلية: {c.adminNote}</p> : null}
      </Card>
    </div>
  );
}

function BillingTab({ p }: { p: OpsClientProfile }) {
  const total = (p.payments ?? []).reduce((a, x) => a + x.amount, 0);
  return (
    <div className="space-y-4">
      <Card title="الاشتراكات" action={p.subscriptions ? <Link to="/ops/subscriptions" className="text-xs underline underline-offset-4">إدارة الاشتراكات</Link> : null}>
        {!p.subscriptions ? (
          <Empty text="دورك لا يسمح بعرض الاشتراكات." />
        ) : !p.subscriptions.length ? (
          <Empty text="لا يوجد اشتراك مسجّل لهذا العميل." />
        ) : (
          <Table head={["الباقة", "السعر", "الدورة", "الإضافات", "الحالة", "البداية", "النهاية", "ملاحظات"]}>
            {p.subscriptions.map((s, i) => (
              <tr key={s.id} className={`border-t border-border ${i === 0 ? "font-medium" : "text-muted-foreground"}`}>
                <td className="px-4 py-2.5">{s.planName ?? "مخصص"}{i === 0 ? <span className="ms-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] text-primary-text">الحالي</span> : null}</td>
                <td className="px-4 py-2.5"><span className="num">{sarFmt(s.price)}</span></td>
                <td className="px-4 py-2.5">{CYCLE_LABELS[s.cycle]}</td>
                <td className="px-4 py-2.5 text-xs">{PLAN_ADDONS.filter((a) => s.addons.includes(a.key)).map((a) => a.label).join("، ") || "—"}</td>
                <td className="px-4 py-2.5">{SUBSCRIPTION_STATUS_LABELS[s.status]}</td>
                <td className="px-4 py-2.5"><span className="num">{s.startsOn}</span></td>
                <td className="px-4 py-2.5"><span className="num">{s.endsOn ?? "—"}</span></td>
                <td className="px-4 py-2.5 text-xs">{s.notes ?? ""}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Card
        title={p.payments ? `المدفوعات · ${sarFmt(total)}` : "المدفوعات"}
        action={p.payments ? <Link to="/ops/payments" className="text-xs underline underline-offset-4">تسجيل دفعة</Link> : null}
      >
        {!p.payments ? (
          <Empty text="دورك لا يسمح بعرض المدفوعات." />
        ) : !p.payments.length ? (
          <Empty text="لا توجد مدفوعات مسجّلة." />
        ) : (
          <Table head={["التاريخ", "المبلغ", "المرجع", "ملاحظات", "الإيصال"]}>
            {p.payments.map((x) => (
              <tr key={x.id} className="border-t border-border">
                <td className="px-4 py-2.5"><span className="num">{x.paidOn}</span></td>
                <td className="px-4 py-2.5 font-medium"><span className="num">{sarFmt(x.amount)}</span></td>
                <td className="px-4 py-2.5">{x.reference ?? "—"}</td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">{x.notes ?? ""}</td>
                <td className="px-4 py-2.5">
                  {x.hasReceipt ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={async () => {
                        try {
                          const url = await getReceiptUrl({ data: { id: x.id } });
                          if (url) window.open(url, "_blank");
                        } catch (e) {
                          toast.error((e as Error).message);
                        }
                      }}
                    >
                      <Paperclip className="size-4" />
                    </Button>
                  ) : (
                    "—"
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function TeamTab({ p }: { p: OpsClientProfile }) {
  const qc = useQueryClient();
  const [resetFor, setResetFor] = useState<OpsClientProfile["members"][number] | null>(null);
  const reset = useMutation({
    mutationFn: (membershipId: string) => resetMemberTwoFactor({ data: { workspaceId: p.client.workspaceId, membershipId } }),
    onSuccess: () => {
      setResetFor(null);
      toast.success("تمت إعادة التعيين — يدخل المستخدم بكلمة المرور ويمكنه تفعيله من جديد.");
      void qc.invalidateQueries({ queryKey: ["ops-client", p.client.workspaceId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <div className="space-y-4">
      <OpsConfirm
        open={resetFor !== null}
        title={`إعادة تعيين التحقق بخطوتين لـ ${resetFor?.email ?? resetFor?.fullName ?? "المستخدم"}؟`}
        description="تأكد من هويته أولاً (اتصال من رقم الشركة المسجّل)."
        confirmLabel="إعادة تعيين"
        busy={reset.isPending}
        onConfirm={() => resetFor && reset.mutate(resetFor.id)}
        onCancel={() => setResetFor(null)}
      />
      <Card title={`المستخدمون (${p.members.length})`}>
        {!p.members.length ? (
          <Empty text="لا يوجد مستخدمون." />
        ) : (
          <Table head={["المستخدم", "الدور", "الحالة", "انضم", "آخر دخول", "التحقق بخطوتين"]}>
            {p.members.map((m) => (
              <tr key={m.id} className="border-t border-border">
                <td className="px-4 py-2.5">
                  <p className="font-medium">{m.fullName ?? m.email ?? "—"}{m.isOwner ? <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">المالك</span> : null}</p>
                  {m.fullName && m.email ? <p className="text-xs text-muted-foreground" dir="ltr" style={{ textAlign: "right" }}>{m.email}</p> : null}
                </td>
                <td className="px-4 py-2.5">{WORKSPACE_ROLE_LABELS[m.role as WorkspaceRole] ?? m.role}</td>
                <td className="px-4 py-2.5">{MEMBER_STATUS[m.status] ?? m.status}</td>
                <td className="px-4 py-2.5 text-xs">{fmtDate(m.joinedAt)}</td>
                <td className="px-4 py-2.5 text-xs">{m.lastLogin ? fmtDateTime(m.lastLogin) : "لم يدخل"}</td>
                <td className="px-4 py-2.5 text-xs">
                  {m.twoFactor ? (
                    <span className="flex items-center gap-2">
                      مفعّل
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reset.isPending}
                        onClick={() => setResetFor(m)}
                      >
                        إعادة تعيين
                      </Button>
                    </span>
                  ) : (
                    <span className="text-muted-foreground">غير مفعّل</span>
                  )}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
      <Card title={`الفروع (${p.branches.length})`}>
        {!p.branches.length ? (
          <Empty text="لم تُضف فروع بعد." />
        ) : (
          <Table head={["الفرع", "المنصات المربوطة", "الحالة"]}>
            {p.branches.map((b) => (
              <tr key={b.id} className="border-t border-border">
                <td className="px-4 py-2.5 font-medium">{b.name}</td>
                <td className="px-4 py-2.5">
                  <span className="flex items-center gap-1.5">
                    {b.hungerstation ? <PlatformIcon platform="hungerstation" /> : null}
                    {b.jahez ? <PlatformIcon platform="jahez" /> : null}
                    {b.keeta ? <PlatformIcon platform="keeta" /> : null}
                    {!b.hungerstation && !b.jahez && !b.keeta ? <span className="text-xs text-muted-foreground">غير مربوط</span> : null}
                  </span>
                </td>
                <td className="px-4 py-2.5 text-xs">{b.active ? "نشط" : "متوقف"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

function AuditsTab({ p }: { p: OpsClientProfile }) {
  return (
    <Card title={`الفترات المدققة (${p.periods.length})`}>
      {!p.periods.length ? (
        <Empty text="لم يرفع العميل أي فاتورة بعد." />
      ) : (
        <Table head={["المنصة", "الفترة", "من", "إلى", "رُفعت"]}>
          {p.periods.map((x) => (
            <tr key={x.id} className={`border-t border-border ${x.superseded ? "text-muted-foreground" : ""}`}>
              <td className="px-4 py-2.5"><PlatformName platform={x.platform} /></td>
              <td className="px-4 py-2.5">{x.label ?? "—"}{x.superseded ? <span className="ms-2 rounded bg-muted px-1.5 py-0.5 text-[10px]">أُعيد تحليلها</span> : null}</td>
              <td className="px-4 py-2.5"><span className="num">{x.start ?? "—"}</span></td>
              <td className="px-4 py-2.5"><span className="num">{x.end ?? "—"}</span></td>
              <td className="px-4 py-2.5 text-xs">{fmtDateTime(x.createdAt)}</td>
            </tr>
          ))}
        </Table>
      )}
    </Card>
  );
}

function ActivityTab({ p }: { p: OpsClientProfile }) {
  const [src, setSrc] = useState<"all" | "ops" | "client">("all");
  const rows = p.timeline.filter((e) => src === "all" || e.source === src);
  return (
    <Card
      title="سجل النشاط"
      action={
        <select className="h-8 rounded-md border border-input bg-background px-2 text-xs" value={src} onChange={(e) => setSrc(e.target.value as typeof src)}>
          <option value="all">الكل</option>
          <option value="ops">إجراءات فريق العمليات</option>
          <option value="client">إجراءات العميل</option>
        </select>
      }
    >
      {!rows.length ? (
        <Empty text="لا يوجد نشاط مسجّل." />
      ) : (
        <ol className="relative space-y-4 border-s border-border ps-5">
          {rows.map((e) => {
            const summary = opsEventSummary(e.action, e.details);
            return (
              <li key={e.id} className="relative">
                <span className={`absolute -start-[25px] top-1.5 size-2.5 rounded-full ring-4 ring-card ${e.source === "ops" ? "bg-primary" : "bg-foreground/40"}`} />
                <p className="text-sm">
                  <span className="font-semibold">{opsActionLabel(e.action)}</span>
                  {summary ? <span className="text-muted-foreground"> · {summary}</span> : null}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {fmtDateTime(e.createdAt)} · {e.source === "ops" ? "فريق العمليات" : "العميل"} · <span dir="ltr">{e.actor}</span>
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </Card>
  );
}

function NotesTab({ workspaceId }: { workspaceId: string }) {
  const qc = useQueryClient();
  const [note, setNote] = useState("");
  const notes = useQuery({ queryKey: ["ops-notes", workspaceId], queryFn: () => listClientNotes({ data: { workspaceId } }) });
  const add = useMutation({
    mutationFn: () => addClientNote({ data: { workspaceId, body: note } }),
    onSuccess: () => {
      setNote("");
      void qc.invalidateQueries({ queryKey: ["ops-notes", workspaceId] });
      void qc.invalidateQueries({ queryKey: ["ops-client", workspaceId] });
    },
    onError: (e) => toast.error((e as Error).message),
  });
  return (
    <Card title="ملاحظات الفريق">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (note.trim()) add.mutate();
        }}
      >
        <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="أضف ملاحظة عن المكالمة أو الاجتماع أو الاتفاق…" />
        <Button type="submit" disabled={!note.trim() || add.isPending}>إضافة</Button>
      </form>
      {notes.isLoading ? (
        <Loader2 className="mt-4 size-4 animate-spin" />
      ) : !notes.data?.length ? (
        <Empty text="لا توجد ملاحظات بعد." />
      ) : (
        <ul className="mt-4 space-y-2">
          {notes.data.map((n) => (
            <li key={n.id} className="rounded-md bg-muted/50 p-3 text-sm">
              <p className="whitespace-pre-wrap leading-6">{n.body}</p>
              <p className="mt-1 text-[11px] text-muted-foreground"><span dir="ltr">{n.author}</span> · {fmtDateTime(n.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
