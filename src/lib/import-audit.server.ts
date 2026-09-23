import type { Json } from "@/integrations/supabase/types";

import { analyzeHungerStation } from "./analysis/hungerstation";
import { analyzeJahez } from "./analysis/jahez";
import { analyzeKeeta } from "./analysis/keeta";
import {
  parseCpcInvoice,
  parseHungerInvoice,
  parseJahezInvoice,
  parseKeetaInvoice,
} from "./analysis/pdf";
import { extractPdfTextServer } from "./analysis/pdf.server";
import { parsePercentRateInput } from "./analysis/rates";
import type {
  AnalysisResult,
  JahezOrderReference,
  Platform,
} from "./analysis/types";
import { ENGINE_VERSION } from "./analysis/version";
import {
  buildHungerStationMappingReview,
  type HungerStationMappingReview,
} from "./hungerstation-branch-review";
import type { StoredPeriod } from "./periods";
import { requireServerUser, type ServerUserClient } from "./server-auth.server";
import { safeStorageFileName, sha256Hex } from "./source-file-utils";
import { MAX_UPLOAD_SIZE_BYTES } from "./upload-validation";

const SOURCE_BUCKET = "source-files";

export type ImportAuditResult =
  | {
      status: "saved";
      periodId: string;
      branchCount: number;
      dailyCount: number;
    }
  | {
      status: "duplicate";
      existingPeriodId: string;
    }
  | {
      status: "mapping_review";
      review: HungerStationMappingReview;
    };

interface SourceFile {
  kind: "data" | "invoice" | "cpc_invoice" | "compensation";
  file: File;
  formatId?: string;
}

function formString(form: FormData, key: string): string {
  const value = form.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function formFile(form: FormData, key: string): File | null {
  const value = form.get(key);
  return value && typeof value !== "string" ? value : null;
}

function formBoolean(form: FormData, key: string): boolean {
  return formString(form, key) === "true";
}

function parsePlatform(value: string): Platform {
  if (value === "hungerstation" || value === "keeta" || value === "jahez") {
    return value;
  }
  throw new Error("منصة التدقيق غير صالحة.");
}

function fileExtension(file: File): string {
  const name = file.name.toLowerCase();
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index) : "";
}

function validateFile(
  file: File | null,
  label: string,
  allowedExtensions: string[],
  required = false,
): void {
  if (!file) {
    if (required) throw new Error("ملف " + label + " مطلوب.");
    return;
  }

  if (!Number.isFinite(file.size) || file.size < 0 || file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error(
      "حجم ملف " + label + " يتجاوز الحد المسموح وهو 25 MB.",
    );
  }

  if (!allowedExtensions.includes(fileExtension(file))) {
    throw new Error(
      "صيغة ملف " + label + " غير مدعومة. الصيغ المسموحة: " +
        allowedExtensions.join(", "),
    );
  }
}

function parseApprovedMappings(form: FormData): Record<string, string> {
  const raw = formString(form, "approvedMappings");
  if (!raw) return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("بيانات تأكيد ربط فروع هنقرستيشن غير صالحة.");
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("بيانات تأكيد ربط فروع هنقرستيشن غير صالحة.");
  }

  const entries = Object.entries(parsed as Record<string, unknown>).map(
    ([hsBranchId, invoiceBranchName]) => [
      hsBranchId.trim(),
      typeof invoiceBranchName === "string" ? invoiceBranchName.trim() : "",
    ] as const,
  );

  if (
    entries.some(([hsBranchId, invoiceBranchName]) => !hsBranchId || !invoiceBranchName)
  ) {
    throw new Error("ربط فرع هنقرستيشن غير مكتمل.");
  }

  const invoiceNames = entries.map(([, name]) => name.toLocaleLowerCase());
  if (new Set(invoiceNames).size !== invoiceNames.length) {
    throw new Error("لا يمكن ربط أكثر من فرع بنفس اسم الفرع في الفاتورة.");
  }

  return Object.fromEntries(entries);
}

async function loadHungerStationMappings(
  client: ServerUserClient,
  userId: string,
): Promise<Record<string, string>> {
  const { data, error } = await client
    .from("hungerstation_branch_mappings")
    .select("hs_branch_id, invoice_branch_name")
    .eq("user_id", userId);

  if (error) {
    throw new Error("تعذّر قراءة ربط فروع هنقرستيشن المحفوظ.");
  }

  return Object.fromEntries(
    (data ?? [])
      .map((row) => [
        row.hs_branch_id.trim(),
        row.invoice_branch_name.trim(),
      ] as const)
      .filter(([branchId, invoiceName]) => branchId && invoiceName),
  );
}

async function saveConfirmedHungerStationMappings(
  client: ServerUserClient,
  userId: string,
  mappings: Record<string, string>,
): Promise<void> {
  const entries = Object.entries(mappings);
  if (!entries.length) return;

  const now = new Date().toISOString();
  const { error } = await client
    .from("hungerstation_branch_mappings")
    .upsert(
      entries.map(([hsBranchId, invoiceBranchName]) => ({
        user_id: userId,
        hs_branch_id: hsBranchId,
        invoice_branch_name: invoiceBranchName,
        confirmed_at: now,
        updated_at: now,
      })),
      { onConflict: "user_id,hs_branch_id" },
    );

  if (error) {
    if (error.code === "23505") {
      throw new Error(
        "اسم فرع الفاتورة مرتبط مسبقاً بفرع هنقرستيشن آخر. راجع الربط ثم حاول مرة أخرى.",
      );
    }
    throw new Error("تعذّر حفظ ربط فروع هنقرستيشن المؤكد.");
  }
}

