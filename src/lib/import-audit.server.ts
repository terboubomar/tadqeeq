import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Json } from "@/integrations/supabase/types";

import { UnsupportedFormatError } from "./analysis/formats/types";
import { analyzeHungerStation, analyzeHungerStationSheets, hungerStationProjection } from "./analysis/hungerstation";
import { analyzeJahez } from "./analysis/jahez";
import { analyzeKeeta, analyzeKeetaSheets } from "./analysis/keeta";
import { readXlsxSheets, type SheetSource } from "./analysis/xlsx-stream";
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
import { normalizePeriodLabel, type StoredPeriod } from "./periods";
import { TRIAL_UPLOAD_EVENT } from "./plans";
import { requireServerUser, type ServerUserClient } from "./server-auth.server";
import { safeStorageFileName, sha256Hex } from "./source-file-utils";
import { logEvent } from "./observability";
import { MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_LABEL } from "./upload-validation";
import {
  loadColumnAliases,
  loadColumnSnapshots,
  saveColumnAliases,
  saveColumnSnapshots,
} from "./smart-columns/aliases.server";
import {
  diffColumns,
  mergeSnapshots,
  profileColumns,
  type ColumnChange,
  type ColumnSnapshot,
} from "./smart-columns/changes";
import {
  applyAliasesToSheets,
  applyColumnAliases,
  buildColumnReview,
  validateAliases,
  type ColumnAlias,
  type ColumnReview,
} from "./smart-columns/match";

const SOURCE_BUCKET = "source-files";

export type ImportAuditResult =
  | {
      status: "saved";
      periodId: string;
      branchCount: number;
      dailyCount: number;
      /** Columns renamed by confirmed smart-column matches before analysis. */
      columnAliasesApplied?: number;
      /** Money columns new or gone since the workspace's earlier files of this platform. */
      columnChanges?: ColumnChange[];
    }
  | {
      status: "duplicate";
      existingPeriodId: string;
    }
  | {
      status: "mapping_review";
      review: HungerStationMappingReview;
    }
  | {
      status: "column_review";
      review: ColumnReview;
    };

/** A platform changed required columns and the file offers likely matches for the user to confirm. */
export class ColumnReviewRequired extends UnsupportedFormatError {
  readonly review: ColumnReview;

  constructor(cause: UnsupportedFormatError, review: ColumnReview) {
    super({
      platform: cause.platform,
      source: cause.source,
      formatId: cause.formatId,
      missing: cause.missing,
      observed: cause.observed,
    });
    this.name = "ColumnReviewRequired";
    this.review = review;
  }
}

function parseColumnAliases(form: FormData): ColumnAlias[] {
  const raw = formString(form, "columnAliases");
  if (!raw) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("مطابقة الأعمدة غير صالحة.");
  }
  if (!Array.isArray(parsed) || parsed.length > 40) throw new Error("مطابقة الأعمدة غير صالحة.");
  return parsed.map((item) => {
    const entry = item as Partial<ColumnAlias> | null;
    const ok = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.length <= max;
    if (!entry || !ok(entry.source, 120) || !ok(entry.canonical, 200) || !ok(entry.observed, 200)) {
      throw new Error("مطابقة الأعمدة غير صالحة.");
    }
    return { source: entry.source!, canonical: entry.canonical!, observed: entry.observed! };
  });
}

export interface SourceFile {
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

  if (file.size === 0) {
    throw new Error("ملف " + label + " فارغ. صدّر الملف من المنصة مرة أخرى ثم ارفعه.");
  }

