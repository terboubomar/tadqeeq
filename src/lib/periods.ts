import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

import type { AnalysisResult, BranchRow, DailyRow, InvoiceFigures, Summary } from "./analysis/types";
import type { ExceptionWorkflowEntry } from "./exceptions";
import type { ColumnChange } from "./smart-columns/changes";

export interface StoredPeriod {
  id: string;
  label: string;
  platform: "hungerstation" | "keeta" | "jahez";
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  engine_version: string;
  format_ids: string[];
  lineage_id?: string;
  supersedes_period_id?: string | null;
  superseded_by?: string | null;
  superseded_at?: string | null;
  summary: Summary;
  branches: BranchRow[];
  daily: DailyRow[];
  invoice: InvoiceFigures & {
    checks?: AnalysisResult["checks"];
    exceptionWorkflow?: Record<string, ExceptionWorkflowEntry>;
    /** Money columns new or gone since the workspace's earlier files (recorded at upload). */
    columnChanges?: ColumnChange[];
  };
}

export class DuplicatePeriodError extends Error {
  readonly existingPeriodId: string;
  readonly platform: StoredPeriod["platform"];
  readonly periodStart: string;
  readonly periodEnd: string;

  constructor(input: {
    existingPeriodId: string;
    platform: StoredPeriod["platform"];
    periodStart: string;
    periodEnd: string;
  }) {
    super("هذه الفترة محفوظة مسبقاً");
    this.name = "DuplicatePeriodError";
    this.existingPeriodId = input.existingPeriodId;
    this.platform = input.platform;
    this.periodStart = input.periodStart;
    this.periodEnd = input.periodEnd;
  }
}

export function isDuplicatePeriodConstraintError(
  error: { code?: string } | null | undefined,
): boolean {
  return error?.code === "23505";
}

export function normalizePeriodLabel(label: string): string {
  return label.trim().toLocaleLowerCase();
}

export function samePeriodRange(
  period: Pick<StoredPeriod, "platform" | "period_start" | "period_end">,
  input: {
    platform: StoredPeriod["platform"];
    periodStart: string | null;
    periodEnd: string | null;
  },
): boolean {
  return Boolean(
    input.periodStart &&
      input.periodEnd &&
      period.period_start &&
      period.period_end &&
      period.platform === input.platform &&
      period.period_start === input.periodStart &&
      period.period_end === input.periodEnd,
  );
}

export async function listPeriods(): Promise<StoredPeriod[]> {
  const { data, error } = await supabase
    .from("periods")
    .select("*")
    .is("superseded_at", null)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StoredPeriod[];
}

export async function getPeriod(id: string): Promise<StoredPeriod | null> {
  const { data, error } = await supabase.from("periods").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as StoredPeriod) ?? null;
}

export async function deletePeriod(id: string): Promise<string> {
  const { data, error } = await supabase
    .from("periods")
    .delete()
    .eq("id", id)
    .select("id")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data?.id) {
    throw new Error(
      "لم يتم حذف الفترة من قاعدة البيانات. حدّث الصفحة وحاول مرة أخرى.",
    );
  }

  return data.id;
}

export function workflowPatchForRpc(
  patch: Partial<ExceptionWorkflowEntry>,
): Json {
  const workflowPatch: Record<string, Json> = {};

  if (patch.status !== undefined) workflowPatch["status"] = patch.status;
  if (patch.note !== undefined) workflowPatch["note"] = patch.note;
  if (patch.recoveredAmount !== undefined) {
    workflowPatch["recoveredAmount"] = patch.recoveredAmount;
  }

  return workflowPatch as Json;
}

export async function updateExceptionWorkflow(
  periodId: string,
  exceptionId: string,
  patch: Partial<ExceptionWorkflowEntry>,
): Promise<StoredPeriod> {
  type WorkflowRpcClient = {
    rpc: (
      fn: "set_exception_workflow",
      args: {
        p_period_id: string;
        p_exception_id: string;
        p_patch: Json;
      },
    ) => PromiseLike<{
      data: Json | null;
      error: { message: string } | null;
    }>;
  };

  const workflowClient = supabase as unknown as WorkflowRpcClient;
  const { data, error } = await workflowClient.rpc("set_exception_workflow", {
    p_period_id: periodId,
    p_exception_id: exceptionId,
    p_patch: workflowPatchForRpc(patch),
  });

  if (error) {
    if (error.message.includes("PERIOD_NOT_FOUND")) {
      throw new Error("تعذّر العثور على فترة التدقيق.");
    }
    if (
      error.message.includes("INVALID_WORKFLOW") ||
      error.message.includes("INVALID_RECOVERED_AMOUNT") ||
      error.message.includes("INVALID_EXCEPTION_ID")
    ) {
      throw new Error("تعذّر حفظ تحديث الاستثناء لأن بيانات التحديث غير صالحة.");
    }
    throw new Error(error.message);
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("تعذّر قراءة فترة التدقيق بعد تحديث الاستثناء.");
  }

  return data as unknown as StoredPeriod;
}

export function toAnalysis(period: StoredPeriod): AnalysisResult {
  const { checks, ...invoice } = period.invoice ?? { lines: [] };
  return {
    platform: period.platform,
    formatIds: period.format_ids ?? [],
    label: period.label,
    summary: period.summary,
    branches: period.branches ?? [],
    daily: period.daily ?? [],
    invoice: invoice as InvoiceFigures,
    checks: checks ?? [],
  };
}

const SELECTED_KEY = "tadqeeq:selected-period";

export function rememberPeriod(id: string | null) {
  try {
    if (id) {
      localStorage.setItem(SELECTED_KEY, id);
    } else {
      localStorage.removeItem(SELECTED_KEY);
    }
  } catch {
    /* storage unavailable */
  }
}

export function recallPeriod(): string | null {
  try {
    return localStorage.getItem(SELECTED_KEY);
  } catch {
    return null;
  }
}