async function historicalJahezOrders(
  client: ServerUserClient,
  userId: string,
): Promise<Record<string, JahezOrderReference>> {
  const { data, error } = await client
    .from("periods")
    .select("label, invoice")
    .eq("user_id", userId)
    .eq("platform", "jahez");

  if (error) throw new Error("تعذّر قراءة سجل فترات جاهز السابقة.");

  return Object.fromEntries(
    (data ?? []).flatMap((period) => {
      const invoice = period.invoice as unknown as StoredPeriod["invoice"];
      return Object.entries(invoice?.jahezOrderIndex ?? {}).map(
        ([orderId, reference]) => [
          orderId,
          {
            ...reference,
            periodLabel: period.label,
          },
        ],
      );
    }),
  );
}

async function buildAnalysis(
  form: FormData,
  platform: Platform,
  client: ServerUserClient,
  userId: string,
  approvedMappings: Record<string, string>,
): Promise<{ result: AnalysisResult; sources: SourceFile[] }> {
  const dataFile = formFile(form, "dataFile");
  const invoiceFile = formFile(form, "invoiceFile");
  const cpcFile = formFile(form, "cpcFile");
  const compensationFile = formFile(form, "compensationFile");

  validateFile(
    dataFile,
    "البيانات",
    platform === "jahez" ? [".csv"] : [".xlsx", ".xls"],
    true,
  );
  validateFile(invoiceFile, "الفاتورة", [".pdf"]);
  validateFile(cpcFile, "CPC", [".pdf"]);
  validateFile(compensationFile, "التعويضات", [".csv"]);

  if (platform !== "hungerstation" && cpcFile) {
    throw new Error("فاتورة CPC مدعومة فقط مع هنقرستيشن.");
  }
  if (platform !== "jahez" && compensationFile) {
    throw new Error("ملف التعويضات المدعوم حالياً خاص بجاهز.");
  }
  if (!dataFile) throw new Error("ملف البيانات مطلوب.");

  const label = formString(form, "label");
  const dataBuffer = await dataFile.arrayBuffer();

  let invoice;
  if (invoiceFile) {
    const text = await extractPdfTextServer(
      await invoiceFile.arrayBuffer(),
      platform === "hungerstation" ? 80 : platform === "keeta" ? 200 : 3,
    );
    invoice =
      platform === "hungerstation"
        ? parseHungerInvoice(text)
        : platform === "keeta"
          ? parseKeetaInvoice(text)
          : parseJahezInvoice(text);
  }

  let cpcInvoice;
  if (platform === "hungerstation" && cpcFile) {
    cpcInvoice = parseCpcInvoice(
      await extractPdfTextServer(await cpcFile.arrayBuffer(), 3),
    );
  }

  let result: AnalysisResult;
  if (platform === "hungerstation") {
    const persistedMappings = await loadHungerStationMappings(client, userId);
    const bankRate = parsePercentRateInput(formString(form, "bankRate"));

    result = analyzeHungerStation(dataBuffer, {
      ...(invoice ? { invoice } : {}),
      ...(cpcInvoice ? { cpcInvoice } : {}),
      ...(bankRate ? { manualBankRate: bankRate.fraction } : {}),
      branchMappings: {
        ...persistedMappings,
        ...approvedMappings,
      },
      ...(label ? { label } : {}),
    });
  } else if (platform === "keeta") {
    result = analyzeKeeta(dataBuffer, {
      ...(invoice ? { invoice } : {}),
      ...(label ? { label } : {}),
    });
  } else {
    result = analyzeJahez(dataBuffer, {
      ...(invoice ? { invoice } : {}),
      ...(compensationFile
        ? { compensationFile: await compensationFile.arrayBuffer() }
        : {}),
      historicalOrders: await historicalJahezOrders(client, userId),
      ...(label ? { label } : {}),
    });
  }

  return {
    result,
    sources: [
      {
        kind: "data",
        file: dataFile,
        formatId: result.formatIds?.[0],
      },
      ...(invoiceFile
        ? [{ kind: "invoice" as const, file: invoiceFile }]
        : []),
      ...(cpcFile
        ? [{ kind: "cpc_invoice" as const, file: cpcFile }]
        : []),
      ...(compensationFile
        ? [{ kind: "compensation" as const, file: compensationFile }]
        : []),
    ],
  };
}

async function findDuplicate(
  client: ServerUserClient,
  userId: string,
  result: AnalysisResult,
): Promise<string | null> {
  const start = result.summary.periodStart;
  const end = result.summary.periodEnd;
  if (!start || !end) return null;

  const { data, error } = await client
    .from("periods")
    .select("id")
    .eq("user_id", userId)
    .eq("platform", result.platform)
    .eq("period_start", start)
    .eq("period_end", end)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error("تعذّر التحقق من تكرار فترة التدقيق.");
  return data?.id ?? null;
}

