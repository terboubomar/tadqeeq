import type { Json } from "@/integrations/supabase/types";

import { ENGINE_VERSION } from "./analysis/version";
import { buildHungerStationMappingReview } from "./hungerstation-branch-review";
import {
  buildAnalysis,
  storeSources,
  type SourceFile,
} from "./import-audit.server";
import type { StoredPeriod } from "./periods";
import { requireWorkspacePermission, type ServerUserClient } from "./server-auth.server";
import { sha256Hex } from "./source-file-utils";

const SOURCE_BUCKET = "source-files";

interface StoredSourceRow {
  source_kind: SourceFile["kind"];
  original_name: string;
  sha256: string;
  storage_path: string;
}

export interface ReanalyzePeriodResult {
  periodId: string;
  supersedesPeriodId: string;
  engineVersion: string;
  branchCount: number;
  dailyCount: number;
}

function contentType(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  return "application/octet-stream";
}

async function loadCurrentPeriod(
  client: ServerUserClient,
  userId: string,
  periodId: string,
): Promise<StoredPeriod> {
  const { data, error } = await client
    .from("periods")
    .select("*")
    .eq("id", periodId)
    .eq("user_id", userId)
    .is("superseded_at", null)
    .maybeSingle();

  if (error) throw new Error("تعذّر قراءة فترة التدقيق الحالية.");
  if (!data) {
    throw new Error(
      "لا يمكن إعادة تحليل هذه الفترة لأنها غير موجودة أو تم استبدالها بإصدار أحدث.",
    );
  }

  return data as unknown as StoredPeriod;
}

async function loadSourceFiles(
  client: ServerUserClient,
  userId: string,
  periodId: string,
): Promise<SourceFile[]> {
  const { data, error } = await client
    .from("audit_source_files")
    .select("source_kind, original_name, sha256, storage_path")
    .eq("user_id", userId)
    .eq("period_id", periodId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error("تعذّر قراءة ملفات المصدر المحفوظة لهذه الفترة.");
  }

  const rows = (data ?? []) as StoredSourceRow[];
  if (!rows.some((row) => row.source_kind === "data")) {
    throw new Error(
      "لا يمكن إعادة التحليل لأن ملف البيانات الأصلي غير محفوظ لهذه الفترة.",
    );
  }

  const sources: SourceFile[] = [];
  for (const row of rows) {
    const { data: blob, error: downloadError } = await client.storage
      .from(SOURCE_BUCKET)
      .download(row.storage_path);

    if (downloadError || !blob) {
      throw new Error(
        "تعذّر تنزيل أحد ملفات المصدر الأصلية؛ تم إيقاف إعادة التحليل.",
      );
    }

    const file = new File([blob], row.original_name, {
      type: blob.type || contentType(row.original_name),
    });

    const digest = await sha256Hex(file);
    if (digest !== row.sha256) {
      throw new Error(
        "فشلت مطابقة بصمة SHA-256 لأحد ملفات المصدر. تم إيقاف إعادة التحليل لحماية سلامة التدقيق.",
      );
    }

    sources.push({
      kind: row.source_kind,
      file,
    });
  }

  return sources;
}

function sourceForm(period: StoredPeriod, sources: SourceFile[]): FormData {
  const form = new FormData();
  form.set("platform", period.platform);
  form.set("label", period.label);

  for (const source of sources) {
    if (source.kind === "data") form.set("dataFile", source.file);
    if (source.kind === "invoice") form.set("invoiceFile", source.file);
    if (source.kind === "cpc_invoice") form.set("cpcFile", source.file);
    if (source.kind === "compensation") {
      form.set("compensationFile", source.file);
    }
  }

  if (
    period.platform === "hungerstation" &&
    period.summary.bankRateSource === "manual" &&
    (period.summary.bankRate ?? 0) > 0
  ) {
    form.set("bankRate", String((period.summary.bankRate ?? 0) * 100));
  }

  return form;
}

