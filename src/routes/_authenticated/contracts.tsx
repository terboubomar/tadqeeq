import { PageHeader } from "@/components/workspace/PageKit";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  Archive,
  ArchiveRestore,
  CheckCircle2,
  FileText,
  History,
  Lock,
  Pencil,
  Plus,
  Save,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
} from "lucide-react";
import {
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { evaluateContractCompliance } from "@/lib/contract-compliance.functions";
import type { ContractComplianceSection } from "@/lib/contract-compliance";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  approveContractVersion,
  createContract,
  createContractVersion,
  deleteContract,
  deleteContractRule,
  setContractArchived,
  updateContract,
  getContractRulebook,
  resolveContractTerms,
  saveContractRule,
  uploadContractDocument,
} from "@/lib/contract-rulebook.functions";
import {
  CONTRACT_FUNDING_SOURCES,
  CONTRACT_RULE_TYPES,
  CONTRACT_VALUE_KINDS,
  FUNDING_SOURCE_LABELS,
  PLATFORM_LABELS,
  RULE_TYPE_LABELS,
  VALUE_KIND_LABELS,
  type ContractDocumentRecord,
  type ContractFundingSource,
  type ContractPlatform,
  type ContractRuleRecord,
  type ContractRuleType,
  type ContractScopeType,
  type ContractValueKind,
} from "@/lib/contract-rulebook";
import {
  MAX_UPLOAD_SIZE_LABEL,
  uploadSizeError,
} from "@/lib/upload-validation";
import { listPeriods } from "@/lib/periods";
import { cn } from "@/lib/utils";
import { PlatformName } from "@/components/brand/PlatformLogo";

export const Route = createFileRoute("/_authenticated/contracts")({
  head: () => ({
    meta: [
      { title: "العقود وشروط المنصات · تدقيق" },
      {
        name: "description",
        content:
          "إدارة نسخ العقود وشروط الرسوم المعتمدة لمنصات التوصيل.",
      },
      { property: "og:title", content: "العقود وشروط المنصات · تدقيق" },
    ],
  }),
  component: ContractsPage,
});

const EVENT_LABELS = {
  insert: "إنشاء",
  update: "تعديل",
  delete: "حذف",
  approve: "اعتماد",
} as const;

const ENTITY_LABELS = {
  contract: "العقد",
  version: "نسخة العقد",
  rule: "بند الرسوم",
  document: "المستند",
} as const;

const DEFAULT_RULE = {
  ruleType: "commission_rate" as ContractRuleType,
  ruleKey: "commission_rate",
  valueKind: "percentage" as ContractValueKind,
  numericValue: "",
  textValue: "",
  booleanValue: "true",
  currency: "SAR",
  fundingSource: "none" as ContractFundingSource | "none",
  scopeType: "all" as ContractScopeType,
  scopeKey: "",
  notes: "",
};

