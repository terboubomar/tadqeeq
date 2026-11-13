import { ToolError, type ToolContext } from "@lovable.dev/mcp-js";

import {
  buildCompensationOverview,
  caseFollowUp,
  caseRecoveredAmount,
  caseStatusLabel,
  isCaseRecovered,
  platformLabel,
  readCaseWorkflow,
  type CompensationCaseStatus,
  type CompensationPlatformKey,
  type OverviewRange,
} from "@/lib/compensation-overview";

import { supabaseForUser } from "./supabase";

/**
 * «استرداد» (compensation center) data for the MCP tools: the same cases and overview the app shows, read
 * with the user's own token so row-level security keeps them to the active workspace and its permissions.
 * Nothing here changes money; it only selects, labels and rounds.
 */

export interface McpCase {
  id: string;
  orderNumber: string;
  platform: string;
  branchName: string | null;
  compensationAmount: number;
  compensationReason: string;
  employeeExplanation: string;
  status: string;
  aggregatorCaseReference: string | null;
  evidenceId: string | null;
  draftAr: string;
  draftEn: string;
  auditContext: unknown;
  createdAt: string;
  updatedAt: string;
}

const round = (value: number) => Math.round(value * 100) / 100;

type CaseRow = {
  id: string;
  order_number: string;
  platform: string;
  branch_name: string | null;
  compensation_amount: number | string;
  compensation_reason: string;
  employee_explanation: string;
  status: string;
  aggregator_case_reference: string | null;
  evidence_id: string | null;
  draft_ar: string;
  draft_en: string;
  audit_context: unknown;
  created_at: string;
  updated_at: string;
};

export function mapCaseRow(row: CaseRow): McpCase {
  return {
    id: row.id,
    orderNumber: row.order_number,
    platform: row.platform,
    branchName: row.branch_name,
    compensationAmount: Number(row.compensation_amount) || 0,
    compensationReason: row.compensation_reason,
    employeeExplanation: row.employee_explanation,
    status: row.status,
    aggregatorCaseReference: row.aggregator_case_reference,
    evidenceId: row.evidence_id,
    draftAr: row.draft_ar,
    draftEn: row.draft_en,
    auditContext: row.audit_context,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** The workspace's compensation cases, newest change first (same cap as the app). */
export async function loadCases(ctx: ToolContext): Promise<McpCase[]> {
  const { data, error } = await supabaseForUser(ctx)
    .from("compensation_cases")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(5000);
  if (error) throw new ToolError(error.message);
  return ((data ?? []) as unknown as CaseRow[]).map(mapCaseRow);
}

export async function loadCase(ctx: ToolContext, caseId: string): Promise<McpCase> {
  const { data, error } = await supabaseForUser(ctx).from("compensation_cases").select("*").eq("id", caseId).maybeSingle();
  if (error) throw new ToolError(error.message);
  if (!data) {
    throw new ToolError("الحالة غير موجودة. استخدم list_compensation_cases لمعرفة الحالات. / Case not found; call list_compensation_cases.");
  }
  return mapCaseRow(data as unknown as CaseRow);
}

/** One line per case for lists. */
export function caseLine(item: McpCase, now: Date = new Date()) {
  const followUp = caseFollowUp(item, now);
  return {
    id: item.id,
    order_number: item.orderNumber,
    platform: platformLabel(item.platform),
    branch: item.branchName,
    amount_sar: round(item.compensationAmount),
    status: item.status,
    status_ar: caseStatusLabel(item.status),
    follow_up: followUp ? followUp.label : null,
    recovered_sar: isCaseRecovered(item) ? round(caseRecoveredAmount(item)) : null,
    platform_reference: item.aggregatorCaseReference,
    has_evidence: Boolean(item.evidenceId),
    created_at: item.createdAt,
    updated_at: item.updatedAt,
  };
}

/** The whole case: details, status history, rejection reason and the dispute text ready to send. */
export function caseDetail(item: McpCase, now: Date = new Date()) {
  const workflow = readCaseWorkflow(item.auditContext);
  return {
    ...caseLine(item, now),
    reason: item.compensationReason,
    employee_explanation: item.employeeExplanation,
    rejection_reason: workflow.rejectionReason,
    history: workflow.history.map((entry) => ({ status: entry.status, status_ar: caseStatusLabel(entry.status), at: entry.at, note: entry.note ?? null })),
    dispute_text_ar: item.draftAr,
    dispute_text_en: item.draftEn,
  };
}

export interface CaseFilter {
  status?: CompensationCaseStatus;
  platform?: CompensationPlatformKey;
  branch?: string;
  followUpOnly?: boolean;
}

export function filterCases(cases: McpCase[], filter: CaseFilter, now: Date = new Date()): McpCase[] {
  const branch = filter.branch?.trim().toLowerCase();
  return cases.filter(
    (item) =>
      (!filter.status || item.status === filter.status) &&
      (!filter.platform || item.platform === filter.platform) &&
      (!branch || (item.branchName ?? "").toLowerCase().includes(branch)) &&
      (!filter.followUpOnly || caseFollowUp(item, now) !== null),
  );
}

/** The overview as the app shows it: what needs action first, then the key numbers. */
export function overviewReadout(
  cases: McpCase[],
  options: { range: OverviewRange; platform: CompensationPlatformKey | "all"; now?: Date },
) {
  const o = buildCompensationOverview(cases, [], options);
  return {
    range: options.range,
    platform: options.platform,
    needs_action: {
      ready_to_send: { count: o.readyCount, amount_sar: o.readyAmount },
      needs_follow_up: {
        count: o.followUps.length,
        amount_sar: round(o.followUpAmount),
        cases: o.followUps.slice(0, 10).map((f) => ({
          id: f.id,
          order_number: f.orderNumber,
          platform: platformLabel(f.platform),
          branch: f.branchName,
          amount_sar: round(f.amount),
          why: f.followUp.label,
        })),
      },
      rejected: { count: o.rejectedCount, amount_sar: round(o.rejectedAmount) },
    },
    key_numbers: {
      recovered_sar: round(o.recoveredAmount),
      claimed_sar: round(o.claimedAmount),
      case_count: o.caseCount,
      recovery_rate: o.recoveryRate === null ? null : Math.round(o.recoveryRate * 10000) / 10000,
      recovery_rate_basis: "recovered ÷ amount already sent to the platforms",
      under_platform_review_sar: round(o.pendingAmount),
      under_platform_review_count: o.pendingCount,
      avg_days_to_recover: o.avgDaysToRecover === null ? null : Math.round(o.avgDaysToRecover * 10) / 10,
      partial_refund_gap_sar: round(o.recoveryShortfall),
    },
    by_platform: o.byPlatform.map((p) => ({ platform: platformLabel(p.platform), cases: p.count, claimed_sar: round(p.claimed), recovered_sar: round(p.recovered) })),
    top_branches: o.branches.slice(0, 8).map((b) => ({
      branch: b.name,
      cases: b.count,
      claimed_sar: round(b.claimed),
      recovered_sar: round(b.recovered),
      recovery_rate: b.recoveryRate === null ? null : Math.round(b.recoveryRate * 10000) / 10000,
    })),
  };
}

export const NO_CASES_HINT =
  "لا توجد حالات تعويض، أو أن باقتك لا تشمل «استرداد». استخدم get_account للتأكد. / No compensation cases, or the plan does not include Istirdad; call get_account.";