async function insertPeriod(
  client: ServerUserClient,
  userId: string,
  result: AnalysisResult,
): Promise<string> {
  const { data, error } = await client
    .from("periods")
    .insert({
      user_id: userId,
      platform: result.platform,
      label: result.label,
      period_start: result.summary.periodStart,
      period_end: result.summary.periodEnd,
      engine_version: ENGINE_VERSION,
      format_ids: (result.formatIds ?? []) as unknown as Json,
      summary: result.summary as unknown as Json,
      branches: result.branches as unknown as Json,
      daily: result.daily as unknown as Json,
      invoice: {
        ...result.invoice,
        checks: result.checks,
      } as unknown as Json,
    })
    .select("id")
    .single();

  if (error || !data?.id) {
    throw Object.assign(
      new Error(error?.message ?? "تعذّر حفظ فترة التدقيق."),
      { code: error?.code },
    );
  }
  return data.id;
}

async function storeSources(
  client: ServerUserClient,
  userId: string,
  periodId: string,
  platform: Platform,
  sources: SourceFile[],
): Promise<void> {
  const uploaded: string[] = [];

  try {
    for (const source of sources) {
      const path =
        userId +
        "/" +
        periodId +
        "/" +
        source.kind +
        "-" +
        crypto.randomUUID() +
        "-" +
        safeStorageFileName(source.file.name);

      const digest = await sha256Hex(source.file);
      const { error: uploadError } = await client.storage
        .from(SOURCE_BUCKET)
        .upload(path, source.file, {
          upsert: false,
          contentType: source.file.type || "application/octet-stream",
        });

      if (uploadError) throw uploadError;
      uploaded.push(path);

      const { error: metadataError } = await client
        .from("audit_source_files")
        .insert({
          user_id: userId,
          period_id: periodId,
          platform,
          source_kind: source.kind,
          original_name: source.file.name,
          format_id: source.formatId ?? null,
          sha256: digest,
          size_bytes: source.file.size,
          storage_path: path,
        });

      if (metadataError) throw metadataError;
    }
  } catch (cause) {
    if (uploaded.length) {
      const { error: storageCleanupError } = await client.storage
        .from(SOURCE_BUCKET)
        .remove(uploaded);
      if (storageCleanupError) {
        console.error(
          "Failed to clean partial authoritative source upload",
          storageCleanupError,
        );
      }
    }

    await client
      .from("audit_source_files")
      .delete()
      .eq("period_id", periodId)
      .eq("user_id", userId);

    throw cause;
  }
}

async function rollbackPeriod(
  client: ServerUserClient,
  userId: string,
  periodId: string,
): Promise<void> {
  const { error } = await client
    .from("periods")
    .delete()
    .eq("id", periodId)
    .eq("user_id", userId);
  if (error) {
    console.error("Failed to roll back authoritative Tadqeeq period", error);
  }
}

export async function importAuditOnServer(
  form: FormData,
): Promise<ImportAuditResult> {
  const { client, userId } = await requireServerUser();
  const platform = parsePlatform(formString(form, "platform"));
  const approvedMappings =
    platform === "hungerstation" ? parseApprovedMappings(form) : {};

  const { result, sources } = await buildAnalysis(
    form,
    platform,
    client,
    userId,
    approvedMappings,
  );

  const duplicate = await findDuplicate(client, userId, result);
  if (duplicate) {
    return { status: "duplicate", existingPeriodId: duplicate };
  }

  if (
    platform === "hungerstation" &&
    !formBoolean(form, "skipMappingReview")
  ) {
    const review = buildHungerStationMappingReview(result.branches);
    if (review) {
      return {
        status: "mapping_review",
        review,
      };
    }
  }

  let periodId: string;
  try {
    periodId = await insertPeriod(client, userId, result);
  } catch (cause) {
    if (
      cause &&
      typeof cause === "object" &&
      "code" in cause &&
      cause.code === "23505"
    ) {
      const racedDuplicate = await findDuplicate(client, userId, result);
      if (racedDuplicate) {
        return {
          status: "duplicate",
          existingPeriodId: racedDuplicate,
        };
      }
    }
    throw cause;
  }

  try {
    if (platform === "hungerstation") {
      await saveConfirmedHungerStationMappings(
        client,
        userId,
        approvedMappings,
      );
    }
    await storeSources(client, userId, periodId, platform, sources);
  } catch (cause) {
    await rollbackPeriod(client, userId, periodId);

    throw new Error(
      cause instanceof Error
        ? "تعذّر تثبيت فترة التدقيق بشكل قابل لإعادة الإنتاج؛ تم التراجع عن الفترة الجديدة: " +
            cause.message
        : "تعذّر تثبيت فترة التدقيق بشكل قابل لإعادة الإنتاج؛ تم التراجع عن الفترة الجديدة.",
    );
  }

  return {
    status: "saved",
    periodId,
    branchCount: result.branches.length,
    dailyCount: result.daily.length,
  };
}
