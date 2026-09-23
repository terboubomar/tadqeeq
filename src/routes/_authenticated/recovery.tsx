import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  BadgeDollarSign,
  CheckCircle2,
  CircleDollarSign,
  Paperclip,
  Search,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { StatCard } from "@/components/StatCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  EXCEPTION_STATUS_LABELS,
  type AuditException,
  type ExceptionStatus,
  type ExceptionWorkflowEntry,
} from "@/lib/exceptions";
import { arabicDate, sar } from "@/lib/format";
import { listPeriods, updateExceptionWorkflow } from "@/lib/periods";
import {
  getRecoveryDocuments,
  uploadRecoveryDocument,
} from "@/lib/recovery-claim.functions";
import type { RecoveryDocumentRecord } from "@/lib/recovery-claim";
import {
  buildRecoveryCandidates,
  recoveryOutstanding,
  summarizeRecovery,
} from "@/lib/recovery";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/recovery")({
  head: () => ({
    meta: [
      { title: "مركز الاسترداد · تدقيق" },
      {
        name: "description",
        content:
          "متابعة الفروقات القابلة للاسترداد من الاكتشاف حتى الاعتراض وتأكيد المبلغ المسترد.",
      },
    ],
  }),
  component: RecoveryPage,
});

type WorkflowMutation = {
  periodId: string;
  exceptionId: string;
  patch: Partial<ExceptionWorkflowEntry>;
};