  if (!Number.isFinite(file.size) || file.size < 0 || file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error(
      "حجم ملف " + label + " يتجاوز الحد المسموح وهو " + MAX_UPLOAD_SIZE_LABEL + ".",
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
  excludePeriodId?: string,
): Promise<Record<string, JahezOrderReference>> {
  let query = client
    .from("periods")
    .select("id, label, invoice")
    .eq("user_id", userId)
    .eq("platform", "jahez");

  if (excludePeriodId) {
    query = query.neq("id", excludePeriodId);
  }

  const { data, error } = await query;

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

export async function buildAnalysis(
  form: FormData,
  platform: Platform,
  client: ServerUserClient,
  userId: string,
  approvedMappings: Record<string, string>,
  excludeHistoricalPeriodId?: string,
): Promise<{
  result: AnalysisResult;
  sources: SourceFile[];
  /** Matches the user confirmed with this upload (to remember once the analysis succeeds). */
  confirmedAliases: ColumnAlias[];
  appliedAliases: ColumnAlias[];
  /** The data file as the engine read it (after confirmed column matches). */
  analysedFile: ArrayBuffer;
  /** Keeta: the sheets read by the low-memory reader (already renamed by confirmed matches). */
  analysedSheets: SheetSource | null;
}> {
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
  const originalBuffer = await dataFile.arrayBuffer();
  const requestedAliases = parseColumnAliases(form);
  const storedAliases = await loadColumnAliases(client, userId, platform);
  // Large Excel exports do not fit in a Worker when opened with SheetJS; read them as a stream.
  // Very large HungerStation sheets keep only the columns the engine reads (and renamed ones).
  const sheets =
    platform === "keeta"
      ? await readXlsxSheets(originalBuffer)
      : platform === "hungerstation"
        ? await readXlsxSheets(
            originalBuffer,
            undefined,
            hungerStationProjection([...requestedAliases, ...storedAliases].map((alias) => alias.observed)),
          )
        : null;

  // Confirmed column matches rename changed headers back to the names the engine expects.
  const confirmedAliases = validateAliases(platform, originalBuffer, requestedAliases, sheets ?? undefined);
  const aliases = [...confirmedAliases, ...storedAliases];
  const { file: dataBuffer, applied: appliedAliases } = sheets
    ? { file: originalBuffer, applied: applyAliasesToSheets(platform, sheets, aliases) }
    : applyColumnAliases(platform, originalBuffer, aliases);

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
  try {
    if (platform === "hungerstation") {
      const persistedMappings = await loadHungerStationMappings(client, userId);
      const bankRate = parsePercentRateInput(formString(form, "bankRate"));

      const hungerOptions = {
        ...(invoice ? { invoice } : {}),
        ...(cpcInvoice ? { cpcInvoice } : {}),
        ...(bankRate ? { manualBankRate: bankRate.fraction } : {}),
        branchMappings: {
          ...persistedMappings,
          ...approvedMappings,
        },
        ...(label ? { label } : {}),
      };
      result = sheets ? analyzeHungerStationSheets(sheets, hungerOptions) : analyzeHungerStation(dataBuffer, hungerOptions);
    } else if (platform === "keeta") {
      const keetaOptions = {
        ...(invoice ? { invoice } : {}),
        ...(label ? { label } : {}),
      };
      result = sheets ? analyzeKeetaSheets(sheets, keetaOptions) : analyzeKeeta(dataBuffer, keetaOptions);
    } else {
      result = analyzeJahez(dataBuffer, {
        ...(invoice ? { invoice } : {}),
        ...(compensationFile
          ? { compensationFile: await compensationFile.arrayBuffer() }
          : {}),
        historicalOrders: await historicalJahezOrders(
          client,
          userId,
          excludeHistoricalPeriodId,
        ),
        ...(label ? { label } : {}),
      });
    }
  } catch (cause) {
    if (cause instanceof UnsupportedFormatError && !(cause instanceof ColumnReviewRequired)) {
      let review: ColumnReview | null = null;
      try {
        review = buildColumnReview(platform, dataBuffer, sheets ?? undefined);
      } catch (reviewError) {
        console.error("Failed to build column review", reviewError);
      }
      if (review) throw new ColumnReviewRequired(cause, review);
    }
    throw cause;
  }

  return {
    confirmedAliases,
    appliedAliases,
    analysedFile: dataBuffer,
    analysedSheets: sheets,
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

function assertApprovedMappingsBelongToAnalysis(
  result: AnalysisResult,
  mappings: Record<string, string>,
): void {
  for (const [hsBranchId, invoiceBranchName] of Object.entries(mappings)) {
    const confirmed = result.branches.some(
      (branch) =>
        branch.branchAuditStatus !== "invoice_only" &&
        branch.branchId === hsBranchId &&
        branch.invoiceBranchName === invoiceBranchName,
    );

    if (!confirmed) {
      throw new Error(
        "تعذّر تأكيد ربط فرع هنقرستيشن لأن الربط لا يطابق ملفات هذه الفترة.",
      );
    }
  }
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
    .select("id, label")
    .eq("user_id", userId)
    .eq("platform", result.platform)
    .eq("period_start", start)
    .eq("period_end", end)
    .is("superseded_at", null);

  if (error) throw new Error("تعذّر التحقق من تكرار فترة التدقيق.");

  const label = normalizePeriodLabel(result.label);
  const existing = (data ?? []).find(
    (row) => normalizePeriodLabel(row.label) === label,
  );
  return existing?.id ?? null;
}

async function insertPeriod(
  client: ServerUserClient,
  userId: string,
  result: AnalysisResult,
  columnChanges: ColumnChange[] = [],
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
        ...(columnChanges.length ? { columnChanges } : {}),
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

export async function storeSources(
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

async function recordFormatChangeAlert(
  client: ServerUserClient,
  userId: string,
  platform: Platform,
  file: File,
  error: UnsupportedFormatError,
): Promise<string> {
  const alertId = crypto.randomUUID();
  const path =
    userId +
    "/format-alerts/" +
    alertId +
    "/data-" +
    safeStorageFileName(file.name);
  const digest = await sha256Hex(file);

  const { error: uploadError } = await client.storage
    .from(SOURCE_BUCKET)
    .upload(path, file, {
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });

  if (uploadError) {
    throw new Error("تعذّر حفظ ملف الصيغة غير المدعومة للمراجعة.");
  }

  const { error: metadataError } = await client
    .from("format_change_alerts")
    .insert({
      id: alertId,
      user_id: userId,
      platform,
      source_kind: "data",
      expected_format_id: error.formatId,
      source_name: error.source,
      missing_fields: error.missing as unknown as Json,
      observed_fields: error.observed as unknown as Json,
      original_name: file.name,
      sha256: digest,
      size_bytes: file.size,
      storage_path: path,
      status: "new",
    });

  if (metadataError) {
    await client.storage.from(SOURCE_BUCKET).remove([path]);
    throw new Error("تعذّر تسجيل تنبيه تغيّر صيغة المنصة.");
  }

  console.error("Tadqeeq format change alert", {
    alertId,
    platform,
    expectedFormatId: error.formatId,
    source: error.source,
    missing: error.missing,
    observed: error.observed,
  });

  return alertId;
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

/** An upload started from an AI assistant (the MCP) reports its period back, so the assistant can read the result. */
async function completeMcpRequest(client: ServerUserClient, form: FormData, periodId: string) {
  const requestId = formString(form, "mcpRequest");
  if (!requestId || !/^[0-9a-f-]{36}$/i.test(requestId)) return;
  // The function is not in the generated types yet.
  const rpc = client as unknown as {
    rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }>;
  };
  const { error } = await rpc.rpc("mcp_complete_audit_request", { p_request_id: requestId, p_period_id: periodId });
  if (error) console.error("Failed to complete MCP audit request", error.message);
}

async function recordTrialUpload(workspaceId: string, actorUserId: string, periodId: string, platform: string) {
  // workspace_audit_events is not in the generated types yet; users can read it but only the service role writes.
  const events = supabaseAdmin as unknown as {
    from: (table: string) => { insert: (row: Record<string, unknown>) => PromiseLike<{ error: { message: string } | null }> };
  };
  const { error } = await events.from("workspace_audit_events").insert({
    workspace_id: workspaceId,
    actor_user_id: actorUserId,
    event_type: TRIAL_UPLOAD_EVENT,
    entity_type: "period",
    entity_id: periodId,
    metadata: { platform },
  });
  if (error) console.error("Failed to record trial upload", error.message);
}

/** Logs the start, outcome or failure of every upload analysis (ids only, never file contents). */
export async function importAuditOnServer(form: FormData): Promise<ImportAuditResult> {
  const log: { workspace_id?: string; actor_user_id?: string; platform?: string } = {};
  const startedAt = Date.now();
  try {
    const result = await runImportAudit(form, log);
    logEvent("analysis_completed", {
      ...log,
      status: result.status,
      period_id: result.status === "saved" ? result.periodId : undefined,
      branch_count: result.status === "saved" ? result.branchCount : undefined,
      duration_ms: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    logEvent("analysis_failed", { ...log, duration_ms: Date.now() - startedAt, error }, "error");
    throw error;
  }
}

async function runImportAudit(
  form: FormData,
  log: { workspace_id?: string; actor_user_id?: string; platform?: string },
): Promise<ImportAuditResult> {
  const { client, userId, uploadLimit, uploadsThisMonth, permissions, trial, workspaceId, actorUserId } = await requireServerUser();
  log.workspace_id = workspaceId;
  log.actor_user_id = actorUserId;
  if (!permissions.includes("imports.create")) {
    throw new Error("ليس لديك صلاحية لرفع البيانات.");
  }
  if (uploadLimit !== null && uploadsThisMonth >= uploadLimit) {
    throw new Error(
      trial
        ? "استخدمت الرفع المتاح في التجربة المجانية. اشترك لرفع فترات ومنصات أخرى وفتح بقية الأقسام."
        : `وصلت للحد الشهري لرفع الملفات في باقتك (${uploadLimit} رفعات). رقِّ باقتك أو انتظر بداية الشهر القادم.`,
    );
  }
  const platform = parsePlatform(formString(form, "platform"));
  log.platform = platform;
  logEvent("analysis_started", { ...log });
  const approvedMappings =
    platform === "hungerstation" ? parseApprovedMappings(form) : {};

  let result: AnalysisResult;
  let sources: SourceFile[];
  let confirmedAliases: ColumnAlias[];
  let appliedAliases: ColumnAlias[];
  let analysedFile: ArrayBuffer;
  let analysedSheets: SheetSource | null;
  try {
    ({ result, sources, confirmedAliases, appliedAliases, analysedFile, analysedSheets } = await buildAnalysis(
      form,
      platform,
      client,
      userId,
      approvedMappings,
    ));
  } catch (cause) {
    if (cause instanceof UnsupportedFormatError) {
      const sourceFile = formFile(form, "dataFile");
      let alertId: string | null = null;

      if (sourceFile) {
        try {
          alertId = await recordFormatChangeAlert(
            client,
            userId,
            platform,
            sourceFile,
            cause,
          );
        } catch (alertError) {
          console.error("Failed to record Tadqeeq format change alert", alertError);
        }
      }

      if (cause instanceof ColumnReviewRequired) {
        return { status: "column_review", review: cause.review };
      }

      throw new Error(
        cause.message +
          (alertId
            ? " تم حفظ الملف بأمان وتسجيل تنبيه تغيير الصيغة للمراجعة. مرجع التنبيه: " +
              alertId.slice(0, 8)
            : " تعذّر تسجيل تنبيه الدعم تلقائياً؛ احتفظ بالملف وأرسله للمراجعة."),
      );
    }

    throw cause;
  }

  if (platform === "hungerstation") {
    assertApprovedMappingsBelongToAnalysis(result, approvedMappings);
  }

  await saveColumnAliases(client, { workspaceId, ownerUserId: userId, actorUserId, platform, aliases: confirmedAliases });

  // Compare the file's money columns with the workspace's earlier files; never blocks the upload.
  let columnChanges: ColumnChange[] = [];
  let nextSnapshots: ColumnSnapshot[] | null = null;
  try {
    const snapshots = await loadColumnSnapshots(client, userId, platform);
    if (snapshots) {
      const profiles = profileColumns(platform, analysedFile, analysedSheets ?? undefined);
      columnChanges = diffColumns(snapshots, profiles);
      nextSnapshots = mergeSnapshots(snapshots, profiles);
    }
  } catch (cause) {
    console.error("Failed to compare platform columns", cause);
  }

  const duplicate = await findDuplicate(client, userId, result);
  if (duplicate) {
    await completeMcpRequest(client, form, duplicate);
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
    periodId = await insertPeriod(client, userId, result, columnChanges);
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

  if (trial) await recordTrialUpload(workspaceId, actorUserId, periodId, platform);
  await completeMcpRequest(client, form, periodId);
  if (nextSnapshots) {
    await saveColumnSnapshots(client, { workspaceId, ownerUserId: userId, platform, snapshots: nextSnapshots });
  }

  return {
    status: "saved",
    periodId,
    branchCount: result.branches.length,
    dailyCount: result.daily.length,
    ...(appliedAliases.length ? { columnAliasesApplied: appliedAliases.length } : {}),
    ...(columnChanges.length ? { columnChanges } : {}),
  };
}
