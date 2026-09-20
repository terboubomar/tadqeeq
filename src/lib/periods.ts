import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";

import type { AnalysisResult, BranchRow, DailyRow, InvoiceFigures, Summary } from "./analysis/types";
import type { ExceptionWorkflowEntry } from "./exceptions";

export interface StoredPeriod {
  id: string;
  label: string;
  platform: "hungerstation" | "keeta";
  period_start: string | null;
  period_end: string | null;
  created_at: string;
  summary: Summary;
  branches: BranchRow[];
  daily: DailyRow[];
  invoice: InvoiceFigures & {
    checks?: AnalysisResult["checks"];
    exceptionWorkflow?: Record<string, ExceptionWorkflowEntry>;
  };
}

export async function listPeriods(): Promise<StoredPeriod[]> {
  const { data, error } = await supabase
    .from("periods")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as StoredPeriod[];
}

export async function getPeriod(id: string): Promise<StoredPeriod | null> {
  const { data, error } = await supabase.from("periods").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  return (data as unknown as StoredPeriod) ?? null;
}

export async function savePeriod(result: AnalysisResult): Promise<StoredPeriod> {
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth.user?.id;
  if (!userId) throw new Error("الجلسة منتهية، يرجى تسجيل الدخول مرة أخرى.");

  const { data, error } = await supabase
    .from("periods")
    .insert({
      user_id: userId,
      platform: result.platform,
      label: result.label,
      period_start: result.summary.periodStart,
      period_end: result.summary.periodEnd,
      summary: result.summary as unknown as Json,
      branches: result.branches as unknown as Json,
      daily: result.daily as unknown as Json,
      invoice: { ...result.invoice, checks: result.checks } as unknown as Json,
    })
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as StoredPeriod;
}

export async function deletePeriod(id: string): Promise<void> {
  const { error } = await supabase.from("periods").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

export async function updateExceptionWorkflow(
  periodId: string,
  exceptionId: string,
  patch: Partial<ExceptionWorkflowEntry>,
): Promise<StoredPeriod> {
  const period = await getPeriod(periodId);
  if (!period) throw new Error("تعذّر العثور على فترة التدقيق.");

  const currentWorkflow = period.invoice?.exceptionWorkflow ?? {};
  const current = currentWorkflow[exceptionId] ?? { status: "new" as const };
  const next: ExceptionWorkflowEntry = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };

  const invoice = {
    ...period.invoice,
    exceptionWorkflow: {
      ...currentWorkflow,
      [exceptionId]: next,
    },
  };

  const { data, error } = await supabase
    .from("periods")
    .update({ invoice: invoice as unknown as Json })
    .eq("id", periodId)
    .select("*")
    .single();

  if (error) throw new Error(error.message);
  return data as unknown as StoredPeriod;
}

export function toAnalysis(period: StoredPeriod): AnalysisResult {
  const { checks, ...invoice } = period.invoice ?? { lines: [] };
  return {
    platform: period.platform,
    label: period.label,
    summary: period.summary,
    branches: period.branches ?? [],
    daily: period.daily ?? [],
    invoice: invoice as InvoiceFigures,
    checks: checks ?? [],
  };
}

const SELECTED_KEY = "tadqeeq:selected-period";

export function rememberPeriod(id: string) {
  try {
    localStorage.setItem(SELECTED_KEY, id);
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
