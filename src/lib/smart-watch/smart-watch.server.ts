import { requireWorkspacePermission } from "../server-auth.server";
import type { WatchAcceptance, WatchMetric, WatchPlatform } from "./detect";

/**
 * Smart watch answers (migration 0034): the charge levels a user marked as expected.
 * The table is not in the generated Supabase types yet (see Phase 9), hence the loose client.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = { from: (table: string) => any };

const TABLE = "smart_watch_acceptances";

export const SMART_WATCH_TABLE_MISSING = "حفظ إجابات «رقيب» يحتاج تحديث قاعدة البيانات (migration 0034).";

function isTableMissing(error: { code?: string; message: string }): boolean {
  return error.code === "42P01" || (/smart_watch_/.test(error.message) && /does not exist|schema cache/i.test(error.message));
}

interface AcceptanceRow {
  platform: WatchPlatform;
  branch_key: string;
  metric: WatchMetric;
  accepted_rate: number | string;
}

export interface SmartWatchAcceptances {
  acceptances: WatchAcceptance[];
  /** False until migration 0034 is applied: alerts still show, answers cannot be saved. */
  available: boolean;
}

export async function listSmartWatchAcceptancesOnServer(): Promise<SmartWatchAcceptances> {
  const { client, workspaceId } = await requireWorkspacePermission("periods.read");
  const { data, error } = await (client as unknown as LooseClient)
    .from(TABLE)
    .select("platform,branch_key,metric,accepted_rate")
    .eq("workspace_id", workspaceId);
  if (error) {
    if (isTableMissing(error)) return { acceptances: [], available: false };
    throw new Error(error.message);
  }
  return {
    available: true,
    acceptances: ((data ?? []) as AcceptanceRow[]).map((row) => ({
      platform: row.platform,
      branchKey: row.branch_key,
      metric: row.metric,
      acceptedRate: Number(row.accepted_rate),
    })),
  };
}

export async function acceptSmartWatchAlertOnServer(input: {
  platform: WatchPlatform;
  branchKey: string;
  branchName: string;
  metric: WatchMetric;
  acceptedRate: number;
  typicalRate: number;
  periodId: string;
}): Promise<void> {
  const { client, workspaceId, userId, actorUserId } = await requireWorkspacePermission("exceptions.manage");
  const { error } = await (client as unknown as LooseClient).from(TABLE).upsert(
    {
      workspace_id: workspaceId,
      user_id: userId,
      created_by: actorUserId,
      platform: input.platform,
      branch_key: input.branchKey,
      branch_name: input.branchName,
      metric: input.metric,
      accepted_rate: Math.round(input.acceptedRate * 1e6) / 1e6,
      typical_rate: Math.round(input.typicalRate * 1e6) / 1e6,
      period_id: input.periodId,
      created_at: new Date().toISOString(),
    },
    { onConflict: "workspace_id,platform,branch_key,metric" },
  );
  if (error) throw new Error(isTableMissing(error) ? SMART_WATCH_TABLE_MISSING : error.message);
}

export async function undoSmartWatchAcceptanceOnServer(input: {
  platform: WatchPlatform;
  branchKey: string;
  metric: WatchMetric;
}): Promise<void> {
  const { client, workspaceId } = await requireWorkspacePermission("exceptions.manage");
  const { error } = await (client as unknown as LooseClient)
    .from(TABLE)
    .delete()
    .eq("workspace_id", workspaceId)
    .eq("platform", input.platform)
    .eq("branch_key", input.branchKey)
    .eq("metric", input.metric);
  if (error) throw new Error(isTableMissing(error) ? SMART_WATCH_TABLE_MISSING : error.message);
}
