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
  type ContractReadingResult,
} from "./contract-reading";
import type { ContractPlatform } from "./contract-rulebook";
import { assertDraftVersion, CONTRACT_DOCUMENT_BUCKET } from "./contract-rulebook.server";
import { requireWorkspacePermission } from "./server-auth.server";

const DEFAULT_MODEL = "gpt-5.6-luna";
const IMAGE_TYPES: Record<string, string> = { ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg" };


const extensionOf = (name: string) => {
  const index = name.toLowerCase().lastIndexOf(".");
  return index >= 0 ? name.toLowerCase().slice(index) : "";
};

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

  const extension = extensionOf(document.original_name);
  if (extension !== ".pdf" && extension !== ".csv" && !IMAGE_TYPES[extension]) {
    throw new Error("القراءة الآلية تدعم PDF والصور وCSV. أدخل بنود هذا المستند يدوياً أو ارفعه بصيغة PDF.");
  }

  const { data: blob, error: downloadError } = await client.storage.from(CONTRACT_DOCUMENT_BUCKET).download(document.storage_path);
  if (downloadError || !blob) throw new Error("تعذّر قراءة ملف العقد من التخزين.");
  const buffer = await blob.arrayBuffer();

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

  const platform = contract.platform as ContractPlatform;
  const expectedModel = process.env["TADQEEQ_AI_MODEL"]?.trim() || DEFAULT_MODEL;
  const { reading, model } = await runWithAiUsageReservation(
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
        userText: `Platform of this contract in Tadqeeq: ${platform}.\n\nContract text:\n${text}`,
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

  const warnings = [...reading.warnings];
  if (reading.platform !== "unknown" && reading.platform !== platform) {
    warnings.unshift(`المستند يبدو عقد ${reading.platform} بينما العقد في تدقيق لمنصة ${platform}. تحقق قبل إضافة البنود.`);
  }

  return {
    platform: reading.platform,
    contractPlatform: platform,
    effectiveFrom: reading.effectiveFrom,
    effectiveTo: reading.effectiveTo,
    summary: reading.summary,
    warnings,
    rules: draftRulesFromReading(reading, platform),
    model,
  };
}
