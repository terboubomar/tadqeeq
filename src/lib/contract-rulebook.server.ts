import type { PostgrestError } from "@supabase/supabase-js";

import {
  type ContractDocumentRecord,
  type ContractFundingSource,
  type ContractPlatform,
  type ContractRecord,
  type ContractRuleEventRecord,
  type ContractRuleRecord,
  type ContractRuleType,
  type ContractRulebookSnapshot,
  type ContractScopeType,
  type ContractValueKind,
  type ContractVersionRecord,
} from "./contract-rulebook";
import { requireServerUser, type ServerUserClient } from "./server-auth.server";

export interface CreateContractInput {
  platform: ContractPlatform;
  name: string;
  externalReference?: string | null;
  counterparty?: string | null;
}

export interface CreateContractVersionInput {
  contractId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  sourceNote?: string | null;
}

export interface SaveContractRuleInput {
  id?: string;
  contractId: string;
  versionId: string;
  ruleKey: string;
  ruleType: ContractRuleType;
  valueKind: ContractValueKind;
  numericValue?: number | null;
  textValue?: string | null;
  currency?: string | null;
  fundingSource?: ContractFundingSource | null;
  scopeType: ContractScopeType;
  scopeKey?: string | null;
  notes?: string | null;
}

function textOrNull(value: string | null | undefined): string | null {
  const cleaned = value?.trim() ?? "";
  return cleaned || null;
}

function explainDatabaseError(error: PostgrestError, fallback: string): Error {
  const message = error.message ?? "";

  if (error.code === "23505") {
    if (message.includes("platform_contracts_user_platform_name_unique_idx")) {
      return new Error("يوجد عقد نشط بنفس الاسم لهذه المنصة.");
    }
    if (message.includes("contract_fee_rules_version_rule_scope_unique_idx")) {
      return new Error("يوجد بند بنفس المفتاح والنطاق في هذه النسخة.");
    }
    if (message.includes("contract_versions_contract_id_version_number_key")) {
      return new Error("تغيّرت نسخ العقد أثناء الحفظ. أعد المحاولة.");
    }
  }

  if (message.includes("requires at least one fee rule")) {
    return new Error("أضف بند رسوم واحداً على الأقل قبل اعتماد النسخة.");
  }
  if (message.includes("may not overlap in effective dates")) {
    return new Error("تتداخل تواريخ هذه النسخة مع نسخة عقد معتمدة.");
  }
  if (
    message.includes("Approved contract versions are immutable") ||
    message.includes("Rules in an approved contract version are immutable") ||
    message.includes("Documents in an approved contract version are immutable")
  ) {
    return new Error("النسخة المعتمدة مقفلة ولا يمكن تعديلها.");
  }

  return new Error(fallback);
}

