import type { Json } from "@/integrations/supabase/types";

import { ENGINE_VERSION } from "./analysis/version";
import type { Platform } from "./analysis/types";
import { buildPeriodExceptions } from "./exceptions";
import {
  buildAuditAnalysisFromForm,
} from "./import-audit.server";
import type { StoredPeriod } from "./periods";
import { requireServerUser, type ServerUserClient } from "./server-auth.server";

const SOURCE_BUCKET = "source-files";

interface StoredSourceFile {
  source_kind: "data" | "invoice" | "cpc_invoice" | "compensation";
  original_name: string;
  storage_path: string;
}

export interface ReanalyzePeriodResult {
  periodId: string;
  revision: number;
  preservedWorkflowCount: number;
}

function contentTypeForName(name: string): string {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".csv")) return "text/csv";
  if (lower.endsWith(".xlsx")) {
    return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
  }
  if (lower.endsWith(".xls")) return "application/vnd.ms-excel";
  return "application/octet-stream";
}

async function fetchCurrentPeriod(
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

  if (error) throw new Error("تعذّر قراءة فترة التدقيق لإعادة التحليل.");
  if (!data) {
    throw new Error(
      "هذه الفترة ليست الإصدار الحالي أو لم يعد من الممكن إعادة تحليلها.",
    );
  }

  return data as unknown as StoredPeriod;
}

async function fetchSourceMetadata(
  client: ServerUserClient,
  userId: string,
  periodId: string,
): Promise<StoredSourceFile[]> {
  const { data, error } = await client
    .from("audit_source_files")
    .select("source_kind, original_name, storage_path")
    .eq("period_id", periodId)
    .eq("user_id", userId)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error("تعذّر قراءة ملفات مصدر فترة التدقيق.");
  }

  const sources = (data ?? []) as StoredSourceFile[];
  if (!sources.some((source) => source.source_kind === "data")) {
    throw new Error(
      "لا يمكن إعادة تحليل هذه الفترة لأن ملف البيانات الأصلي غير محفوظ.",
    );
  }
  return sources;
}

async function downloadSourceFiles(
  client: ServerUserClient,
  sources: StoredSourceFile[],
): Promise<Record<StoredSourceFile["source_kind"], File | undefined>> {
  const result: Partial<
    Record<StoredSourceFile["source_kind"], File>
  > = {};

  for (const source of sources) {
    if (result[source.source_kind]) {
      throw new Error(
        "تحتوي الفترة على أكثر من ملف مصدر من نفس النوع؛ تعذّر تحديد ملف إعادة التحليل.",
      );
    }

    const { data, error } = await client.storage
      .from(SOURCE_BUCKET)
      .download(source.storage_path);

    if (error || !data) {
      throw new Error(
        "تعذّر تنزيل أحد ملفات المصدر الأصلية لإعادة التحليل.",
      );
    }

    result[source.source_kind] = new File(
      [data],
      source.original_name,
      { type: data.type || contentTypeForName(source.original_name) },
    );
  }

  return result;
}

function historicalHungerStationIdentity(
  period: StoredPeriod,
): Record<string, string> {
  return Object.fromEntries(
    (period.branches ?? [])
      .filter(
        (branch) =>
          branch.branchAuditStatus !== "invoice_only" &&
          branch.branchId?.trim() &&
          branch.invoiceBranchName?.trim(),
      )
      .map((branch) => [
        branch.branchId.trim(),
        branch.invoiceBranchName!.trim(),
      ]),
  );
}

function buildReanalysisForm(
  period: StoredPeriod,
  sources: Record<StoredSourceFile["source_kind"], File | undefined>,
): FormData {
  const form = new FormData();
  form.set("platform", period.platform);
  form.set("label", period.label);

  const dataFile = sources.data;
  if (!dataFile) {
    throw new Error("ملف البيانات الأصلي مفقود.");
  }
  form.set("dataFile", dataFile);

  if (sources.invoice) form.set("invoiceFile", sources.invoice);
  if (sources.cpc_invoice) form.set("cpcFile", sources.cpc_invoice);
  if (sources.compensation) {
    form.set("compensationFile", sources.compensation);
  }

  if (
    period.platform === "hungerstation" &&
    period.summary.bankRateSource === "manual" &&
    typeof period.summary.bankRate === "number" &&
    period.summary.bankRate > 0
  ) {
    form.set("bankRate", String(period.summary.bankRate * 100));
  }

  return form;
}

function sameDate(left: string | null, right: string | null): boolean {
  return (left ?? "") === (right ?? "");
}

