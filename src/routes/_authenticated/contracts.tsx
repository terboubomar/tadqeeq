import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import {
  CheckCircle2,
  FileText,
  History,
  Lock,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
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
  deleteContractRule,
  getContractRulebook,
  saveContractRule,
} from "@/lib/contract-rulebook.functions";
import {
  CONTRACT_FUNDING_SOURCES,
  CONTRACT_RULE_TYPES,
  CONTRACT_VALUE_KINDS,
  FUNDING_SOURCE_LABELS,
  PLATFORM_LABELS,
  RULE_TYPE_LABELS,
  VALUE_KIND_LABELS,
  type ContractFundingSource,
  type ContractPlatform,
  type ContractRuleRecord,
  type ContractRuleType,
  type ContractScopeType,
  type ContractValueKind,
} from "@/lib/contract-rulebook";
import { cn } from "@/lib/utils";

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
      <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="audit-heading">العقود وشروط المنصات</h1>
          <p className="audit-subtitle max-w-3xl">
            المصدر التجاري المعتمد للعمولات والرسوم. النسخة المعتمدة تُقفل
            للحفاظ على التاريخ، وأي تغيير لاحق يبدأ من نسخة جديدة.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-[9px] border border-success/20 bg-success/[0.06] px-3 py-2 text-xs text-success">
          <ShieldCheck className="size-4" />
          قواعد معتمدة وقابلة للتتبع
        </div>
      </header>

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
                          {PLATFORM_LABELS[contract.platform]}
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
              <ContractHeader contract={selectedContract} />

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
                  <ApprovalPanel
                    contractId={selectedContract.id}
                    version={selectedVersion}
                    ruleCount={rules.length}
                    documentCount={
                      (data?.documents ?? []).filter(
                        (document) =>
                          document.versionId === selectedVersion.id,
                      ).length
                    }
                    onApproved={refreshRulebook}
                  />
                </>
              ) : null}

              <AuditTrail events={events} />
            </main>
          ) : null}
        </div>
      )}
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
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex w-full items-center justify-between gap-3 px-5 py-4 text-start"
      >
        <div>
          <p className="text-sm font-semibold">إضافة عقد منصة</p>
          <p className="mt-1 text-xs text-muted-foreground">
            العقد هو الحاوية، وكل تغيير تجاري يُحفظ كنسخة مؤرخة داخله.
          </p>
        </div>
        <Button type="button" size="sm" variant={open ? "outline" : "default"}>
          <Plus className="size-3.5" />
          عقد جديد
        </Button>
      </button>

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
}: {
  contract: {
    name: string;
    platform: ContractPlatform;
    externalReference: string | null;
    counterparty: string | null;
  };
}) {
  return (
    <section className="rounded-[12px] border border-border bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-bold">{contract.name}</h2>
            <Badge variant="secondary">
              {PLATFORM_LABELS[contract.platform]}
            </Badge>
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
        <div className="rounded-[8px] border border-border bg-surface-raised px-3 py-2 text-xs text-muted-foreground">
          لا تُستخدم هذه الشروط في الحسابات إلا بعد اعتماد النسخة وربطها بطبقة
          المطابقة.
        </div>
      </div>
    </section>
  );
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
  children: React.ReactNode;
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

function Th({ children }: { children: React.ReactNode }) {
  return (
    <th className="whitespace-nowrap px-3.5 py-2.5 text-start">{children}</th>
  );
}

function Td({
  children,
  mono = false,
  className,
}: {
  children: React.ReactNode;
  mono?: boolean;
  className?: string;
}) {
  return (
    <td
      className={cn(
        "whitespace-nowrap px-3.5 py-2.5",
        mono && "num",
        className,
      )}
    >
      {children}
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
