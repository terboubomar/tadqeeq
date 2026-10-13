import { extractPdfTextServer } from "./analysis/pdf.server";
import type { AiServerAuth } from "./ai/auth.server";
import { callTadqeeqAi } from "./ai/gateway.server";
import { runWithAiUsageReservation } from "./ai/usage.server";
import {
  CONTRACT_READING_JSON_SCHEMA,
  CONTRACT_READING_PROMPT_VERSION,
  CONTRACT_READING_SYSTEM_PROMPT,
  contractReadingSchema,
  contractTextForModel,
  draftRulesFromReading,
  type ContractImportResult,
  type ContractReading,
  type ContractReadingResult,
} from "./contract-reading";
import { CONTRACT_PLATFORMS, PLATFORM_LABELS, type ContractPlatform } from "./contract-rulebook";
import {
  assertDraftVersion,
  CONTRACT_DOCUMENT_BUCKET,
  createContractOnServer,
  createContractVersionOnServer,
  saveContractRuleOnServer,
  uploadContractDocumentOnServer,
} from "./contract-rulebook.server";
import { MAX_UPLOAD_SIZE_BYTES } from "./limits";
import { requireWorkspacePermission } from "./server-auth.server";
import { sha256Hex } from "./source-file-utils";

const DEFAULT_MODEL = "gpt-5.6-luna";
const IMAGE_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const extensionOf = (name: string) => {
  const index = name.toLowerCase().lastIndexOf(".");
  return index >= 0 ? name.toLowerCase().slice(index) : "";
};

function assertReadable(fileName: string) {
  const extension = extensionOf(fileName);
  if (extension !== ".pdf" && extension !== ".csv" && !IMAGE_TYPES[extension]) {
    throw new Error("القراءة الآلية تدعم PDF والصور وCSV. أدخل بنود هذا المستند يدوياً أو ارفعه بصيغة PDF.");
  }
  return extension;
}

/** Tadqeeq AI reads a contract file (PDF text, an image, or CSV) and reports its terms as written. */
async function readContractFile(
  buffer: ArrayBuffer,
  fileName: string,
  platformHint: ContractPlatform | null,
  auth: AiServerAuth,
): Promise<{ reading: ContractReading; model: string }> {
  const extension = assertReadable(fileName);
  let text = "";
  const imageDataUrls: string[] = [];
  if (extension === ".pdf") {
    text = contractTextForModel(await extractPdfTextServer(buffer, 60));
    if (text.replace(/\s+/g, "").length < 200) {
      throw new Error("ملف PDF لا يحتوي نصاً قابلاً للقراءة (يبدو مسحاً ضوئياً). ارفع صور الصفحات أو أدخل البنود يدوياً.");
    }
  } else if (extension === ".csv") {
    text = contractTextForModel(new TextDecoder().decode(buffer));
  } else {
    if (buffer.byteLength > 15 * 1024 * 1024) throw new Error("الصورة أكبر من 15 MB؛ ارفع صورة أصغر.");
    imageDataUrls.push(`data:${IMAGE_TYPES[extension]};base64,${Buffer.from(buffer).toString("base64")}`);
    text = "(The contract is in the attached image.)";
  }

  const expectedModel = process.env["TADQEEQ_AI_MODEL"]?.trim() || DEFAULT_MODEL;
  return runWithAiUsageReservation(
    {
      accessToken: auth.accessToken,
      userId: auth.userId,
      // Logged with Tadqeeq AI's analyst usage (the usage ledger's existing feature list); the prompt version
      // tells contract reading apart.
      feature: "analyst_chat",
      expectedModel,
      promptVersion: CONTRACT_READING_PROMPT_VERSION,
      periodId: null,
      supabaseUrl: auth.supabaseUrl,
      supabaseKey: auth.supabaseKey,
    },
    async () => {
      const response = await callTadqeeqAi({
        systemPrompt: CONTRACT_READING_SYSTEM_PROMPT,
        userText: `${platformHint ? `Platform of this contract in Tadqeeq: ${platformHint}.` : "Identify the platform from the contract."}\n\nContract text:\n${text}`,
        schemaName: "contract_terms",
        schema: CONTRACT_READING_JSON_SCHEMA,
        maxOutputTokens: 6000,
        reasoningEffort: "low",
        imageDataUrls,
        // A whole contract takes longer to read than a single exception.
        timeoutMs: 90_000,
      });
      return { reading: contractReadingSchema.parse(JSON.parse(response.text)), model: response.model };
    },
  );
}