function assertSameAuditScope(
  source: StoredPeriod,
  platform: Platform,
  periodStart: string | null,
  periodEnd: string | null,
): void {
  if (
    source.platform !== platform ||
    !sameDate(source.period_start, periodStart) ||
    !sameDate(source.period_end, periodEnd)
  ) {
    throw new Error(
      "أنتجت إعادة التحليل نطاق فترة مختلفاً عن التدقيق الأصلي؛ لم يتم إنشاء إصدار جديد.",
    );
  }
}

export function preserveMatchingExceptionWorkflow(
  source: StoredPeriod,
  candidate: StoredPeriod,
): Record<string, unknown> {
  const sourceWorkflow = source.invoice?.exceptionWorkflow ?? {};
  const candidateIds = new Set(
    buildPeriodExceptions(candidate).map((exception) => exception.id),
  );
  const preserved: Record<string, unknown> = {};

  for (const exception of buildPeriodExceptions(source)) {
    if (!candidateIds.has(exception.id)) continue;

    const workflow =
      sourceWorkflow[exception.id] ??
      (exception.legacyId
        ? sourceWorkflow[exception.legacyId]
        : undefined);

    if (workflow) {
      preserved[exception.id] = workflow;
    }
  }

  return preserved;
}

async function createRevision(
  client: ServerUserClient,
  source: StoredPeriod,
  result: Awaited<
    ReturnType<typeof buildAuditAnalysisFromForm>
  >["result"],
): Promise<ReanalyzePeriodResult> {
  const newPeriodId = crypto.randomUUID();
  const revision = (source.analysis_revision ?? 1) + 1;
  const auditLineageId = source.audit_lineage_id || source.id;

  const candidate: StoredPeriod = {
    id: newPeriodId,
    label: source.label,
    platform: result.platform,
    period_start: result.summary.periodStart,
    period_end: result.summary.periodEnd,
    created_at: new Date().toISOString(),
    audit_lineage_id: auditLineageId,
    supersedes_period_id: source.id,
    superseded_at: null,
    analysis_revision: revision,
    engine_version: ENGINE_VERSION,
    format_ids: result.formatIds ?? [],
    summary: result.summary,
    branches: result.branches,
    daily: result.daily,
    invoice: {
      ...result.invoice,
      checks: result.checks,
    },
  };

  const preservedWorkflow = preserveMatchingExceptionWorkflow(
    source,
    candidate,
  );

  const invoice = {
    ...result.invoice,
    checks: result.checks,
    ...(Object.keys(preservedWorkflow).length
      ? { exceptionWorkflow: preservedWorkflow }
      : {}),
  } as unknown as Json;

  const { data, error } = await client.rpc("create_reanalysis_period", {
    p_source_period_id: source.id,
    p_new_period_id: newPeriodId,
    p_engine_version: ENGINE_VERSION,
    p_format_ids: (result.formatIds ?? []) as unknown as Json,
    p_summary: result.summary as unknown as Json,
    p_branches: result.branches as unknown as Json,
    p_daily: result.daily as unknown as Json,
    p_invoice: invoice,
  });

  if (error) {
    if (error.message.includes("PERIOD_NOT_CURRENT")) {
      throw new Error(
        "تم إنشاء إصدار أحدث من هذه الفترة بالفعل. حدّث الصفحة وحاول من الإصدار الحالي.",
      );
    }
    if (error.message.includes("PERIOD_NOT_FOUND")) {
      throw new Error("تعذّر العثور على فترة التدقيق.");
    }
    throw new Error("تعذّر حفظ إصدار إعادة التحليل: " + error.message);
  }

  if (data !== newPeriodId) {
    throw new Error("تعذّر التحقق من الإصدار الجديد بعد إعادة التحليل.");
  }

  return {
    periodId: newPeriodId,
    revision,
    preservedWorkflowCount: Object.keys(preservedWorkflow).length,
  };
}

export async function reanalyzePeriodOnServer(
  periodId: string,
): Promise<ReanalyzePeriodResult> {
  const { client, userId } = await requireServerUser();
  const source = await fetchCurrentPeriod(client, userId, periodId);
  const metadata = await fetchSourceMetadata(client, userId, source.id);
  const sources = await downloadSourceFiles(client, metadata);
  const form = buildReanalysisForm(source, sources);

  const { result } = await buildAuditAnalysisFromForm(
    form,
    source.platform,
    client,
    userId,
    {
      branchMappingsOverride:
        source.platform === "hungerstation"
          ? historicalHungerStationIdentity(source)
          : undefined,
      excludeHistoricalPeriodId: source.id,
    },
  );

  assertSameAuditScope(
    source,
    result.platform,
    result.summary.periodStart,
    result.summary.periodEnd,
  );

  return createRevision(client, source, result);
}