async function createVersion(
  client: ServerUserClient,
  oldPeriod: StoredPeriod,
  result: Awaited<ReturnType<typeof buildAnalysis>>["result"],
): Promise<string> {
  const invoicePayload = {
    ...result.invoice,
    checks: result.checks,
    exceptionWorkflow: oldPeriod.invoice?.exceptionWorkflow ?? {},
    // Column changes describe the uploaded file, which a re-analysis reuses unchanged.
    ...(oldPeriod.invoice?.columnChanges?.length ? { columnChanges: oldPeriod.invoice.columnChanges } : {}),
  };

  const { data, error } = await client.rpc("create_period_reanalysis", {
    p_old_period_id: oldPeriod.id,
    p_engine_version: ENGINE_VERSION,
    p_format_ids: (result.formatIds ?? []) as unknown as Json,
    p_summary: result.summary as unknown as Json,
    p_branches: result.branches as unknown as Json,
    p_daily: result.daily as unknown as Json,
    p_invoice: invoicePayload as unknown as Json,
  });

  if (error || !data) {
    if (error?.message?.includes("PERIOD_ALREADY_SUPERSEDED")) {
      throw new Error("تم إنشاء إصدار أحدث من هذه الفترة بالفعل.");
    }
    throw new Error("تعذّر إنشاء إصدار إعادة التحليل.");
  }

  return data;
}

async function rollbackVersion(
  client: ServerUserClient,
  oldPeriodId: string,
  newPeriodId: string,
): Promise<void> {
  const { error } = await client.rpc("rollback_period_reanalysis", {
    p_old_period_id: oldPeriodId,
    p_new_period_id: newPeriodId,
  });

  if (error) {
    console.error("Failed to rollback Tadqeeq reanalysis version", {
      oldPeriodId,
      newPeriodId,
      message: error.message,
    });
  }
}

export async function reanalyzePeriodOnServer(
  periodId: string,
): Promise<ReanalyzePeriodResult> {
  const { client, userId, workspaceId } = await requireWorkspacePermission("periods.reanalyze");
  const oldPeriod = await loadCurrentPeriod(client, userId, periodId);
  const originalSources = await loadSourceFiles(client, userId, periodId);
  const form = sourceForm(oldPeriod, originalSources);

  const { result, sources } = await buildAnalysis(
    form,
    oldPeriod.platform,
    client,
    userId,
    workspaceId,
    {},
    oldPeriod.id,
  );

  if (
    result.summary.periodStart !== oldPeriod.period_start ||
    result.summary.periodEnd !== oldPeriod.period_end
  ) {
    throw new Error(
      "الفترة المستخرجة من ملفات المصدر لم تعد تطابق الفترة الأصلية. تم إيقاف إعادة التحليل.",
    );
  }

  if (oldPeriod.platform === "hungerstation") {
    const mappingReview = buildHungerStationMappingReview(result.branches);
    if (mappingReview) {
      throw new Error(
        "إعادة التحليل تحتاج أولاً إلى تأكيد ربط فروع هنقرستيشن. استخدم رفع فترة جديدة لتأكيد الربط ثم أعد المحاولة.",
      );
    }
  }

  const newPeriodId = await createVersion(client, oldPeriod, result);

  try {
    await storeSources(
      client,
      userId,
      newPeriodId,
      oldPeriod.platform,
      sources,
    );
  } catch (cause) {
    await rollbackVersion(client, oldPeriod.id, newPeriodId);
    throw new Error(
      cause instanceof Error
        ? "تعذّر تثبيت ملفات إصدار إعادة التحليل؛ تم التراجع عن الإصدار الجديد: " +
            cause.message
        : "تعذّر تثبيت ملفات إصدار إعادة التحليل؛ تم التراجع عن الإصدار الجديد.",
    );
  }

  return {
    periodId: newPeriodId,
    supersedesPeriodId: oldPeriod.id,
    engineVersion: ENGINE_VERSION,
    branchCount: result.branches.length,
    dailyCount: result.daily.length,
  };
}