function platformMismatchWarning(reading: ContractReading, platform: ContractPlatform): string[] {
  return reading.platform !== "unknown" && reading.platform !== platform
    ? [`المستند يبدو عقد ${PLATFORM_LABELS[reading.platform]} بينما اخترت ${PLATFORM_LABELS[platform]}. تحقق قبل الاعتماد.`]
    : [];
}

/**
 * Reads one uploaded contract document of a draft version and proposes its terms. Nothing is written: the person
 * reviews the proposed terms and adds the ones they accept to the draft version, then approves it as usual.
 */
export async function readContractDocumentOnServer(
  input: { contractId: string; versionId: string; documentId: string },
  auth: AiServerAuth,
): Promise<ContractReadingResult> {
  const { client, userId } = await requireWorkspacePermission("contracts.manage");
  await assertDraftVersion(client, userId, input.contractId, input.versionId);

  const { data: contract, error: contractError } = await client
    .from("platform_contracts")
    .select("id, platform")
    .eq("id", input.contractId)
    .eq("user_id", userId)
    .maybeSingle();
  if (contractError || !contract) throw new Error("تعذّر العثور على العقد.");

  const { data: document, error: documentError } = await client
    .from("contract_documents")
    .select("id, original_name, storage_path")
    .eq("id", input.documentId)
    .eq("user_id", userId)
    .eq("contract_id", input.contractId)
    .eq("version_id", input.versionId)
    .maybeSingle();
  if (documentError || !document) throw new Error("تعذّر العثور على مستند العقد.");
  assertReadable(document.original_name);

  const { data: blob, error: downloadError } = await client.storage.from(CONTRACT_DOCUMENT_BUCKET).download(document.storage_path);
  if (downloadError || !blob) throw new Error("تعذّر قراءة ملف العقد من التخزين.");

  const platform = contract.platform as ContractPlatform;
  const { reading, model } = await readContractFile(await blob.arrayBuffer(), document.original_name, platform, auth);
  return {
    platform: reading.platform,
    contractPlatform: platform,
    effectiveFrom: reading.effectiveFrom,
    effectiveTo: reading.effectiveTo,
    summary: reading.summary,
    warnings: [...platformMismatchWarning(reading, platform), ...reading.warnings],
    rules: draftRulesFromReading(reading, platform),
    model,
  };
}

/**
 * Upload a contract and have it set up in one step: Tadqeeq AI reads it, then the platform's contract (the
 * newest active one, or a new one), a draft version with the contract's dates, the document and every term are
 * created. The version stays a draft: the person approves it with one click after seeing what was read.
 */