function ContractsPage() {
  const queryClient = useQueryClient();
  const [selectedContractId, setSelectedContractId] = useState<string | null>(
    null,
  );
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(
    null,
  );

  const query = useQuery({
    queryKey: ["contract-rulebook"],
    queryFn: () => getContractRulebook({ data: {} }),
  });

  const data = query.data;
  const contracts = data?.contracts ?? [];
  const selectedContract =
    contracts.find((contract) => contract.id === selectedContractId) ??
    contracts[0] ??
    null;

  const versions = useMemo(
    () =>
      (data?.versions ?? []).filter(
        (version) => version.contractId === selectedContract?.id,
      ),
    [data?.versions, selectedContract?.id],
  );

  const selectedVersion =
    versions.find((version) => version.id === selectedVersionId) ??
    versions[0] ??
    null;

  const rules = useMemo(
    () =>
      (data?.rules ?? []).filter(
        (rule) => rule.versionId === selectedVersion?.id,
      ),
    [data?.rules, selectedVersion?.id],
  );

  const documents = useMemo(
    () =>
      (data?.documents ?? []).filter(
        (document) => document.versionId === selectedVersion?.id,
      ),
    [data?.documents, selectedVersion?.id],
  );

  const events = useMemo(
    () =>
      (data?.events ?? [])
        .filter((event) => event.contractId === selectedContract?.id)
        .slice(0, 18),
    [data?.events, selectedContract?.id],
  );

  async function refreshRulebook() {
    await queryClient.invalidateQueries({ queryKey: ["contract-rulebook"] });
  }

  if (query.isLoading) {
    return (
      <p className="py-20 text-center text-sm text-muted-foreground">
        جارٍ تحميل العقود…
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        crumbs={[{ label: "الرئيسية", to: "/dashboard" }, { label: "الإعداد" }, { label: "العقود وشروط المنصات" }]}
        title="العقود وشروط المنصات"
        subtitle="المصدر التجاري المعتمد للعمولات والرسوم. النسخة المعتمدة تُقفل للحفاظ على التاريخ، وأي تغيير لاحق يبدأ من نسخة جديدة."
        aside={
          <span className="flex items-center gap-2 rounded-full border border-success/20 bg-success-soft px-3 py-1.5 text-xs font-semibold text-success">
            <ShieldCheck className="size-4" />
            قواعد معتمدة وقابلة للتتبع
          </span>
        }
      />

      {query.error ? (
        <div className="rounded-[10px] border border-destructive/30 bg-destructive/[0.04] p-4 text-sm text-destructive">
          {query.error instanceof Error
            ? query.error.message
            : "تعذّر تحميل العقود."}
        </div>
      ) : null}

      <CreateContractPanel
        onCreated={async (contractId) => {
          setSelectedContractId(contractId);
          setSelectedVersionId(null);
          await refreshRulebook();
        }}
      />

      {contracts.length === 0 ? (
        <section className="rounded-[12px] border border-dashed border-border bg-white p-10 text-center">
          <FileText className="mx-auto size-8 text-muted-foreground" />
          <h2 className="mt-3 text-base font-semibold">لا توجد عقود بعد</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            أنشئ أول عقد للمنصة، ثم أضف نسخة فعّالة وبنود الرسوم.
          </p>
        </section>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="h-fit overflow-hidden rounded-[12px] border border-border bg-white">
            <div className="border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">العقود النشطة</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {contracts.length} عقد
              </p>
            </div>
            <div className="divide-y divide-border/70">
              {contracts.map((contract) => {
                const active = contract.id === selectedContract?.id;
                const contractVersions = (data?.versions ?? []).filter(
                  (version) => version.contractId === contract.id,
                );
                const approvedCount = contractVersions.filter(
                  (version) => version.status === "approved",
                ).length;

                return (
                  <button
                    key={contract.id}
                    type="button"
                    onClick={() => {
                      setSelectedContractId(contract.id);
                      setSelectedVersionId(null);
                    }}
                    className={cn(
                      "w-full px-4 py-3.5 text-start transition-colors",
                      active ? "bg-secondary" : "hover:bg-muted/70",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {contract.name}
                        </p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          <PlatformName platform={contract.platform} iconClassName="size-4 rounded" />
                        </p>
                      </div>
                      <span className="num rounded-full bg-background px-2 py-0.5 text-[10px] text-muted-foreground">
                        {approvedCount} معتمد
                      </span>
                    </div>
                    {contract.externalReference ? (
                      <p className="num mt-2 truncate text-[11px] text-muted-foreground">
                        {contract.externalReference}
                      </p>
                    ) : null}
                  </button>
                );
              })}
            </div>
          </aside>

          {selectedContract ? (
            <main className="min-w-0 space-y-5">
              <ContractHeader
                key={`header-${selectedContract.id}`}
                contract={selectedContract}
                hasApprovedVersion={versions.some((v) => v.status === "approved")}
                onChanged={refreshRulebook}
                onRemoved={async () => {
                  setSelectedContractId(null);
                  setSelectedVersionId(null);
                  await refreshRulebook();
                }}
              />
              <EffectiveTermsPreview
                key={selectedContract.id}
                contractId={selectedContract.id}
              />
              <ContractCompliancePanel
                key={`compliance-${selectedContract.id}`}
                contractId={selectedContract.id}
                platform={selectedContract.platform}
              />

              <VersionWorkspace
                contractId={selectedContract.id}
                versions={versions}
                selectedVersionId={selectedVersion?.id ?? null}
                onSelectVersion={setSelectedVersionId}
                onVersionCreated={async (versionId) => {
                  setSelectedVersionId(versionId);
                  await refreshRulebook();
                }}
              />

              {selectedVersion ? (
                <>
                  <RulesWorkspace
                    contractId={selectedContract.id}
                    version={selectedVersion}
                    rules={rules}
                    onChanged={refreshRulebook}
                  />
                  <ContractEvidencePanel
                    contractId={selectedContract.id}
                    version={selectedVersion}
                    documents={documents}
                    onChanged={refreshRulebook}
                  />
                  <ApprovalPanel
                    contractId={selectedContract.id}
                    version={selectedVersion}
                    ruleCount={rules.length}
                    documentCount={documents.length}
                    onApproved={refreshRulebook}
                  />
                </>
              ) : null}

              <AuditTrail events={events} />
            </main>
          ) : null}
        </div>
      )}

      <ArchivedContracts
        contracts={data?.archivedContracts ?? []}
        onChanged={refreshRulebook}
      />
    </div>
  );
}

function CreateContractPanel({
  onCreated,
}: {
  onCreated: (contractId: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [platform, setPlatform] =
    useState<ContractPlatform>("hungerstation");
  const [name, setName] = useState("");
  const [externalReference, setExternalReference] = useState("");
  const [counterparty, setCounterparty] = useState("");

  const mutation = useMutation({
    mutationFn: () =>
      createContract({
        data: {
          platform,
          name,
          externalReference: externalReference || null,
          counterparty: counterparty || null,
        },
      }),
    onSuccess: async ({ contractId }) => {
      toast.success("تم إنشاء العقد");
      setName("");
      setExternalReference("");
      setCounterparty("");
      setOpen(false);
      await onCreated(contractId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      toast.error("اسم العقد مطلوب");
      return;
    }
    mutation.mutate();
  }

  return (
    <section className="rounded-[12px] border border-border bg-white">
      <div className="flex w-full items-center justify-between gap-3 px-5 py-4">
        <div>
          <p className="text-sm font-semibold">إضافة عقد منصة</p>
          <p className="mt-1 text-xs text-muted-foreground">
            العقد هو الحاوية، وكل تغيير تجاري يُحفظ كنسخة مؤرخة داخله.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant={open ? "outline" : "default"}
          onClick={() => setOpen((value) => !value)}
        >
          <Plus className="size-3.5" />
          عقد جديد
        </Button>
      </div>

      {open ? (
        <form
          onSubmit={submit}
          className="grid gap-4 border-t border-border px-5 py-5 md:grid-cols-2 xl:grid-cols-4"
        >
          <Field label="المنصة">
            <Select
              value={platform}
              onValueChange={(value) =>
                setPlatform(value as ContractPlatform)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PLATFORM_LABELS).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>

          <Field label="اسم العقد">
            <Input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="مثال: عقد هنقرستيشن 2026"
              maxLength={160}
            />
          </Field>

          <Field label="مرجع العقد" hint="اختياري">
            <Input
              value={externalReference}
              onChange={(event) => setExternalReference(event.target.value)}
              placeholder="رقم العقد أو المرجع"
              maxLength={160}
            />
          </Field>

          <Field label="الطرف المقابل" hint="اختياري">
            <div className="flex gap-2">
              <Input
                value={counterparty}
                onChange={(event) => setCounterparty(event.target.value)}
                placeholder="اسم الجهة"
                maxLength={160}
              />
              <Button type="submit" disabled={mutation.isPending}>
                <Save className="size-3.5" />
                حفظ
              </Button>
            </div>
          </Field>
        </form>
      ) : null}
    </section>
  );
}

function ContractHeader({
  contract,
  hasApprovedVersion,
  onChanged,
  onRemoved,
}: {
  contract: {
    id: string;
    name: string;
    platform: ContractPlatform;
    externalReference: string | null;
    counterparty: string | null;
  };
  hasApprovedVersion: boolean;
  onChanged: () => Promise<void>;
  onRemoved: () => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(contract.name);
  const [externalReference, setExternalReference] = useState(
    contract.externalReference ?? "",
  );
  const [counterparty, setCounterparty] = useState(contract.counterparty ?? "");

  function startEdit() {
    setName(contract.name);
    setExternalReference(contract.externalReference ?? "");
    setCounterparty(contract.counterparty ?? "");
    setEditing(true);
  }

  const save = useMutation({
    mutationFn: () =>
      updateContract({
        data: {
          contractId: contract.id,
          name,
          externalReference: externalReference || null,
          counterparty: counterparty || null,
        },
      }),
    onSuccess: async () => {
      toast.success("تم تعديل العقد");
      setEditing(false);
      await onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const archive = useMutation({
    mutationFn: () =>
      setContractArchived({ data: { contractId: contract.id, archived: true } }),
    onSuccess: async () => {
      toast.success("تمت أرشفة العقد");
      await onRemoved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteContract({ data: { contractId: contract.id } }),
    onSuccess: async () => {
      toast.success("تم حذف العقد");
      await onRemoved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const busy = save.isPending || archive.isPending || remove.isPending;

  return (
    <section className="rounded-[12px] border border-border bg-white p-5">
      {editing ? (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (!name.trim()) {
              toast.error("اسم العقد مطلوب");
              return;
            }
            save.mutate();
          }}
          className="grid gap-4 md:grid-cols-3"
        >
          <Field label="اسم العقد">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={160} />
          </Field>
          <Field label="مرجع العقد" hint="اختياري">
            <Input
              value={externalReference}
              onChange={(e) => setExternalReference(e.target.value)}
              maxLength={160}
            />
          </Field>
          <Field label="الطرف المقابل" hint="اختياري">
            <Input
              value={counterparty}
              onChange={(e) => setCounterparty(e.target.value)}
              maxLength={160}
            />
          </Field>
          <div className="flex gap-2 md:col-span-3">
            <Button type="submit" size="sm" disabled={busy}>
              <Save className="size-3.5" />
              حفظ التعديل
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => setEditing(false)}>
              إلغاء
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-bold">{contract.name}</h2>
              <Badge variant="secondary" className="gap-1.5 ps-1"><PlatformName platform={contract.platform} iconClassName="size-4 rounded" /></Badge>
            </div>
            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
              {contract.externalReference ? (
                <span className="num">المرجع: {contract.externalReference}</span>
              ) : null}
              {contract.counterparty ? (
                <span>الطرف المقابل: {contract.counterparty}</span>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={startEdit} disabled={busy}>
              <Pencil className="size-3.5" />
              تعديل
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => {
                if (window.confirm("أرشفة هذا العقد؟ يمكنك استعادته لاحقاً.")) archive.mutate();
              }}
            >
              <Archive className="size-3.5" />
              أرشفة
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={busy || hasApprovedVersion}
              title={hasApprovedVersion ? "العقد فيه نسخة معتمدة — استخدم الأرشفة" : undefined}
              onClick={() => {
                if (window.confirm("حذف العقد نهائياً مع نسخه وبنوده ومستنداته؟")) remove.mutate();
              }}
            >
              <Trash2 className="size-3.5" />
              حذف
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}

function ArchivedContracts({
  contracts,
  onChanged,
}: {
  contracts: { id: string; name: string; platform: ContractPlatform }[];
  onChanged: () => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const restore = useMutation({
    mutationFn: (contractId: string) =>
      setContractArchived({ data: { contractId, archived: false } }),
    onSuccess: async () => {
      toast.success("تمت استعادة العقد");
      await onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  if (contracts.length === 0) return null;
  return (
    <section className="rounded-[12px] border border-border bg-white">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-3 text-sm font-semibold"
      >
        <span>العقود المؤرشفة ({contracts.length})</span>
        <span className="text-xs text-muted-foreground">{open ? "إخفاء" : "عرض"}</span>
      </button>
      {open ? (
        <div className="divide-y divide-border/70 border-t border-border">
          {contracts.map((contract) => (
            <div key={contract.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className="text-sm">{contract.name}</p>
                <p className="text-xs text-muted-foreground"><PlatformName platform={contract.platform} iconClassName="size-4 rounded" /></p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={restore.isPending}
                onClick={() => restore.mutate(contract.id)}
              >
                <ArchiveRestore className="size-3.5" />
                استعادة
              </Button>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}

function EffectiveTermsPreview({
  contractId,
}: {
  contractId: string;
}) {
  const [onDate, setOnDate] = useState("");
  const [branchKey, setBranchKey] = useState("");

  const mutation = useMutation({
    mutationFn: () => {
      if (!onDate) throw new Error("اختر تاريخاً للمعاينة.");
      return resolveContractTerms({
        data: {
          contractId,
          onDate,
          branchKey: branchKey.trim() || null,
        },
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const result = mutation.data;

  return (
    <section className="overflow-hidden rounded-[12px] border border-border bg-white">
      <div className="border-b border-border px-5 py-4">
        <div className="flex items-center gap-2">
          <Search className="size-4 text-muted-foreground" />
          <div>
            <h3 className="text-sm font-semibold">معاينة الشروط السارية</h3>
            <p className="mt-1 text-xs text-muted-foreground">
              اختبر النسخة المعتمدة والبنود التي ستنطبق على تاريخ وفرع محددين.
            </p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 px-5 py-5 md:grid-cols-[180px_minmax(0,1fr)_auto] md:items-end">
        <Field label="التاريخ">
          <Input
            type="date"
            value={onDate}
            onChange={(event) => setOnDate(event.target.value)}
          />
        </Field>
        <Field label="الفرع" hint="اختياري">
          <Input
            value={branchKey}
            onChange={(event) => setBranchKey(event.target.value)}
            placeholder="اتركه فارغاً لاستخدام شروط كل الفروع"
            maxLength={160}
          />
        </Field>
        <Button
          type="button"
          variant="outline"
          disabled={mutation.isPending || !onDate}
          onClick={() => mutation.mutate()}
        >
          <Search className="size-3.5" />
          معاينة
        </Button>
      </div>

      {result?.status === "not_found" ? (
        <div className="border-t border-amber-200 bg-amber-50/60 px-5 py-4 text-sm text-amber-800">
          لا توجد نسخة عقد معتمدة سارية في هذا التاريخ.
        </div>
      ) : null}

      {result?.status === "resolved" ? (
        <div className="border-t border-border">
          <div className="flex flex-wrap items-center justify-between gap-2 bg-success/[0.04] px-5 py-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-success" />
              <span className="text-sm font-semibold">
                النسخة {result.version.versionNumber}
              </span>
              <span className="num text-xs text-muted-foreground">
                {result.version.effectiveFrom} —{" "}
                {result.version.effectiveTo ?? "مفتوح"}
              </span>
            </div>
            <span className="num text-xs text-muted-foreground">
              {result.rules.length} بند ساري
            </span>
          </div>

          {result.rules.length > 0 ? (
            <div className="divide-y divide-border/70">
              {result.rules.map((rule) => (
                <div
                  key={rule.id}
                  className="grid gap-2 px-5 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_160px_160px]"
                >
                  <div>
                    <p className="font-medium">
                      {RULE_TYPE_LABELS[rule.ruleType]}
                    </p>
                    <p className="num mt-0.5 text-[11px] text-muted-foreground">
                      {rule.ruleKey}
                    </p>
                  </div>
                  <span className="num font-semibold">
                    {formatRuleValue(rule)}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {rule.scopeType === "branch"
                      ? `تجاوز فرع: ${rule.scopeKey ?? "—"}`
                      : "كل الفروع"}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="px-5 py-4 text-sm text-muted-foreground">
              النسخة سارية لكن لا توجد بنود قابلة للتطبيق على هذا النطاق.
            </p>
          )}
        </div>
      ) : null}
    </section>
  );
}


function ContractCompliancePanel({
  contractId,
  platform,
}: {
  contractId: string;
  platform: ContractPlatform;
}) {
  const [periodId, setPeriodId] = useState("");

  const periodsQuery = useQuery({
    queryKey: ["periods", "contract-compliance"],
    queryFn: listPeriods,
  });

  const periods = (periodsQuery.data ?? []).filter(
    (period) => period.platform === platform,
  );
  const selectedPeriodId = periodId || periods[0]?.id || "";

  const mutation = useMutation({
    mutationFn: () => {
      if (!selectedPeriodId) throw new Error("اختر فترة تدقيق أولاً.");
      return evaluateContractCompliance({
        data: { contractId, periodId: selectedPeriodId },
      });
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const result = mutation.data;
  const compliance = result?.status === "evaluated" ? result.compliance : null;

  return (
    <section className="overflow-hidden rounded-[12px] border border-border bg-white">
      <div className="border-b border-border px-5 py-4">
        <h3 className="text-sm font-semibold">
          مطابقة العقد مع تدقيق {PLATFORM_LABELS[platform]}
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {platform === "hungerstation"
            ? "فحص العمولة ورسوم البطاقات ورسوم المحافظ مقابل الشروط المعتمدة، بدون تعديل نتائج محرك التدقيق."
            : platform === "keeta"
              ? "فحص نسبة عمولة كيتا مقابل الأساس والعمولة المعاد بناؤهما من Order Summary، بدون تعديل نتائج محرك التدقيق."
              : "فحص نسبة عمولة جاهز مقابل إجمالي قيمة الطلبات والعمولة شامل الضريبة من تفاصيل الطلبات، بدون تعديل نتائج محرك التدقيق."}
        </p>
      </div>

      <div className="grid gap-4 px-5 py-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <Field label="فترة التدقيق">
          <Select value={selectedPeriodId} onValueChange={setPeriodId}>
            <SelectTrigger>
              <SelectValue placeholder={`اختر فترة ${PLATFORM_LABELS[platform]}`} />
            </SelectTrigger>
            <SelectContent>
              {periods.map((period) => (
                <SelectItem key={period.id} value={period.id}>
                  {period.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Button
          type="button"
          variant="outline"
          disabled={
            mutation.isPending ||
            periodsQuery.isLoading ||
            !selectedPeriodId
          }
          onClick={() => mutation.mutate()}
        >
          <ShieldCheck className="size-3.5" />
          فحص الالتزام بالعقد
        </Button>
      </div>

      {!periodsQuery.isLoading && periods.length === 0 ? (
        <p className="border-t border-border px-5 py-4 text-sm text-muted-foreground">
          لا توجد فترة تدقيق {PLATFORM_LABELS[platform]} محفوظة لاستخدامها في المطابقة.
        </p>
      ) : null}

      {result?.status === "not_covered" ? (
        <div className="border-t border-amber-200 bg-amber-50/60 px-5 py-4 text-sm text-amber-800">
          {result.message}
        </div>
      ) : null}

      {compliance ? (
        <div className="border-t border-border">
          <div className="bg-surface-raised/40 px-5 py-3 text-xs text-muted-foreground">
            نسخة العقد {compliance.versionNumber} · {compliance.effectiveFrom} —{" "}
            {compliance.effectiveTo ?? "مفتوح"} · فترة التدقيق{" "}
            {compliance.periodStart} — {compliance.periodEnd}
          </div>

          <div className="space-y-5 border-t border-border p-5">
            {compliance.platform === "hungerstation" ? (
              <>
                <ContractComplianceSectionPanel
                  title="عمولة المبيعات"
                  baseLabel="أساس العمولة"
                  section={compliance.commission}
                />
                <ContractComplianceSectionPanel
                  title="رسوم الدفع الإلكتروني — البطاقات"
                  baseLabel="أساس رسوم البطاقات"
                  section={compliance.paymentFee}
                />
                <ContractComplianceSectionPanel
                  title="رسوم مدفوعات المحافظ"
                  baseLabel="أساس رسوم المحافظ"
                  section={compliance.walletFee}
                />
              </>
            ) : compliance.platform === "keeta" ? (
              <ContractComplianceSectionPanel
                title="عمولة الطلب — كيتا"
                baseLabel="المبيعات بدون الضريبة"
                section={compliance.commission}
              />
            ) : (
              <ContractComplianceSectionPanel
                title="عمولة الطلب — جاهز"
                baseLabel="إجمالي الطلبات شامل الضريبة"
                section={compliance.commission}
              />
            )}
          </div>
        </div>
      ) : null}
    </section>
  );
}

function ContractComplianceSectionPanel({
  title,
  baseLabel,
  section,
}: {
  title: string;
  baseLabel: string;
  section: ContractComplianceSection;
}) {
  return (
    <div className="overflow-hidden rounded-[10px] border border-border bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3.5">
        <div>
          <h4 className="text-sm font-semibold">{title}</h4>
          <p className="mt-1 max-w-3xl text-[11px] leading-5 text-muted-foreground">
            {section.evidenceNote}
          </p>
        </div>
        <Badge variant={section.totals.complete ? "secondary" : "outline"}>
          {section.totals.complete ? "قابل للمطابقة" : "بيانات غير مكتملة"}
        </Badge>
      </div>

      <div className="grid gap-3 bg-surface-raised/40 px-4 py-4 sm:grid-cols-2 xl:grid-cols-4">
        <ComplianceMetric
          label="المتوقع حسب العقد"
          value={formatSar(section.totals.expectedAmount)}
        />
        <ComplianceMetric
          label="المرصود"
          value={formatOptionalSar(section.totals.observedAmount)}
        />
        <ComplianceMetric
          label="زيادة محتملة"
          value={formatOptionalSar(section.totals.overchargedAmount)}
        />
        <ComplianceMetric
          label="فرق صافي"
          value={formatOptionalSignedSar(section.totals.varianceAmount)}
        />
      </div>

      {section.missingRuleBranches.length > 0 ? (
        <ComplianceWarning>
          لا يوجد بند {section.ruleKey} قابل للتطبيق على:{" "}
          {section.missingRuleBranches.join("، ")}. لم يتم افتراض أي نسبة.
        </ComplianceWarning>
      ) : null}

      {section.unsupportedRuleBranches.length > 0 ? (
        <ComplianceWarning>
          بند {section.ruleKey} موجود لكنه ليس نسبة مئوية قابلة للتطبيق على:{" "}
          {section.unsupportedRuleBranches.join("، ")}. يحتاج البند إلى تعريف
          حسابي صريح قبل استخدامه.
        </ComplianceWarning>
      ) : null}

      {section.missingEvidenceBranches.length > 0 ? (
        <ComplianceWarning>
          الأدلة غير كافية للمطابقة التفصيلية في:{" "}
          {section.missingEvidenceBranches.join("، ")}.
        </ComplianceWarning>
      ) : null}

      {section.rows.length > 0 ? (
        <div className="divide-y divide-border/70">
          {section.rows.map((row) => (
            <div
              key={`${section.ruleKey}-${row.branch}`}
              className="grid gap-2 px-4 py-3 text-sm md:grid-cols-[minmax(0,1fr)_110px_130px_130px_110px]"
            >
              <div>
                <p className="font-medium">{row.branch}</p>
                <p className="num mt-0.5 text-[11px] text-muted-foreground">
                  {baseLabel} {formatSar(row.baseAmount)}
                </p>
              </div>
              <span className="num">
                عقد {row.contractRatePct.toFixed(2)}%
              </span>
              <span className="num">
                متوقع {formatSar(row.expectedAmount)}
              </span>
              <span className="num">
                مرصود {formatOptionalSar(row.observedAmount)}
              </span>
              <span
                className={cn(
                  "num font-semibold",
                  row.status === "overcharged"
                    ? "text-destructive"
                    : row.status === "matched"
                      ? "text-success"
                      : row.status === "evidence_missing"
                        ? "text-muted-foreground"
                        : "text-amber-700",
                )}
              >
                {formatOptionalSignedSar(row.varianceAmount)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="border-t border-border px-4 py-4 text-sm text-muted-foreground">
          لا توجد حركة قابلة للحساب لهذا البند ضمن الأدلة المتاحة.
        </p>
      )}
    </div>
  );
}

function ComplianceWarning({ children }: { children: ReactNode }) {
  return (
    <div className="border-t border-amber-200 bg-amber-50/60 px-4 py-3 text-xs leading-5 text-amber-800">
      {children}
    </div>
  );
}

function ComplianceMetric({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[9px] border border-border bg-white px-3.5 py-3">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="num mt-1 text-base font-bold">{value}</p>
    </div>
  );
}

const SAR_FORMATTER = new Intl.NumberFormat("en-SA", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatSar(value: number): string {
  return `${SAR_FORMATTER.format(value)} SAR`;
}

function formatOptionalSar(value: number | null): string {
  return value == null ? "—" : formatSar(value);
}

function formatSignedSar(value: number): string {
  if (Math.abs(value) < 0.005) return "0.00 SAR";
  return `${value > 0 ? "+" : "-"}${SAR_FORMATTER.format(Math.abs(value))} SAR`;
}

function formatOptionalSignedSar(value: number | null): string {
  return value == null ? "—" : formatSignedSar(value);
}

function VersionWorkspace({
  contractId,
  versions,
  selectedVersionId,
  onSelectVersion,
  onVersionCreated,
}: {
  contractId: string;
  versions: Array<{
    id: string;
    versionNumber: number;
    effectiveFrom: string;
    effectiveTo: string | null;
    status: "draft" | "approved";
    sourceNote: string | null;
  }>;
  selectedVersionId: string | null;
  onSelectVersion: (id: string) => void;
  onVersionCreated: (id: string) => Promise<void>;
}) {
  const [effectiveFrom, setEffectiveFrom] = useState("");
  const [effectiveTo, setEffectiveTo] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [showForm, setShowForm] = useState(versions.length === 0);

  const mutation = useMutation({
    mutationFn: () =>
      createContractVersion({
        data: {
          contractId,
          effectiveFrom,
          effectiveTo: effectiveTo || null,
          sourceNote: sourceNote || null,
        },
      }),
    onSuccess: async ({ versionId }) => {
      toast.success("تم إنشاء نسخة عقد جديدة");
      setEffectiveFrom("");
      setEffectiveTo("");
      setSourceNote("");
      setShowForm(false);
      await onVersionCreated(versionId);
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!effectiveFrom) {
      toast.error("تاريخ بداية النسخة مطلوب");
      return;
    }
    mutation.mutate();
  }

  return (
    <section className="rounded-[12px] border border-border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold">نسخ العقد</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            كل نسخة لها فترة سريان مستقلة وحالة اعتماد.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => setShowForm((value) => !value)}
        >
          <Plus className="size-3.5" />
          نسخة جديدة
        </Button>
      </div>

      {versions.length > 0 ? (
        <div className="flex gap-2 overflow-x-auto px-5 py-4">
          {versions.map((version) => {
            const active = selectedVersionId === version.id;
            return (
              <button
                type="button"
                key={version.id}
                onClick={() => onSelectVersion(version.id)}
                className={cn(
                  "min-w-[190px] rounded-[10px] border px-3.5 py-3 text-start",
                  active
                    ? "border-primary/30 bg-secondary"
                    : "border-border bg-background hover:bg-muted/60",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="num text-sm font-semibold">
                    النسخة {version.versionNumber}
                  </span>
                  <VersionStatus status={version.status} />
                </div>
                <p className="num mt-2 text-[11px] text-muted-foreground">
                  {version.effectiveFrom} — {version.effectiveTo ?? "مفتوح"}
                </p>
              </button>
            );
          })}
        </div>
      ) : (
        <p className="px-5 py-5 text-sm text-muted-foreground">
          لا توجد نسخة لهذا العقد بعد.
        </p>
      )}

      {showForm ? (
        <form
          onSubmit={submit}
          className="grid gap-4 border-t border-border bg-surface-raised/50 px-5 py-5 md:grid-cols-2 xl:grid-cols-4"
        >
          <Field label="ساري من">
            <Input
              type="date"
              value={effectiveFrom}
              onChange={(event) => setEffectiveFrom(event.target.value)}
            />
          </Field>
          <Field label="ساري إلى" hint="اتركه فارغاً للمدة المفتوحة">
            <Input
              type="date"
              value={effectiveTo}
              onChange={(event) => setEffectiveTo(event.target.value)}
            />
          </Field>
          <Field label="ملاحظة المصدر" hint="اختياري">
            <Input
              value={sourceNote}
              onChange={(event) => setSourceNote(event.target.value)}
              placeholder="مثال: تعديل تجاري بتاريخ..."
              maxLength={1000}
            />
          </Field>
          <div className="flex items-end">
            <Button type="submit" disabled={mutation.isPending}>
              <Save className="size-3.5" />
              إنشاء النسخة
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function RulesWorkspace({
  contractId,
  version,
  rules,
  onChanged,
}: {
  contractId: string;
  version: {
    id: string;
    versionNumber: number;
    status: "draft" | "approved";
  };
  rules: ContractRuleRecord[];
  onChanged: () => Promise<void>;
}) {
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [ruleType, setRuleType] =
    useState<ContractRuleType>(DEFAULT_RULE.ruleType);
  const [ruleKey, setRuleKey] = useState(DEFAULT_RULE.ruleKey);
  const [valueKind, setValueKind] =
    useState<ContractValueKind>(DEFAULT_RULE.valueKind);
  const [numericValue, setNumericValue] = useState(DEFAULT_RULE.numericValue);
  const [textValue, setTextValue] = useState(DEFAULT_RULE.textValue);
  const [booleanValue, setBooleanValue] = useState(DEFAULT_RULE.booleanValue);
  const [currency, setCurrency] = useState(DEFAULT_RULE.currency);
  const [fundingSource, setFundingSource] = useState<
    ContractFundingSource | "none"
  >(DEFAULT_RULE.fundingSource);
  const [scopeType, setScopeType] =
    useState<ContractScopeType>(DEFAULT_RULE.scopeType);
  const [scopeKey, setScopeKey] = useState(DEFAULT_RULE.scopeKey);
  const [notes, setNotes] = useState(DEFAULT_RULE.notes);

  const locked = version.status === "approved";

  function resetRuleForm() {
    setEditingRuleId(null);
    setRuleType(DEFAULT_RULE.ruleType);
    setRuleKey(DEFAULT_RULE.ruleKey);
    setValueKind(DEFAULT_RULE.valueKind);
    setNumericValue(DEFAULT_RULE.numericValue);
    setTextValue(DEFAULT_RULE.textValue);
    setBooleanValue(DEFAULT_RULE.booleanValue);
    setCurrency(DEFAULT_RULE.currency);
    setFundingSource(DEFAULT_RULE.fundingSource);
    setScopeType(DEFAULT_RULE.scopeType);
    setScopeKey(DEFAULT_RULE.scopeKey);
    setNotes(DEFAULT_RULE.notes);
  }

  function editRule(rule: ContractRuleRecord) {
    if (locked) return;
    setEditingRuleId(rule.id);
    setRuleType(rule.ruleType);
    setRuleKey(rule.ruleKey);
    setValueKind(rule.valueKind);
    setNumericValue(
      rule.numericValue == null ? "" : String(rule.numericValue),
    );
    setTextValue(rule.textValue ?? "");
    setBooleanValue(rule.textValue === "false" ? "false" : "true");
    setCurrency(rule.currency ?? "SAR");
    setFundingSource(rule.fundingSource ?? "none");
    setScopeType(rule.scopeType);
    setScopeKey(rule.scopeKey ?? "");
    setNotes(rule.notes ?? "");
  }

  const saveMutation = useMutation({
    mutationFn: () => {
      const numeric =
        valueKind === "percentage" || valueKind === "amount"
          ? Number(numericValue)
          : null;

      if (
        (valueKind === "percentage" || valueKind === "amount") &&
        (!numericValue.trim() || !Number.isFinite(numeric))
      ) {
        throw new Error("أدخل قيمة رقمية صحيحة.");
      }

      return saveContractRule({
        data: {
          id: editingRuleId ?? undefined,
          contractId,
          versionId: version.id,
          ruleKey,
          ruleType,
          valueKind,
          numericValue: numeric,
          textValue:
            valueKind === "boolean"
              ? booleanValue
              : valueKind === "text"
                ? textValue
                : null,
          currency: valueKind === "amount" ? currency : null,
          fundingSource:
            fundingSource === "none" ? null : fundingSource,
          scopeType,
          scopeKey: scopeType === "branch" ? scopeKey : null,
          notes: notes || null,
        },
      });
    },
    onSuccess: async () => {
      toast.success(editingRuleId ? "تم تحديث البند" : "تمت إضافة البند");
      resetRuleForm();
      await onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (ruleId: string) =>
      deleteContractRule({
        data: {
          contractId,
          versionId: version.id,
          ruleId,
        },
      }),
    onSuccess: async () => {
      toast.success("تم حذف البند");
      resetRuleForm();
      await onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!ruleKey.trim()) {
      toast.error("مفتاح البند مطلوب");
      return;
    }
    saveMutation.mutate();
  }

  return (
    <section className="overflow-hidden rounded-[12px] border border-border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold">بنود الرسوم</h3>
            <span className="num rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
              {rules.length}
            </span>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            القيم هنا تجارية وتاريخية؛ محرك التدقيق الحالي لم يتغير.
          </p>
        </div>
        {locked ? (
          <div className="flex items-center gap-1.5 text-xs text-success">
            <Lock className="size-3.5" />
            النسخة مقفلة
          </div>
        ) : null}
      </div>

      {rules.length > 0 ? (
        <div data-scroll className="overflow-x-auto">
          <table className="w-full min-w-[920px] border-collapse text-[13px]">
            <thead className="bg-surface-raised text-[11px] font-semibold text-muted-foreground">
              <tr>
                <Th>البند</Th>
                <Th>المفتاح</Th>
                <Th>القيمة</Th>
                <Th>التمويل</Th>
                <Th>النطاق</Th>
                <Th>ملاحظات</Th>
                <Th>إجراء</Th>
              </tr>
            </thead>
            <tbody>
              {rules.map((rule) => (
                <tr key={rule.id} className="border-t border-border/70">
                  <Td className="font-medium">
                    {RULE_TYPE_LABELS[rule.ruleType]}
                  </Td>
                  <Td mono>{rule.ruleKey}</Td>
                  <Td mono>{formatRuleValue(rule)}</Td>
                  <Td>
                    {rule.fundingSource
                      ? FUNDING_SOURCE_LABELS[rule.fundingSource]
                      : "—"}
                  </Td>
                  <Td>
                    {rule.scopeType === "all"
                      ? "كل الفروع"
                      : rule.scopeKey ?? "فرع"}
                  </Td>
                  <Td className="max-w-[260px] truncate">
                    {rule.notes ?? "—"}
                  </Td>
                  <Td>
                    {locked ? (
                      <Lock className="size-3.5 text-muted-foreground" />
                    ) : (
                      <div className="flex gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8"
                          onClick={() => editRule(rule)}
                          aria-label="تعديل البند"
                        >
                          <Pencil className="size-3.5" />
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-8 text-muted-foreground hover:text-destructive"
                          onClick={() => {
                            if (window.confirm("حذف هذا البند من النسخة؟")) {
                              deleteMutation.mutate(rule.id);
                            }
                          }}
                          aria-label="حذف البند"
                        >
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    )}
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="px-5 py-5 text-sm text-muted-foreground">
          لا توجد بنود رسوم في هذه النسخة بعد.
        </p>
      )}

      {!locked ? (
        <form
          onSubmit={submit}
          className="border-t border-border bg-surface-raised/50 px-5 py-5"
        >
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">
                {editingRuleId ? "تعديل البند" : "إضافة بند"}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                النسبة تُدخل كنسبة مئوية: 18 تعني 18%.
              </p>
            </div>
            {editingRuleId ? (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={resetRuleForm}
              >
                إلغاء التعديل
              </Button>
            ) : null}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <Field label="نوع البند">
              <Select
                value={ruleType}
                onValueChange={(value) => {
                  const next = value as ContractRuleType;
                  setRuleType(next);
                  if (!editingRuleId) setRuleKey(next);
                }}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACT_RULE_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {RULE_TYPE_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="المفتاح الداخلي">
              <Input
                dir="ltr"
                value={ruleKey}
                onChange={(event) => setRuleKey(event.target.value)}
                placeholder="commission_rate"
                maxLength={120}
              />
            </Field>

            <Field label="نوع القيمة">
              <Select
                value={valueKind}
                onValueChange={(value) =>
                  setValueKind(value as ContractValueKind)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTRACT_VALUE_KINDS.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {VALUE_KIND_LABELS[kind]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="القيمة">
              {valueKind === "percentage" || valueKind === "amount" ? (
                <div className="flex gap-2">
                  <Input
                    dir="ltr"
                    inputMode="decimal"
                    value={numericValue}
                    onChange={(event) => setNumericValue(event.target.value)}
                    placeholder={valueKind === "percentage" ? "18" : "0.00"}
                  />
                  {valueKind === "amount" ? (
                    <Input
                      dir="ltr"
                      className="w-20"
                      value={currency}
                      onChange={(event) =>
                        setCurrency(event.target.value.toUpperCase())
                      }
                      maxLength={3}
                    />
                  ) : null}
                </div>
              ) : valueKind === "boolean" ? (
                <Select
                  value={booleanValue}
                  onValueChange={setBooleanValue}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="true">نعم</SelectItem>
                    <SelectItem value="false">لا</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={textValue}
                  onChange={(event) => setTextValue(event.target.value)}
                  placeholder="القيمة المتفق عليها"
                  maxLength={1000}
                />
              )}
            </Field>

            <Field label="جهة التمويل" hint="اختياري">
              <Select
                value={fundingSource}
                onValueChange={(value) =>
                  setFundingSource(
                    value as ContractFundingSource | "none",
                  )
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">غير مطبق</SelectItem>
                  {CONTRACT_FUNDING_SOURCES.map((source) => (
                    <SelectItem key={source} value={source}>
                      {FUNDING_SOURCE_LABELS[source]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            <Field label="النطاق">
              <Select
                value={scopeType}
                onValueChange={(value) =>
                  setScopeType(value as ContractScopeType)
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الفروع</SelectItem>
                  <SelectItem value="branch">فرع محدد</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field
              label="معرّف / اسم الفرع"
              hint={scopeType === "all" ? "غير مطلوب" : "مطلوب"}
            >
              <Input
                value={scopeKey}
                disabled={scopeType === "all"}
                onChange={(event) => setScopeKey(event.target.value)}
                placeholder="مثال: Al Rakah"
                maxLength={160}
              />
            </Field>

            <Field label="ملاحظات" hint="اختياري">
              <Input
                value={notes}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="تفاصيل أو مرجع البند"
                maxLength={1000}
              />
            </Field>
          </div>

          <div className="mt-4 flex justify-end">
            <Button type="submit" disabled={saveMutation.isPending}>
              <Save className="size-3.5" />
              {editingRuleId ? "حفظ التعديل" : "إضافة البند"}
            </Button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function ContractEvidencePanel({
  contractId,
  version,
  documents,
  onChanged,
}: {
  contractId: string;
  version: {
    id: string;
    versionNumber: number;
    status: "draft" | "approved";
  };
  documents: ContractDocumentRecord[];
  onChanged: () => Promise<void>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const locked = version.status === "approved";

  const mutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error("اختر مستند العقد أولاً.");
      const form = new FormData();
      form.set("contractId", contractId);
      form.set("versionId", version.id);
      form.set("file", file);
      return uploadContractDocument({ data: form });
    },
    onSuccess: async ({ sha256 }) => {
      toast.success("تم حفظ مستند العقد", {
        description: `SHA-256: ${sha256.slice(0, 12)}…`,
      });
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      await onChanged();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  return (
    <section className="overflow-hidden rounded-[12px] border border-border bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div>
          <h3 className="text-sm font-semibold">مستندات العقد</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            يحتفظ تدقيق بالنسخة الخاصة من المستند مع بصمة SHA-256 لإثبات المصدر.
          </p>
        </div>
        <span className="num rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">
          {documents.length} مستند
        </span>
      </div>

      {documents.length > 0 ? (
        <div className="divide-y divide-border/70">
          {documents.map((document) => (
            <div
              key={document.id}
              className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5"
            >
              <div className="min-w-0">
                <p className="max-w-[520px] truncate text-sm font-medium">
                  {document.originalName}
                </p>
                <p className="num mt-1 text-[11px] text-muted-foreground">
                  {formatBytes(document.sizeBytes)} · SHA-256{" "}
                  {document.sha256.slice(0, 16)}…
                </p>
              </div>
              <span className="num text-[11px] text-muted-foreground">
                {formatDateTime(document.createdAt)}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="px-5 py-5 text-sm text-muted-foreground">
          لا يوجد مستند إثبات مرتبط بهذه النسخة حتى الآن.
        </p>
      )}

      {!locked ? (
        <div className="border-t border-border bg-surface-raised/50 px-5 py-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field
              label="إرفاق مستند"
              hint={`PDF / Word / Excel / CSV / صورة · حتى ${MAX_UPLOAD_SIZE_LABEL}`}
            >
              <input
                ref={inputRef}
                type="file"
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.png,.jpg,.jpeg"
                className="block w-full text-sm file:me-3 file:rounded-md file:border-0 file:bg-secondary file:px-3 file:py-2 file:text-xs file:font-semibold file:text-primary"
                onChange={(event) => {
                  const next = event.target.files?.[0] ?? null;
                  if (!next) {
                    setFile(null);
                    return;
                  }
                  const sizeError = uploadSizeError(next.size);
                  if (sizeError) {
                    event.currentTarget.value = "";
                    setFile(null);
                    toast.error(sizeError);
                    return;
                  }
                  setFile(next);
                }}
              />
            </Field>
            <Button
              type="button"
              disabled={!file || mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              <Upload className="size-3.5" />
              حفظ المستند
            </Button>
          </div>
          {file ? (
            <p className="mt-2 max-w-full truncate text-xs text-muted-foreground">
              الملف المحدد: {file.name}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="flex items-center gap-2 border-t border-border bg-success/[0.04] px-5 py-3 text-xs text-muted-foreground">
          <Lock className="size-3.5 text-success" />
          مستندات النسخة المعتمدة مقفلة ولا يمكن تغييرها.
        </div>
      )}
    </section>
  );
}

function ApprovalPanel({
  contractId,
  version,
  ruleCount,
  documentCount,
  onApproved,
}: {
  contractId: string;
  version: {
    id: string;
    versionNumber: number;
    status: "draft" | "approved";
    approvedAt: string | null;
  };
  ruleCount: number;
  documentCount: number;
  onApproved: () => Promise<void>;
}) {
  const mutation = useMutation({
    mutationFn: () =>
      approveContractVersion({
        data: { contractId, versionId: version.id },
      }),
    onSuccess: async () => {
      toast.success("تم اعتماد نسخة العقد وقفلها");
      await onApproved();
    },
    onError: (error: Error) => toast.error(error.message),
  });

  if (version.status === "approved") {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-[12px] border border-success/25 bg-success/[0.05] p-5">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 text-success" />
          <div>
            <p className="text-sm font-semibold text-success">
              النسخة {version.versionNumber} معتمدة ومقفلة
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              {version.approvedAt
                ? `اعتمدت في ${formatDateTime(version.approvedAt)}`
                : "تم اعتماد هذه النسخة."}{" "}
              أي تعديل تجاري جديد يجب أن يبدأ من نسخة جديدة.
            </p>
          </div>
        </div>
        <Lock className="size-5 text-success" />
      </section>
    );
  }

  return (
    <section className="rounded-[12px] border border-amber-200 bg-amber-50/50 p-5">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm font-semibold">اعتماد النسخة</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            بعد الاعتماد تصبح النسخة وبنودها مقفلة. يوجد حالياً{" "}
            <span className="num font-semibold text-foreground">
              {ruleCount}
            </span>{" "}
            بند و{" "}
            <span className="num font-semibold text-foreground">
              {documentCount}
            </span>{" "}
            مستند مسجل.
          </p>
        </div>
        <Button
          type="button"
          disabled={mutation.isPending || ruleCount === 0}
          onClick={() => {
            if (
              window.confirm(
                "اعتماد هذه النسخة سيقفلها ويمنع تعديل بنودها. هل تريد المتابعة؟",
              )
            ) {
              mutation.mutate();
            }
          }}
        >
          <ShieldCheck className="size-4" />
          اعتماد وقفل النسخة
        </Button>
      </div>
    </section>
  );
}

function AuditTrail({
  events,
}: {
  events: Array<{
    id: string;
    entityType: "contract" | "version" | "rule" | "document";
    eventType: "insert" | "update" | "delete" | "approve";
    createdAt: string;
  }>;
}) {
  return (
    <section className="overflow-hidden rounded-[12px] border border-border bg-white">
      <div className="flex items-center gap-2 border-b border-border px-5 py-4">
        <History className="size-4 text-muted-foreground" />
        <div>
          <h3 className="text-sm font-semibold">سجل التغييرات</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            سجل غير قابل للتعديل لأحدث تغييرات هذا العقد.
          </p>
        </div>
      </div>
      {events.length === 0 ? (
        <p className="px-5 py-5 text-sm text-muted-foreground">
          لا توجد أحداث مسجلة بعد.
        </p>
      ) : (
        <div className="divide-y divide-border/70">
          {events.map((event) => (
            <div
              key={event.id}
              className="flex flex-wrap items-center justify-between gap-2 px-5 py-3"
            >
              <div className="flex items-center gap-2">
                <Badge variant="outline">
                  {EVENT_LABELS[event.eventType]}
                </Badge>
                <span className="text-sm">
                  {ENTITY_LABELS[event.entityType]}
                </span>
              </div>
              <span className="num text-[11px] text-muted-foreground">
                {formatDateTime(event.createdAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function VersionStatus({
  status,
}: {
  status: "draft" | "approved";
}) {
  return status === "approved" ? (
    <span className="flex items-center gap-1 rounded-full bg-success/10 px-2 py-0.5 text-[10px] font-semibold text-success">
      <CheckCircle2 className="size-3" />
      معتمد
    </span>
  ) : (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">
      مسودة
    </span>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label>{label}</Label>
        {hint ? (
          <span className="text-[10px] text-muted-foreground">{hint}</span>
        ) : null}
      </div>
      {children}
    </div>
  );
}

function Th({ children }: { children: ReactNode }) {
  return (
    <th className="whitespace-nowrap px-3.5 py-2.5 text-start">{children}</th>
  );
}

function Td({
  children,
  mono = false,
  className,
}: {
  children: ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "whitespace-nowrap px-3.5 py-2.5",
        className,
      )}
    >
      {mono ? <span className="num">{children}</span> : children}
    </td>
  );
}

function formatRuleValue(rule: ContractRuleRecord): string {
  if (rule.valueKind === "percentage") {
    return `${formatNumber(rule.numericValue ?? 0)}%`;
  }
  if (rule.valueKind === "amount") {
    return `${formatNumber(rule.numericValue ?? 0)} ${rule.currency ?? ""}`.trim();
  }
  if (rule.valueKind === "boolean") {
    return rule.textValue === "true" ? "نعم" : "لا";
  }
  return rule.textValue ?? "—";
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 6,
  }).format(value);
}

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("ar-SA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