function RecoveryPage() {
  const queryClient = useQueryClient();
  const [query, setQuery] = useState("");
  const [platform, setPlatform] = useState("all");
  const [status, setStatus] = useState("open");

  const periodsQuery = useQuery({
    queryKey: ["periods"],
    queryFn: listPeriods,
  });

  const documentsQuery = useQuery({
    queryKey: ["recovery-documents"],
    queryFn: () => getRecoveryDocuments({ data: {} }),
  });

  const uploadDocument = useMutation({
    mutationFn: ({
      periodId,
      exceptionId,
      file,
    }: {
      periodId: string;
      exceptionId: string;
      file: File;
    }) => {
      const formData = new FormData();
      formData.set("periodId", periodId);
      formData.set("exceptionId", exceptionId);
      formData.set("file", file);
      return uploadRecoveryDocument({ data: formData });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["recovery-documents"] });
      toast.success("تم حفظ مستند المطالبة");
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const updateWorkflow = useMutation({
    mutationFn: ({ periodId, exceptionId, patch }: WorkflowMutation) =>
      updateExceptionWorkflow(periodId, exceptionId, patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["periods"] });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const cases = useMemo(
    () => buildRecoveryCandidates(periodsQuery.data ?? []),
    [periodsQuery.data],
  );
  const summary = useMemo(() => summarizeRecovery(cases), [cases]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();

    return cases.filter((item) => {
      if (platform !== "all" && item.platform !== platform) return false;
      if (
        status === "open" &&
        (item.status === "closed" || item.status === "recovered")
      ) {
        return false;
      }
      if (status !== "all" && status !== "open" && item.status !== status) {
        return false;
      }

      if (!needle) return true;
      return [
        item.id,
        item.periodLabel,
        item.branch,
        item.branchId,
        item.categoryLabel,
        item.label,
        item.note,
        item.claimReference,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(needle));
    });
  }, [cases, platform, query, status]);

  if (periodsQuery.isLoading) {
    return (
      <p className="py-20 text-center text-sm text-muted-foreground">
        جارٍ تحميل حالات الاسترداد…
      </p>
    );
  }

  if (periodsQuery.error) {
    return (
      <div className="rounded-[10px] border border-destructive/30 bg-destructive/[0.04] p-4 text-sm text-destructive">
        {periodsQuery.error instanceof Error
          ? periodsQuery.error.message
          : "تعذّر تحميل حالات الاسترداد."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="audit-heading">مركز الاسترداد</h1>
        <p className="audit-subtitle max-w-3xl">
          قائمة موحدة عبر كل الفترات للفروقات ذات اتجاه مالي قابل للاسترداد.
          الأرقام مصدرها محرك التدقيق، بينما الحالة والمبلغ المسترد يبقيان قراراً
          بشرياً ومسجلين في سجل الاستثناءات.
        </p>
      </header>

      <section className="audit-kpi-strip grid gap-0 sm:grid-cols-2 xl:grid-cols-4 [&>*]:rounded-none [&>*]:border-0 [&>*]:border-s [&>*]:border-border/70 [&>*:first-child]:border-s-0">
        <StatCard
          label="حالات مفتوحة"
          value={String(summary.openCount)}
          hint={summary.caseCount + " حالة في قائمة الاسترداد"}
          icon={ShieldCheck}
          tone={summary.openCount ? "negative" : "default"}
        />
        <StatCard
          label="استرداد محتمل"
          value={sar(summary.potentialRecovery)}
          hint="من الفروقات المستقلة ذات الاتجاه المالي"
          icon={CircleDollarSign}
          tone="gold"
        />
        <StatCard
          label="متبقي للمتابعة"
          value={sar(summary.outstanding)}
          hint={summary.disputedCount + " حالات بوضع اعتراض"}
          icon={CircleDollarSign}
        />
        <StatCard
          label="تم استرداده"
          value={sar(summary.recovered)}
          hint="المبالغ المؤكدة والمسجلة يدوياً"
          icon={BadgeDollarSign}
        />
      </section>

      <section className="rounded-[10px] border border-border bg-white p-3.5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="relative xl:col-span-2">
            <Search className="absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="بحث بالفرع أو الفترة أو رقم الحالة…"
              className="ps-9"
            />
          </div>

          <Select value={platform} onValueChange={setPlatform}>
            <SelectTrigger>
              <SelectValue placeholder="المنصة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المنصات</SelectItem>
              <SelectItem value="hungerstation">هنقرستيشن</SelectItem>
              <SelectItem value="keeta">كيتا</SelectItem>
              <SelectItem value="jahez">جاهز</SelectItem>
            </SelectContent>
          </Select>

          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger>
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="open">المفتوحة فقط</SelectItem>
              <SelectItem value="all">كل الحالات</SelectItem>
              {Object.entries(EXCEPTION_STATUS_LABELS).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </section>

      {cases.length === 0 ? (
        <section className="panel px-6 py-14 text-center">
          <CheckCircle2 className="mx-auto mb-3 size-9 text-success" />
          <h2 className="text-lg font-bold">لا توجد حالات استرداد حالياً</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
            ستظهر هنا تلقائياً الاستثناءات التي يحدد Tadqeeq لها استرداداً
            محتملاً اعتماداً على دليل مستقل.
          </p>
        </section>
      ) : (
        <section className="overflow-hidden rounded-[10px] border border-border bg-white">
          <div data-scroll className="max-h-[72vh] overflow-auto">
            <table className="w-full min-w-[1380px] border-collapse text-[13px]">
              <thead className="sticky top-0 z-10 bg-surface-raised">
                <tr className="text-xs text-muted-foreground">
                  <Th>الحالة</Th>
                  <Th>رقم الحالة</Th>
                  <Th>المنصة</Th>
                  <Th>الفترة</Th>
                  <Th>الفرع</Th>
                  <Th>الاستثناء</Th>
                  <Th>استرداد محتمل</Th>
                  <Th>المسترد</Th>
                  <Th>المتبقي</Th>
                  <Th>المتابعة</Th>
                  <Th>ملاحظة</Th>
                  <Th>المطالبة</Th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => (
                  <RecoveryRow
                    key={item.id}
                    item={item}
                    saving={updateWorkflow.isPending}
                    onUpdate={(patch) =>
                      updateWorkflow.mutate({
                        periodId: item.periodId,
                        exceptionId: item.id,
                        patch,
                      })
                    }
                    documents={(documentsQuery.data ?? []).filter(
                      (document) =>
                        document.periodId === item.periodId &&
                        document.exceptionId === item.id,
                    )}
                    uploading={uploadDocument.isPending}
                    onUpload={(file) =>
                      uploadDocument.mutate({
                        periodId: item.periodId,
                        exceptionId: item.id,
                        file,
                      })
                    }
                  />
                ))}
                {filtered.length === 0 ? (
                  <tr>
                    <td
                      colSpan={12}
                      className="px-5 py-16 text-center text-muted-foreground"
                    >
                      لا توجد حالات مطابقة للفلاتر الحالية.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}

function RecoveryRow({
  item,
  saving,
  onUpdate,
  documents,
  uploading,
  onUpload,
}: {
  item: AuditException;
  saving: boolean;
  onUpdate: (patch: Partial<ExceptionWorkflowEntry>) => void;
  documents: RecoveryDocumentRecord[];
  uploading: boolean;
  onUpload: (file: File) => void;
}) {
  const [note, setNote] = useState(item.note ?? "");
  const [recovered, setRecovered] = useState(
    item.recoveredAmount ? String(item.recoveredAmount) : "",
  );
  const [claimReference, setClaimReference] = useState(item.claimReference ?? "");
  const [approvedClaimAmount, setApprovedClaimAmount] = useState(
    item.approvedClaimAmount != null ? String(item.approvedClaimAmount) : "",
  );
  const [submittedAmount, setSubmittedAmount] = useState(
    item.submittedAmount != null ? String(item.submittedAmount) : "",
  );
  const [acceptedAmount, setAcceptedAmount] = useState(
    item.acceptedAmount != null ? String(item.acceptedAmount) : "",
  );
  const [submittedOn, setSubmittedOn] = useState(item.submittedOn ?? "");
  const [responseOn, setResponseOn] = useState(item.responseOn ?? "");
  const [recoveredOn, setRecoveredOn] = useState(item.recoveredOn ?? "");

  useEffect(() => {
    setNote(item.note ?? "");
    setRecovered(item.recoveredAmount ? String(item.recoveredAmount) : "");
    setClaimReference(item.claimReference ?? "");
    setApprovedClaimAmount(
      item.approvedClaimAmount != null ? String(item.approvedClaimAmount) : "",
    );
    setSubmittedAmount(
      item.submittedAmount != null ? String(item.submittedAmount) : "",
    );
    setAcceptedAmount(
      item.acceptedAmount != null ? String(item.acceptedAmount) : "",
    );
    setSubmittedOn(item.submittedOn ?? "");
    setResponseOn(item.responseOn ?? "");
    setRecoveredOn(item.recoveredOn ?? "");
  }, [
    item.id,
    item.note,
    item.recoveredAmount,
    item.claimReference,
    item.approvedClaimAmount,
    item.submittedAmount,
    item.acceptedAmount,
    item.submittedOn,
    item.responseOn,
    item.recoveredOn,
  ]);

  return (
    <tr className="align-top hover:bg-secondary/35">
      <Td>
        <Select
          value={item.status}
          disabled={saving}
          onValueChange={(value) =>
            onUpdate({ status: value as ExceptionStatus })
          }
        >
          <SelectTrigger className="h-8 w-36 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {Object.entries(EXCEPTION_STATUS_LABELS).map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Td>
      <Td mono>
        <span className="text-[11px] text-muted-foreground">{item.id}</span>
      </Td>
      <Td>
        {item.platform === "hungerstation"
          ? "هنقرستيشن"
          : item.platform === "keeta"
            ? "كيتا"
            : "جاهز"}
      </Td>
      <Td>
        <div className="max-w-52">
          <p className="font-semibold">{item.periodLabel}</p>
          <p className="num mt-0.5 text-[11px] text-muted-foreground">
            {arabicDate(item.periodStart)} — {arabicDate(item.periodEnd)}
          </p>
        </div>
      </Td>
      <Td>{item.branch ?? "إجمالي الفترة"}</Td>
      <Td>
        <div className="max-w-72">
          <p className="font-medium">{item.label}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">
            {item.categoryLabel}
          </p>
        </div>
      </Td>
      <MoneyCell value={item.potentialRecovery} />
      <Td>
        <Input
          inputMode="decimal"
          value={recovered}
          disabled={saving}
          onChange={(event) => setRecovered(event.target.value)}
          onBlur={() => {
            const value = Number(recovered.replace(/,/g, ""));
            if (!Number.isFinite(value)) return;
            const capped = Math.min(
              Math.max(0, value),
              item.reviewAmount,
            );
            if (value > item.reviewAmount) {
              toast.warning(
                "المبلغ المسترد لا يمكن أن يتجاوز المبلغ محل المراجعة.",
              );
              setRecovered(String(capped));
            }
            if (capped !== item.recoveredAmount) {
              onUpdate({ recoveredAmount: capped });
            }
          }}
          placeholder="0.00"
          className="h-8 w-28 text-xs"
        />
      </Td>
      <MoneyCell value={recoveryOutstanding(item)} />
      <Td>
        <span
          className={cn(
            "inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold",
            item.status === "disputed" && "bg-warning/15 text-warning",
            item.status === "recovered" && "bg-success/15 text-success",
            item.status !== "disputed" &&
              item.status !== "recovered" &&
              "bg-secondary text-muted-foreground",
          )}
        >
          {EXCEPTION_STATUS_LABELS[item.status]}
        </span>
      </Td>
      <Td>
        <Input
          value={note}
          disabled={saving}
          onChange={(event) => setNote(event.target.value)}
          onBlur={() => {
            const trimmed = note.trim();
            if (trimmed !== (item.note ?? "")) {
              onUpdate({ note: trimmed || undefined });
            }
          }}
          placeholder="ملاحظة متابعة…"
          className="h-8 w-60 text-xs"
        />
      </Td>
      <Td>
        <details className="w-[360px] rounded-[8px] border border-border bg-background">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2 text-xs font-semibold">
            <span className="flex items-center gap-1.5">
              <Paperclip className="size-3.5" />
              ملف المطالبة
            </span>
            <span className="num text-[10px] text-muted-foreground">
              {documents.length} مستند
            </span>
          </summary>
          <div className="grid gap-3 border-t border-border p-3">
            <Input
              value={claimReference}
              disabled={saving}
              onChange={(event) => setClaimReference(event.target.value)}
              onBlur={() => {
                const value = claimReference.trim();
                if (value !== (item.claimReference ?? "")) {
                  onUpdate({ claimReference: value || null });
                }
              }}
              placeholder="رقم اعتراض / مرجع المنصة"
              className="h-8 text-xs"
            />

            <div className="grid grid-cols-3 gap-2">
              <ClaimAmountInput
                label="المعتمد"
                value={approvedClaimAmount}
                disabled={saving}
                onChange={setApprovedClaimAmount}
                onSave={(value) => onUpdate({ approvedClaimAmount: value })}
              />
              <ClaimAmountInput
                label="المرسل"
                value={submittedAmount}
                disabled={saving}
                onChange={setSubmittedAmount}
                onSave={(value) => onUpdate({ submittedAmount: value })}
              />
              <ClaimAmountInput
                label="المقبول"
                value={acceptedAmount}
                disabled={saving}
                onChange={setAcceptedAmount}
                onSave={(value) => onUpdate({ acceptedAmount: value })}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <ClaimDateInput
                label="تاريخ الإرسال"
                value={submittedOn}
                disabled={saving}
                onChange={(value) => {
                  setSubmittedOn(value);
                  onUpdate({ submittedOn: value || null });
                }}
              />
              <ClaimDateInput
                label="تاريخ الرد"
                value={responseOn}
                disabled={saving}
                onChange={(value) => {
                  setResponseOn(value);
                  onUpdate({ responseOn: value || null });
                }}
              />
              <ClaimDateInput
                label="تاريخ الاسترداد"
                value={recoveredOn}
                disabled={saving}
                onChange={(value) => {
                  setRecoveredOn(value);
                  onUpdate({ recoveredOn: value || null });
                }}
              />
            </div>

            <label className="flex cursor-pointer items-center justify-center gap-2 rounded-[8px] border border-dashed border-border px-3 py-2 text-xs text-muted-foreground hover:bg-muted/50">
              <Upload className="size-3.5" />
              {uploading ? "جارٍ رفع المستند…" : "رفع مستند دعم"}
              <input
                type="file"
                className="hidden"
                disabled={uploading}
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) onUpload(file);
                  event.currentTarget.value = "";
                }}
              />
            </label>

            {documents.length > 0 ? (
              <div className="space-y-1.5">
                {documents.slice(0, 4).map((document) => (
                  <div
                    key={document.id}
                    className="flex items-center justify-between gap-2 rounded-[7px] bg-muted/50 px-2.5 py-2 text-[11px]"
                  >
                    <span className="truncate">{document.originalName}</span>
                    <span className="num shrink-0 text-muted-foreground">
                      {formatBytes(document.sizeBytes)}
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </details>
      </Td>
    </tr>
  );
}


function ClaimAmountInput({
  label,
  value,
  disabled,
  onChange,
  onSave,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSave: (value: number | null) => void;
}) {
  return (
    <label className="grid gap-1 text-[10px] text-muted-foreground">
      {label}
      <Input
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          const trimmed = value.trim();
          if (!trimmed) {
            onSave(null);
            return;
          }
          const amount = Number(trimmed.replace(/,/g, ""));
          if (!Number.isFinite(amount) || amount < 0) {
            toast.error("أدخل مبلغ مطالبة صالحاً.");
            return;
          }
          onSave(amount);
        }}
        placeholder="0.00"
        className="h-8 text-xs"
      />
    </label>
  );
}

function ClaimDateInput({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="grid gap-1 text-[10px] text-muted-foreground">
      {label}
      <Input
        type="date"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        className="h-8 text-xs"
      />
    </label>
  );
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="whitespace-nowrap border-b border-border px-3.5 py-2.5 text-start text-[11.5px] font-semibold">
      {children}
    </th>
  );
}

function Td({
  children,
  mono = false,
}: {
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <td
      className={cn(
        "whitespace-nowrap border-b border-border/60 px-3.5 py-2.5",
        mono && "num",
      )}
    >
      {children}
    </td>
  );
}

function MoneyCell({ value }: { value: number }) {
  return (
    <Td>
      <span className="num font-medium">{sar(value)}</span>
    </Td>
  );
}