export async function importContractOnServer(form: FormData, auth: AiServerAuth): Promise<ContractImportResult> {
  const { client, userId } = await requireWorkspacePermission("contracts.manage");
  const value = form.get("file");
  const file = value && typeof value !== "string" ? value : null;
  if (!file || !file.name.trim()) throw new Error("اختر ملف العقد أولاً.");
  if (!Number.isFinite(file.size) || file.size <= 0 || file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error("حجم ملف العقد غير صالح أو يتجاوز 25 MB.");
  }
  assertReadable(file.name);
  const rawPlatform = String(form.get("platform") ?? "").trim();
  const platformHint = (CONTRACT_PLATFORMS as readonly string[]).includes(rawPlatform) ? (rawPlatform as ContractPlatform) : null;

  // The same file already set up: point to it rather than creating a copy.
  const sha256 = await sha256Hex(file);
  const { data: existingDocument } = await client
    .from("contract_documents")
    .select("contract_id")
    .eq("user_id", userId)
    .eq("sha256", sha256)
    .limit(1)
    .maybeSingle();
  if (existingDocument) {
    const { data: owner } = await client.from("platform_contracts").select("name").eq("id", existingDocument.contract_id).eq("user_id", userId).maybeSingle();
    throw new Error(`هذا الملف مرفوع مسبقاً في عقد «${owner?.name ?? "سابق"}». افتح العقد من القائمة.`);
  }

  const { reading, model } = await readContractFile(await file.arrayBuffer(), file.name, platformHint, auth);
  const platform = platformHint ?? (reading.platform === "unknown" ? null : reading.platform);
  if (!platform) throw new Error("لم يتضح من الملف أي منصة يخص هذا العقد. اختر المنصة ثم ارفعه مرة أخرى.");

  const warnings = [...platformMismatchWarning(reading, platform), ...reading.warnings];
  const today = new Date().toISOString().slice(0, 10);
  let effectiveFrom = reading.effectiveFrom && ISO_DATE.test(reading.effectiveFrom) ? reading.effectiveFrom : null;
  let effectiveTo = reading.effectiveTo && ISO_DATE.test(reading.effectiveTo) ? reading.effectiveTo : null;
  if (!effectiveFrom) {
    effectiveFrom = today;
    warnings.push("لم يُقرأ تاريخ سريان من العقد؛ وُضع تاريخ اليوم. عدّله في نسخ العقد إن لزم.");
  }
  if (effectiveTo && effectiveTo < effectiveFrom) {
    warnings.push(`تاريخ النهاية المقروء (${effectiveTo}) يسبق البداية؛ تُركت النسخة مفتوحة النهاية.`);
    effectiveTo = null;
  }

  // The platform's newest active contract, or a new one named from the document.
  const { data: contracts, error: contractsError } = await client
    .from("platform_contracts")
    .select("id, name")
    .eq("user_id", userId)
    .eq("platform", platform)
    .is("archived_at", null)
    .order("created_at", { ascending: false })
    .limit(1);
  if (contractsError) throw new Error("تعذّر قراءة العقود الحالية.");
  let contract = contracts?.[0] ?? null;
  const createdContract = !contract;
  if (!contract) {
    const name = (reading.contractTitle.trim() || `عقد ${PLATFORM_LABELS[platform]}`).slice(0, 160);
    const { contractId } = await createContractOnServer({
      platform,
      name,
      externalReference: reading.reference?.slice(0, 160) ?? null,
      counterparty: reading.counterparty?.slice(0, 160) ?? null,
    });
    contract = { id: contractId, name };
  }

  const { versionId } = await createContractVersionOnServer({
    contractId: contract.id,
    effectiveFrom,
    effectiveTo,
    sourceNote: `قُرئ آلياً من «${file.name}»${reading.reference ? ` · ${reading.reference}` : ""}`.slice(0, 1000),
  });

  const documentForm = new FormData();
  documentForm.set("contractId", contract.id);
  documentForm.set("versionId", versionId);
  documentForm.set("file", file);
  await uploadContractDocumentOnServer(documentForm);

  const rules = draftRulesFromReading(reading, platform);
  const saved: typeof rules = [];
  for (const rule of rules) {
    try {
      await saveContractRuleOnServer({
        contractId: contract.id,
        versionId,
        ruleKey: rule.ruleKey,
        ruleType: rule.ruleType,
        valueKind: rule.valueKind,
        numericValue: rule.numericValue,
        textValue: rule.textValue,
        currency: rule.currency,
        fundingSource: rule.fundingSource,
        scopeType: rule.scopeType,
        scopeKey: rule.scopeKey,
        notes: rule.notes,
      });
      saved.push(rule);
    } catch (cause) {
      warnings.push(`تعذّر حفظ بند «${rule.label}»: ${cause instanceof Error ? cause.message : "خطأ غير معروف"}`);
    }
  }

  // Approved versions of one contract may not overlap; say so now rather than at approval.
  const { data: approved } = await client
    .from("contract_versions")
    .select("version_number, effective_from, effective_to")
    .eq("user_id", userId)
    .eq("contract_id", contract.id)
    .eq("status", "approved");
  const overlap = (approved ?? []).find(
    (version) => version.effective_from <= (effectiveTo ?? "9999-12-31") && (version.effective_to ?? "9999-12-31") >= effectiveFrom!,
  );

  return {
    contractId: contract.id,
    contractName: contract.name,
    createdContract,
    versionId,
    platform,
    effectiveFrom,
    effectiveTo,
    summary: reading.summary,
    warnings,
    rules: saved,
    overlapsVersion: overlap ? overlap.version_number : null,
    model,
  };
}
