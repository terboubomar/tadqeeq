import { useMutation, useQueryClient } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AlarmClock, Check, Download, Eye, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { COMPENSATION_CASES_KEY, formatTimestamp, useCompensationCases } from "@/components/compensation/queries";
import { CompHeader, DraftBox, Field, StatusBadge, Timestamp } from "@/components/compensation/shared";
import { useWorkspaceAccess } from "@/components/WorkspaceAccessProvider";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { deleteCompensationCase, saveCompensationCase } from "@/lib/compensation-evidence.functions";
import type { CompensationCaseRecord } from "@/lib/compensation-evidence.server";
import {
  CASE_STATUSES,
  CASE_WORKFLOW,
  caseFollowUp,
  caseRecoveredAmount,
  caseStatusLabel,
  isCaseRecovered,
  nextCaseActions,
  readCaseWorkflow,
  PLATFORM_LABELS,
  platformLabel,
  type CompensationCaseStatus,
  type CompensationPlatformKey,
} from "@/lib/compensation-overview";
import { exportXlsx } from "@/lib/export";
import { count, money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { PlatformName } from "@/components/brand/PlatformLogo";

export const Route = createFileRoute("/compensation/cases")({
  validateSearch: (search: Record<string, unknown>): { followup?: boolean; open?: string } => ({
    followup: search["followup"] === true || search["followup"] === "1" || search["followup"] === "true" ? true : undefined,
    open: typeof search["open"] === "string" ? search["open"] : undefined,
  }),
  component: CasesPage,
});

/** Quick actions that need an amount or a reason open the case instead of saving blind. */
const NEEDS_DETAILS = new Set<CompensationCaseStatus>(["recovered", "rejected"]);

const PAGE_SIZE = 25;

function CasesPage() {
  const { can, context } = useWorkspaceAccess();
  const queryClient = useQueryClient();
  const cases = useCompensationCases();
  const [status, setStatus] = useState<CompensationCaseStatus | "all">("all");
  const [platform, setPlatform] = useState<CompensationPlatformKey | "all">("all");
  const [branch, setBranch] = useState("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const search = Route.useSearch();
  const [followUpOnly, setFollowUpOnly] = useState(Boolean(search.followup));
  const [dialog, setDialog] = useState<{ id: string; mode: "view" | "edit" } | null>(
    search.open ? { id: search.open, mode: "view" } : null,
  );
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const canManage = can("compensation.manage");
  const canDelete = canManage && ["owner", "admin", "auditor"].includes(context.role);
  const updateCase = useUpdateCase();
  const removeCase = useMutation({
    mutationFn: (id: string) => deleteCompensationCase({ data: { id } }),
    onSuccess: async () => {
      toast.success("تم حذف الحالة");
      setDeleteId(null);
      setDialog(null);
      await queryClient.invalidateQueries({ queryKey: COMPENSATION_CASES_KEY });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const rows = useMemo(() => cases.data ?? [], [cases.data]);
  const branches = useMemo(
    () => [...new Set(rows.map((r) => r.branchName).filter((b): b is string => Boolean(b)))].sort(),
    [rows],
  );
  const baseFiltered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (r) =>
        (platform === "all" || r.platform === platform) &&
        (branch === "all" || r.branchName === branch) &&
        (!q ||
          r.orderNumber.toLowerCase().includes(q) ||
          (r.branchName ?? "").toLowerCase().includes(q) ||
          (r.aggregatorCaseReference ?? "").toLowerCase().includes(q) ||
          r.compensationReason.toLowerCase().includes(q)),
    );
  }, [rows, platform, branch, query]);
  const followUpCount = baseFiltered.filter((r) => caseFollowUp(r)).length;
  const filtered = baseFiltered.filter(
    (r) => (status === "all" || r.status === status) && (!followUpOnly || caseFollowUp(r)),
  );
  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);
  const open = dialog ? rows.find((r) => r.id === dialog.id) ?? null : null;
  const toDelete = deleteId ? rows.find((r) => r.id === deleteId) ?? null : null;

  const tabCount = (s: CompensationCaseStatus | "all") =>
    s === "all" ? baseFiltered.length : baseFiltered.filter((r) => r.status === s).length;

  function exportRows() {
    exportXlsx(
      [
        {
          name: "حالات التعويض",
          rows: filtered.map((r) => ({
            orderNumber: r.orderNumber,
            platform: platformLabel(r.platform),
            branch: r.branchName ?? "",
            reason: r.compensationReason,
            amount: r.compensationAmount,
            recovered: caseRecoveredAmount(r),
            status: caseStatusLabel(r.status),
            rejectionReason: readCaseWorkflow(r.auditContext).rejectionReason ?? "",
            followUp: caseFollowUp(r)?.label ?? "",
            reference: r.aggregatorCaseReference ?? "",
            createdAt: formatTimestamp(r.createdAt),
            updatedAt: formatTimestamp(r.updatedAt),
          })),
          columns: [
            { key: "orderNumber", header: "رقم الطلب" },
            { key: "platform", header: "المنصة" },
            { key: "branch", header: "الفرع" },
            { key: "reason", header: "السبب" },
            { key: "amount", header: "المبلغ", type: "money" },
            { key: "recovered", header: "المسترَد فعلياً", type: "money" },
            { key: "status", header: "الحالة" },
            { key: "rejectionReason", header: "سبب الرفض" },
            { key: "followUp", header: "المتابعة" },
            { key: "reference", header: "مرجع المنصة" },
            { key: "createdAt", header: "تاريخ الإنشاء" },
            { key: "updatedAt", header: "آخر تحديث" },
          ],
        },
      ],
      "tadqeeq-compensation-cases",
    );
  }

  return (
    <div>
      <CompHeader title="الحالات" sub="كل طلب تعويض من المسودة حتى الاسترداد">
        <Button type="button" variant="outline" size="sm" disabled={!filtered.length} onClick={exportRows}>
          <Download className="size-4" />
          تصدير Excel
        </Button>
        {can("compensation.manage") ? (
          <Link
            to="/compensation/evidence"
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-ink px-3 text-xs font-semibold text-ink-foreground"
          >
            <Plus className="size-4" />
            حالة جديدة
          </Link>
        ) : null}
      </CompHeader>

      <div role="tablist" aria-label="حالة الطلب" className="flex gap-1.5 overflow-x-auto pb-1">
        {(["all", ...CASE_STATUSES] as const).map((s) => (
          <button
            key={s}
            type="button"
            role="tab"
            aria-selected={status === s}
            onClick={() => {
              setStatus(s);
              setPage(0);
            }}
            className={cn(
              "shrink-0 rounded-full border px-3.5 py-1.5 text-[13px] transition-colors",
              status === s
                ? "border-ink bg-ink font-semibold text-ink-foreground"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {s === "all" ? "الكل" : caseStatusLabel(s)}{" "}
            <span className={cn("num", status === s ? "text-ink-muted" : "text-muted-foreground")}>{count(tabCount(s))}</span>
          </button>
        ))}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 rounded-xl border border-border bg-card p-1.5">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            aria-label="بحث"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(0);
            }}
            placeholder="ابحث برقم الطلب أو الفرع أو مرجع المنصة"
            className="border-0 bg-transparent ps-9 shadow-none"
          />
        </div>
        <select
          aria-label="المنصة"
          value={platform}
          onChange={(e) => {
            setPlatform(e.target.value as CompensationPlatformKey | "all");
            setPage(0);
          }}
          className="h-9 rounded-md border border-input bg-card px-3 text-sm"
        >
          <option value="all">كل المنصات</option>
          {(Object.keys(PLATFORM_LABELS) as CompensationPlatformKey[]).map((p) => (
            <option key={p} value={p}>
              {PLATFORM_LABELS[p]}
            </option>
          ))}
        </select>
        <select
          aria-label="الفرع"
          value={branch}
          onChange={(e) => {
            setBranch(e.target.value);
            setPage(0);
          }}
          className="h-9 rounded-md border border-input bg-card px-3 text-sm"
        >
          <option value="all">كل الفروع</option>
          {branches.map((b) => (
            <option key={b} value={b}>
              {b}
            </option>
          ))}
        </select>
        <button
          type="button"
          aria-pressed={followUpOnly}
          onClick={() => {
            setFollowUpOnly((v) => !v);
            setPage(0);
          }}
          className={cn(
            "inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm transition-colors",
            followUpOnly
              ? "border-warning bg-warning/15 font-semibold text-warning"
              : "border-input bg-card text-muted-foreground hover:text-foreground",
          )}
        >
          <AlarmClock className="size-4" />
          تحتاج متابعة <span className="num">{count(followUpCount)}</span>
        </button>
      </div>

      <section className="mt-3 overflow-hidden rounded-2xl border border-border bg-card">
        {cases.isLoading ? (
          <div className="p-8">
            <Spinner className="size-5 text-muted-foreground" />
          </div>
        ) : cases.error ? (
          <p className="p-6 text-sm text-destructive">{(cases.error as Error).message}</p>
        ) : visible.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">لا توجد حالات مطابقة.</p>
        ) : (
          <>
          <ul className="divide-y divide-border/70 md:hidden">
            {visible.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setDialog({ id: r.id, mode: "view" })}
                  className="flex w-full items-center gap-3 px-4 py-3 text-start"
                >
                  <span className="min-w-0 flex-1">
                    <span className="num block font-semibold" dir="ltr">
                      {r.orderNumber}
                    </span>
                    <span className="mt-0.5 block truncate text-[12px] text-muted-foreground">
                      {[PLATFORM_LABELS[r.platform], r.branchName || "—", r.evidenceId ? "دليل مرفق" : "بلا دليل"].join(" · ")}
                    </span>
                    <FollowUpNote item={r} />
                  </span>
                  <span className="flex shrink-0 flex-col items-end gap-1">
                    <span className="num text-[13px] font-semibold">{money(r.compensationAmount)}</span>
                    <StatusBadge status={r.status} />
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[1100px] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 text-start font-medium">رقم الطلب</th>
                  <th className="px-2 py-3 text-start font-medium">المنصة</th>
                  <th className="px-2 py-3 text-start font-medium">الفرع</th>
                  <th className="px-2 py-3 text-start font-medium">السبب</th>
                  <th className="px-2 py-3 text-start font-medium">المبلغ</th>
                  <th className="px-2 py-3 text-start font-medium">الدليل</th>
                  <th className="px-2 py-3 text-start font-medium">الحالة</th>
                  <th className="px-2 py-3 text-start font-medium">آخر تحديث</th>
                  <th className="px-2 py-3 text-start font-medium">الخطوة التالية</th>
                  <th className="px-4 py-3 text-end font-medium">إجراءات</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((r) => (
                  <tr key={r.id} className="border-t border-border/70 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setDialog({ id: r.id, mode: "view" })}
                        className="num font-semibold text-foreground underline-offset-4 hover:underline"
                        dir="ltr"
                      >
                        {r.orderNumber}
                      </button>
                    </td>
                    <td className="whitespace-nowrap px-2"><PlatformName platform={r.platform} /></td>
                    <td className="whitespace-nowrap px-2">{r.branchName || "—"}</td>
                    <td className="max-w-[180px] truncate px-2" title={r.compensationReason}>
                      {r.compensationReason}
                    </td>
                    <td className="whitespace-nowrap px-2">
                      <span className="num">{money(r.compensationAmount)}</span>
                      {isCaseRecovered(r) && caseRecoveredAmount(r) < r.compensationAmount ? (
                        <span className="block text-[11px] text-warning">
                          استُرد <span className="num">{money(caseRecoveredAmount(r))}</span>
                        </span>
                      ) : null}
                    </td>
                    <td className={cn("whitespace-nowrap px-2", r.evidenceId ? "text-success" : "text-muted-foreground")}>
                      {r.evidenceId ? "مرفق" : "لا يوجد"}
                    </td>
                    <td className="w-[150px] px-2 py-2.5">
                      <StatusBadge status={r.status} />
                      <FollowUpNote item={r} />
                    </td>
                    <td className="px-2 text-xs text-muted-foreground"><Timestamp value={r.updatedAt} /></td>
                    <td className="px-2">
                      {canManage && nextCaseActions(r.status)[0] ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-7 text-xs"
                          disabled={updateCase.isPending}
                          onClick={() => {
                            const next = nextCaseActions(r.status)[0]!.status;
                            if (NEEDS_DETAILS.has(next)) setDialog({ id: r.id, mode: "view" });
                            else updateCase.mutate({ item: r, patch: { status: next } });
                          }}
                        >
                          <Check className="size-3.5" />
                          {nextCaseActions(r.status)[0]!.label}
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4">
                      <div className="flex justify-end gap-1">
                        <IconAction label="عرض" onClick={() => setDialog({ id: r.id, mode: "view" })}>
                          <Eye className="size-4" />
                        </IconAction>
                        {canManage ? (
                          <IconAction label="تعديل" onClick={() => setDialog({ id: r.id, mode: "edit" })}>
                            <Pencil className="size-4" />
                          </IconAction>
                        ) : null}
                        {canDelete ? (
                          <IconAction label="حذف" danger onClick={() => setDeleteId(r.id)}>
                            <Trash2 className="size-4" />
                          </IconAction>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          </>
        )}
        {filtered.length > PAGE_SIZE ? (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-xs text-muted-foreground">
            <span className="num">
              عرض {safePage * PAGE_SIZE + 1}–{Math.min(filtered.length, (safePage + 1) * PAGE_SIZE)} من {count(filtered.length)}
            </span>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="outline" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
                السابق
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={safePage >= pages - 1}
                onClick={() => setPage(safePage + 1)}
              >
                التالي
              </Button>
            </div>
          </div>
        ) : null}
      </section>

      <Dialog open={Boolean(open)} onOpenChange={(v) => !v && setDialog(null)}>
        <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
          {open && dialog?.mode === "edit" ? (
            <CaseEdit key={open.id + "-edit"} item={open} onDone={() => setDialog({ id: open.id, mode: "view" })} />
          ) : open ? (
            <CaseView
              key={open.id}
              item={open}
              canManage={canManage}
              canDelete={canDelete}
              onEdit={() => setDialog({ id: open.id, mode: "edit" })}
              onDelete={() => setDeleteId(open.id)}
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <AlertDialog open={Boolean(toDelete)} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-start">حذف حالة التعويض؟</AlertDialogTitle>
            <AlertDialogDescription className="text-start">
              سيتم حذف الحالة للطلب <span className="num font-semibold" dir="ltr">{toDelete?.orderNumber}</span> نهائياً،
              ولا يمكن التراجع. الدليل المرفق من Telegram لن يُحذف.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:justify-start">
            <AlertDialogCancel disabled={removeCase.isPending}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              disabled={removeCase.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (toDelete) removeCase.mutate(toDelete.id);
              }}
              aria-busy={removeCase.isPending}
            >
              {removeCase.isPending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type CasePatch = Partial<{
  platform: CompensationPlatformKey;
  branchName: string | null;
  compensationAmount: number;
  compensationReason: string;
  employeeExplanation: string;
  status: CompensationCaseStatus;
  aggregatorCaseReference: string | null;
  recoveredAmount: number | null;
  statusNote: string | null;
}>;

function useUpdateCase(onSuccess?: () => void) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ item, patch }: { item: CompensationCaseRecord; patch: CasePatch }) => {
      const platform = patch.platform ?? (item.platform as CompensationPlatformKey);
      return saveCompensationCase({
        data: {
          id: item.id,
          // A platform change detaches the audit period, which belongs to one platform.
          periodId: platform === item.platform ? item.periodId : null,
          evidenceId: item.evidenceId,
          platform,
          orderNumber: item.orderNumber,
          branchName: patch.branchName !== undefined ? patch.branchName : item.branchName,
          compensationAmount: patch.compensationAmount ?? item.compensationAmount,
          compensationReason: patch.compensationReason ?? item.compensationReason,
          employeeExplanation: patch.employeeExplanation ?? item.employeeExplanation,
          status: patch.status ?? (item.status as CompensationCaseStatus),
          aggregatorCaseReference:
            patch.aggregatorCaseReference !== undefined ? patch.aggregatorCaseReference : item.aggregatorCaseReference,
          recoveredAmount: patch.recoveredAmount ?? null,
          statusNote: patch.statusNote ?? null,
        },
      });
    },
    onSuccess: async (result) => {
      toast.success("تم الحفظ · " + caseStatusLabel(result.status));
      await queryClient.invalidateQueries({ queryKey: COMPENSATION_CASES_KEY });
      onSuccess?.();
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

function CaseView({
  item,
  canManage,
  canDelete,
  onEdit,
  onDelete,
}: {
  item: CompensationCaseRecord;
  canManage: boolean;
  canDelete: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const update = useUpdateCase(() => setPending(null));
  const [reference, setReference] = useState(item.aggregatorCaseReference ?? "");
  const [pending, setPending] = useState<CompensationCaseStatus | null>(null);
  const [recovered, setRecovered] = useState(String(item.compensationAmount));
  const [note, setNote] = useState("");
  const actions = nextCaseActions(item.status);
  const stepIndex = CASE_WORKFLOW.indexOf(item.status as CompensationCaseStatus);
  const workflow = readCaseWorkflow(item.auditContext);
  const followUp = caseFollowUp(item);
  const paid = caseRecoveredAmount(item);

  function confirmPending() {
    if (!pending) return;
    if (pending === "recovered") {
      const value = Number(recovered.replace(/,/g, ""));
      if (!Number.isFinite(value) || value < 0 || value > item.compensationAmount) {
        toast.error("أدخل المبلغ المسترَد فعلياً (من 0 حتى مبلغ المطالبة).");
        return;
      }
      update.mutate({
        item,
        patch: { status: "recovered", recoveredAmount: value, aggregatorCaseReference: reference.trim() || null },
      });
      return;
    }
    update.mutate({
      item,
      patch: { status: pending, statusNote: note.trim() || null, aggregatorCaseReference: reference.trim() || null },
    });
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex flex-wrap items-center gap-3 text-start">
          <span className="num" dir="ltr">
            {item.orderNumber}
          </span>
          <StatusBadge status={item.status} />
        </DialogTitle>
      </DialogHeader>

      <ol aria-label="مراحل الحالة" className="flex flex-wrap items-center gap-1.5 text-xs">
        {CASE_WORKFLOW.map((step, index) => {
          const done = stepIndex >= 0 && index < stepIndex;
          const current = step === item.status;
          return (
            <li key={step} className="flex items-center gap-1.5">
              <span
                className={cn(
                  "rounded-full px-2.5 py-1",
                  "inline-flex items-center gap-1",
                  current
                    ? "bg-ink font-semibold text-ink-foreground"
                    : done
                      ? "bg-success/15 text-success"
                      : "bg-muted text-muted-foreground",
                )}
              >
                {done ? <Check className="size-3" /> : null}
                {caseStatusLabel(step)}
              </span>
              {index < CASE_WORKFLOW.length - 1 ? <span className="text-muted-foreground">←</span> : null}
            </li>
          );
        })}
        {item.status === "rejected" || item.status === "closed" ? (
          <li className="ms-2">
            <StatusBadge status={item.status} />
          </li>
        ) : null}
      </ol>

      {canManage && actions.length ? (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-xs font-semibold text-muted-foreground">الخطوة التالية</p>
          {item.status === "ready" || item.status === "submitted" ? (
            <label className="mt-2 block">
              <span className="text-xs text-muted-foreground">مرجع الحالة لدى المنصة (اختياري)</span>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                dir="ltr"
                className="mt-1 bg-card"
                placeholder="مثال: CS-102938"
              />
            </label>
          ) : null}
          <div className="mt-3 flex flex-wrap gap-2">
            {actions.map((action) => {
              // Spin only the action actually clicked; when an action needs extra
              // details the confirm button in the panel below owns the spinner.
              const running =
                update.isPending && !pending && update.variables?.patch.status === action.status;
              return (
                <Button
                  key={action.status}
                  type="button"
                  size="sm"
                  variant={action.tone === "primary" ? "default" : "outline"}
                  className={cn(
                    action.tone === "good" && "border-success/40 text-success hover:bg-success/10",
                    action.tone === "bad" && "border-destructive/40 text-destructive hover:bg-destructive/10",
                  )}
                  disabled={update.isPending}
                  aria-pressed={pending === action.status}
                  onClick={() => {
                    if (NEEDS_DETAILS.has(action.status)) {
                      setPending(action.status);
                      return;
                    }
                    update.mutate({
                      item,
                      patch: { status: action.status, aggregatorCaseReference: reference.trim() || null },
                    });
                  }}
                  aria-busy={running}
                >
                  {running ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {action.label}
                </Button>
              );
            })}
          </div>
          {pending ? (
            <div className="mt-3 space-y-2 rounded-md border border-border bg-card p-3">
              {pending === "recovered" ? (
                <label className="block">
                  <span className="text-xs font-semibold">المبلغ المسترَد فعلياً من المنصة (ر.س)</span>
                  <Input
                    value={recovered}
                    onChange={(e) => setRecovered(e.target.value)}
                    inputMode="decimal"
                    dir="ltr"
                    className="mt-1"
                    autoFocus
                  />
                  <span className="mt-1 block text-[11px] text-muted-foreground">
                    المطالَب <span className="num">{money(item.compensationAmount)}</span> ر.س. عدّله إذا كان الاسترداد جزئياً.
                  </span>
                </label>
              ) : (
                <label className="block">
                  <span className="text-xs font-semibold">سبب الرفض كما ذكرته المنصة (اختياري)</span>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    rows={2}
                    autoFocus
                    className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                    placeholder="مثال: الدليل غير واضح، انتهت مدة الاعتراض"
                  />
                </label>
              )}
              <div className="flex gap-2">
                <Button type="button" size="sm" disabled={update.isPending} onClick={confirmPending} aria-busy={update.isPending}>
                  {update.isPending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                  {pending === "recovered" ? "تأكيد الاسترداد" : "تأكيد الرفض"}
                </Button>
                <Button type="button" size="sm" variant="ghost" disabled={update.isPending} onClick={() => setPending(null)}>
                  إلغاء
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {followUp ? (
        <p className="flex items-center gap-2 rounded-lg bg-warning/12 px-3 py-2 text-sm font-semibold text-warning">
          <AlarmClock className="size-4" />
          {followUp.label}
        </p>
      ) : null}

      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <Info label="المنصة" value={<PlatformName platform={item.platform} />} />
        <Info label="الفرع" value={item.branchName || "—"} />
        <Info label="المبلغ" value={`${money(item.compensationAmount)} ر.س`} />
        <Info label="مرجع المنصة" value={item.aggregatorCaseReference || "—"} />
        <Info label="تاريخ الإنشاء" value={formatTimestamp(item.createdAt)} />
        <Info label="آخر تحديث" value={formatTimestamp(item.updatedAt)} />
        <Info label="الدليل" value={item.evidenceId ? "مرفق" : "لا يوجد"} />
        {isCaseRecovered(item) ? (
          <Info
            label="المسترَد فعلياً"
            value={
              <span className={paid < item.compensationAmount ? "text-warning" : "text-success"}>
                {money(paid)} ر.س
              </span>
            }
          />
        ) : null}
      </dl>
      {workflow.rejectionReason ? (
        <p className="rounded-lg bg-destructive/8 px-3 py-2 text-sm">
          <span className="font-semibold text-destructive">سبب الرفض: </span>
          {workflow.rejectionReason}
        </p>
      ) : null}
      {workflow.history.length ? (
        <div>
          <p className="text-xs font-semibold text-muted-foreground">سجل الحالة</p>
          <ol className="mt-2 space-y-2 border-s border-border ps-4 text-sm">
            {[...workflow.history].reverse().map((entry, index) => (
              <li
                key={entry.at + index}
                className="relative flex flex-wrap items-baseline gap-x-2 before:absolute before:-start-[21px] before:top-1.5 before:size-2.5 before:rounded-full before:border-2 before:border-card before:bg-border first:before:bg-primary"
              >
                <span className="font-semibold">{caseStatusLabel(entry.status)}</span>
                <Timestamp value={entry.at} className="text-xs text-muted-foreground" />
                {entry.note ? <span className="w-full text-xs text-muted-foreground">{entry.note}</span> : null}
              </li>
            ))}
          </ol>
        </div>
      ) : null}
      <div className="text-sm">
        <p className="text-xs font-semibold text-muted-foreground">السبب</p>
        <p className="mt-1">{item.compensationReason}</p>
        <p className="mt-3 text-xs font-semibold text-muted-foreground">شرح الموظف</p>
        <p className="mt-1 whitespace-pre-wrap">{item.employeeExplanation}</p>
      </div>
      <div className="grid gap-3 lg:grid-cols-2">
        <DraftBox title="العربية" value={item.draftAr} />
        <DraftBox title="English" value={item.draftEn} dir="ltr" />
      </div>
      {canManage || canDelete ? (
        <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-3">
          {canDelete ? (
            <Button type="button" variant="outline" className="text-destructive" onClick={onDelete}>
              <Trash2 className="size-4" />
              حذف
            </Button>
          ) : null}
          {canManage ? (
            <Button type="button" onClick={onEdit}>
              <Pencil className="size-4" />
              تعديل
            </Button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}

function CaseEdit({ item, onDone }: { item: CompensationCaseRecord; onDone: () => void }) {
  const update = useUpdateCase(onDone);
  const [platform, setPlatform] = useState(item.platform as CompensationPlatformKey);
  const [branchName, setBranchName] = useState(item.branchName ?? "");
  const [amount, setAmount] = useState(String(item.compensationAmount));
  const [reason, setReason] = useState(item.compensationReason);
  const [explanation, setExplanation] = useState(item.employeeExplanation);
  const [status, setStatus] = useState(item.status as CompensationCaseStatus);
  const [reference, setReference] = useState(item.aggregatorCaseReference ?? "");

  function submit(event: FormEvent) {
    event.preventDefault();
    const compensationAmount = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(compensationAmount) || compensationAmount < 0) {
      toast.error("أدخل مبلغ تعويض صالحاً.");
      return;
    }
    update.mutate({
      item,
      patch: {
        platform,
        branchName: branchName.trim() || null,
        compensationAmount,
        compensationReason: reason,
        employeeExplanation: explanation,
        status,
        aggregatorCaseReference: reference.trim() || null,
      },
    });
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <DialogHeader>
        <DialogTitle className="text-start">
          تعديل الحالة <span className="num" dir="ltr">{item.orderNumber}</span>
        </DialogTitle>
      </DialogHeader>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="المنصة">
          <select
            value={platform}
            onChange={(e) => setPlatform(e.target.value as CompensationPlatformKey)}
            className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
          >
            {(Object.keys(PLATFORM_LABELS) as CompensationPlatformKey[]).map((p) => (
              <option key={p} value={p}>
                {PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="الفرع">
          <Input value={branchName} onChange={(e) => setBranchName(e.target.value)} />
        </Field>
        <Field label="المبلغ (ر.س)">
          <Input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" dir="ltr" />
        </Field>
        <Field label="الحالة">
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as CompensationCaseStatus)}
            className="h-9 w-full rounded-md border border-input bg-card px-3 text-sm"
          >
            {CASE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {caseStatusLabel(s)}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="سبب التعويض">
        <Input value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
      <Field label="مرجع الحالة لدى المنصة">
        <Input value={reference} onChange={(e) => setReference(e.target.value)} dir="ltr" placeholder="اختياري" />
      </Field>
      <label className="block">
        <span className="text-xs font-semibold text-muted-foreground">شرح الموظف</span>
        <textarea
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          rows={4}
          className="mt-2 w-full rounded-md border border-input bg-background px-3 py-2 text-sm outline-none focus:border-primary"
        />
      </label>
      <p className="text-xs text-muted-foreground">تُعاد كتابة رسالة الاعتراض تلقائياً بعد الحفظ.</p>
      <div className="flex justify-end gap-2 border-t border-border pt-3">
        <Button type="button" variant="outline" onClick={onDone} disabled={update.isPending}>
          إلغاء
        </Button>
        <Button type="submit" disabled={update.isPending || !reason.trim() || !explanation.trim()} aria-busy={update.isPending}>
          {update.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
          حفظ التعديلات
        </Button>
      </div>
    </form>
  );
}

function IconAction({
  label,
  danger = false,
  onClick,
  children,
}: {
  label: string;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cn(
        "grid size-8 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        danger && "hover:bg-destructive/10 hover:text-destructive",
      )}
    >
      {children}
    </button>
  );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 font-semibold">{value}</dd>
    </div>
  );
}

function FollowUpNote({ item }: { item: CompensationCaseRecord }) {
  const followUp = caseFollowUp(item);
  if (!followUp) return null;
  return (
    <span className="mt-1 flex items-start gap-1 text-[11px] font-semibold leading-4 text-warning">
      <AlarmClock className="mt-0.5 size-3 shrink-0" />
      {followUp.label}
    </span>
  );
}