async function assertOwnedContract(
  client: ServerUserClient,
  userId: string,
  contractId: string,
) {
  const { data, error } = await client
    .from("platform_contracts")
    .select("id, platform, archived_at")
    .eq("id", contractId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw explainDatabaseError(error, "تعذّر قراءة العقد.");
  if (!data || data.archived_at) {
    throw new Error("العقد غير موجود أو مؤرشف.");
  }

  return data;
}

async function assertDraftVersion(
  client: ServerUserClient,
  userId: string,
  contractId: string,
  versionId: string,
) {
  await assertOwnedContract(client, userId, contractId);

  const { data, error } = await client
    .from("contract_versions")
    .select("id, contract_id, status")
    .eq("id", versionId)
    .eq("contract_id", contractId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw explainDatabaseError(error, "تعذّر قراءة نسخة العقد.");
  if (!data) throw new Error("نسخة العقد غير موجودة.");
  if (data.status !== "draft") {
    throw new Error("النسخة المعتمدة مقفلة ولا يمكن تعديلها.");
  }

  return data;
}

function normalizeRule(input: SaveContractRuleInput) {
  const ruleKey = input.ruleKey.trim();
  if (!ruleKey) throw new Error("مفتاح البند مطلوب.");

  let numericValue: number | null = null;
  let textValue: string | null = null;
  let currency: string | null = null;

  if (input.valueKind === "percentage") {
    const value = input.numericValue;
    if (value == null || !Number.isFinite(value) || value < 0 || value > 100) {
      throw new Error("النسبة يجب أن تكون بين 0 و100.");
    }
    numericValue = value;
  } else if (input.valueKind === "amount") {
    const value = input.numericValue;
    if (value == null || !Number.isFinite(value) || value < 0) {
      throw new Error("المبلغ يجب أن يكون صفراً أو أكبر.");
    }
    const code = input.currency?.trim().toUpperCase() ?? "";
    if (!/^[A-Z]{3}$/.test(code)) {
      throw new Error("رمز العملة يجب أن يتكون من ثلاثة أحرف، مثل SAR.");
    }
    numericValue = value;
    currency = code;
  } else if (input.valueKind === "boolean") {
    const value = input.textValue?.trim().toLowerCase();
    if (value !== "true" && value !== "false") {
      throw new Error("قيمة نعم/لا غير صالحة.");
    }
    textValue = value;
  } else {
    textValue = textOrNull(input.textValue);
    if (!textValue) throw new Error("قيمة البند النصية مطلوبة.");
  }

  const scopeKey =
    input.scopeType === "branch" ? textOrNull(input.scopeKey) : null;
  if (input.scopeType === "branch" && !scopeKey) {
    throw new Error("حدد الفرع عند استخدام نطاق فرع.");
  }

  return {
    ruleKey,
    numericValue,
    textValue,
    currency,
    scopeKey,
    notes: textOrNull(input.notes),
    fundingSource: input.fundingSource ?? null,
  };
}

export async function listContractRulebookOnServer(): Promise<ContractRulebookSnapshot> {
  const { client, userId } = await requireServerUser();

  const { data: contractRows, error: contractsError } = await client
    .from("platform_contracts")
    .select(
      "id, platform, name, external_reference, counterparty, created_at, archived_at",
    )
    .eq("user_id", userId)
    .is("archived_at", null)
    .order("created_at", { ascending: false });

  if (contractsError) {
    throw explainDatabaseError(contractsError, "تعذّر تحميل العقود.");
  }

  const contracts: ContractRecord[] = (contractRows ?? []).map((row) => ({
    id: row.id,
    platform: row.platform as ContractPlatform,
    name: row.name,
    externalReference: row.external_reference,
    counterparty: row.counterparty,
    createdAt: row.created_at,
  }));

  if (contracts.length === 0) {
    return {
      contracts: [],
      versions: [],
      rules: [],
      documents: [],
      events: [],
    };
  }

  const contractIds = contracts.map((contract) => contract.id);
  const [versionsResult, rulesResult, documentsResult, eventsResult] =
    await Promise.all([
      client
        .from("contract_versions")
        .select(
          "id, contract_id, version_number, effective_from, effective_to, status, source_note, approved_at, created_at",
        )
        .eq("user_id", userId)
        .in("contract_id", contractIds)
        .order("version_number", { ascending: false }),
      client
        .from("contract_fee_rules")
        .select(
          "id, contract_id, version_id, rule_key, rule_type, value_kind, numeric_value, text_value, currency, funding_source, scope_type, scope_key, notes, created_at",
        )
        .eq("user_id", userId)
        .in("contract_id", contractIds)
        .order("created_at", { ascending: true }),
      client
        .from("contract_documents")
        .select(
          "id, contract_id, version_id, original_name, sha256, size_bytes, created_at",
        )
        .eq("user_id", userId)
        .in("contract_id", contractIds)
        .order("created_at", { ascending: false }),
      client
        .from("contract_rule_events")
        .select(
          "id, contract_id, entity_type, entity_id, event_type, created_at",
        )
        .eq("user_id", userId)
        .in("contract_id", contractIds)
        .order("created_at", { ascending: false })
        .limit(250),
    ]);

  if (versionsResult.error) {
    throw explainDatabaseError(
      versionsResult.error,
      "تعذّر تحميل نسخ العقود.",
    );
  }
  if (rulesResult.error) {
    throw explainDatabaseError(rulesResult.error, "تعذّر تحميل بنود العقود.");
  }
  if (documentsResult.error) {
    throw explainDatabaseError(
      documentsResult.error,
      "تعذّر تحميل مستندات العقود.",
    );
  }
  if (eventsResult.error) {
    throw explainDatabaseError(
      eventsResult.error,
      "تعذّر تحميل سجل تغييرات العقود.",
    );
  }

  const versions: ContractVersionRecord[] = (versionsResult.data ?? []).map(
    (row) => ({
      id: row.id,
      contractId: row.contract_id,
      versionNumber: row.version_number,
      effectiveFrom: row.effective_from,
      effectiveTo: row.effective_to,
      status: row.status as "draft" | "approved",
      sourceNote: row.source_note,
      approvedAt: row.approved_at,
      createdAt: row.created_at,
    }),
  );

  const rules: ContractRuleRecord[] = (rulesResult.data ?? []).map((row) => ({
    id: row.id,
    contractId: row.contract_id,
    versionId: row.version_id,
    ruleKey: row.rule_key,
    ruleType: row.rule_type as ContractRuleType,
    valueKind: row.value_kind as ContractValueKind,
    numericValue: row.numeric_value,
    textValue: row.text_value,
    currency: row.currency,
    fundingSource: row.funding_source as ContractFundingSource | null,
    scopeType: row.scope_type as ContractScopeType,
    scopeKey: row.scope_key,
    notes: row.notes,
    createdAt: row.created_at,
  }));

  const documents: ContractDocumentRecord[] = (
    documentsResult.data ?? []
  ).map((row) => ({
    id: row.id,
    contractId: row.contract_id,
    versionId: row.version_id,
    originalName: row.original_name,
    sha256: row.sha256,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  }));

  const events: ContractRuleEventRecord[] = (eventsResult.data ?? []).map(
    (row) => ({
      id: row.id,
      contractId: row.contract_id,
      entityType: row.entity_type as ContractRuleEventRecord["entityType"],
      entityId: row.entity_id,
      eventType: row.event_type as ContractRuleEventRecord["eventType"],
      createdAt: row.created_at,
    }),
  );

  return { contracts, versions, rules, documents, events };
}

export async function createContractOnServer(
  input: CreateContractInput,
): Promise<{ contractId: string }> {
  const { client, userId } = await requireServerUser();
  const name = input.name.trim();
  if (!name) throw new Error("اسم العقد مطلوب.");

  const { data, error } = await client
    .from("platform_contracts")
    .insert({
      user_id: userId,
      platform: input.platform,
      name,
      external_reference: textOrNull(input.externalReference),
      counterparty: textOrNull(input.counterparty),
    })
    .select("id")
    .single();

  if (error) throw explainDatabaseError(error, "تعذّر إنشاء العقد.");
  return { contractId: data.id };
}

export async function createContractVersionOnServer(
  input: CreateContractVersionInput,
): Promise<{ versionId: string }> {
  const { client, userId } = await requireServerUser();
  await assertOwnedContract(client, userId, input.contractId);

  if (
    input.effectiveTo &&
    input.effectiveTo.trim() &&
    input.effectiveTo < input.effectiveFrom
  ) {
    throw new Error("تاريخ نهاية النسخة لا يمكن أن يسبق تاريخ البداية.");
  }

  const { data: latest, error: latestError } = await client
    .from("contract_versions")
    .select("version_number")
    .eq("contract_id", input.contractId)
    .eq("user_id", userId)
    .order("version_number", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (latestError) {
    throw explainDatabaseError(latestError, "تعذّر تحديد رقم نسخة العقد.");
  }

  const { data, error } = await client
    .from("contract_versions")
    .insert({
      user_id: userId,
      contract_id: input.contractId,
      version_number: (latest?.version_number ?? 0) + 1,
      effective_from: input.effectiveFrom,
      effective_to: textOrNull(input.effectiveTo),
      status: "draft",
      source_note: textOrNull(input.sourceNote),
    })
    .select("id")
    .single();

  if (error) {
    throw explainDatabaseError(error, "تعذّر إنشاء نسخة العقد.");
  }

  return { versionId: data.id };
}

export async function saveContractRuleOnServer(
  input: SaveContractRuleInput,
): Promise<{ ruleId: string }> {
  const { client, userId } = await requireServerUser();
  await assertDraftVersion(client, userId, input.contractId, input.versionId);
  const normalized = normalizeRule(input);

  const payload = {
    rule_key: normalized.ruleKey,
    rule_type: input.ruleType,
    value_kind: input.valueKind,
    numeric_value: normalized.numericValue,
    text_value: normalized.textValue,
    currency: normalized.currency,
    funding_source: normalized.fundingSource,
    scope_type: input.scopeType,
    scope_key: normalized.scopeKey,
    notes: normalized.notes,
  };

  if (input.id) {
    const { data, error } = await client
      .from("contract_fee_rules")
      .update(payload)
      .eq("id", input.id)
      .eq("version_id", input.versionId)
      .eq("contract_id", input.contractId)
      .eq("user_id", userId)
      .select("id")
      .maybeSingle();

    if (error) throw explainDatabaseError(error, "تعذّر تحديث بند العقد.");
    if (!data) throw new Error("بند العقد غير موجود.");
    return { ruleId: data.id };
  }

  const { data, error } = await client
    .from("contract_fee_rules")
    .insert({
      user_id: userId,
      contract_id: input.contractId,
      version_id: input.versionId,
      ...payload,
    })
    .select("id")
    .single();

  if (error) throw explainDatabaseError(error, "تعذّر إضافة بند العقد.");
  return { ruleId: data.id };
}

export async function deleteContractRuleOnServer(input: {
  contractId: string;
  versionId: string;
  ruleId: string;
}): Promise<{ ruleId: string }> {
  const { client, userId } = await requireServerUser();
  await assertDraftVersion(client, userId, input.contractId, input.versionId);

  const { data, error } = await client
    .from("contract_fee_rules")
    .delete()
    .eq("id", input.ruleId)
    .eq("version_id", input.versionId)
    .eq("contract_id", input.contractId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();

  if (error) throw explainDatabaseError(error, "تعذّر حذف بند العقد.");
  if (!data) throw new Error("بند العقد غير موجود.");
  return { ruleId: data.id };
}

export async function approveContractVersionOnServer(input: {
  contractId: string;
  versionId: string;
}): Promise<{ versionId: string }> {
  const { client, userId } = await requireServerUser();
  await assertDraftVersion(client, userId, input.contractId, input.versionId);

  const { data, error } = await client
    .from("contract_versions")
    .update({ status: "approved" })
    .eq("id", input.versionId)
    .eq("contract_id", input.contractId)
    .eq("user_id", userId)
    .select("id")
    .single();

  if (error) throw explainDatabaseError(error, "تعذّر اعتماد نسخة العقد.");
  return { versionId: data.id };
}
