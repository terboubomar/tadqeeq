import type { JournalPlatform, SavedCostCenters } from "./journal-cost-centers";
import { requireWorkspacePermission } from "./server-auth.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the generated types predate migration 0055
type LooseClient = { from: (table: string) => any };

const TABLE_MISSING = "مراكز التكلفة تحتاج تحديث قاعدة البيانات (migration 0055).";

function tableError(error: { code?: string; message: string }): Error {
  if (error.code === "42P01" || (/journal_cost_centers/.test(error.message) && /does not exist|schema cache/i.test(error.message))) {
    return new Error(TABLE_MISSING);
  }
  return new Error(error.message);
}

export async function getJournalCostCentersOnServer(platform: JournalPlatform): Promise<SavedCostCenters> {
  const { client, workspaceId } = await requireWorkspacePermission("financials.read");
  const { data, error } = await (client as unknown as LooseClient)
    .from("journal_cost_centers")
    .select("branch_key,cost_center")
    .eq("workspace_id", workspaceId)
    .eq("platform", platform);
  if (error) {
    // Before the migration is run, entries simply have no cost center.
    if (tableError(error).message === TABLE_MISSING) return {};
    throw tableError(error);
  }
  const saved: SavedCostCenters = {};
  for (const row of (data ?? []) as Array<{ branch_key: string; cost_center: string }>) {
    if (row.cost_center) saved[row.branch_key] = row.cost_center;
  }
  return saved;
}

export async function saveJournalCostCentersOnServer(
  platform: JournalPlatform,
  branches: Array<{ key: string; name: string; costCenter: string }>,
): Promise<SavedCostCenters> {
  const { client, workspaceId, userId, actorUserId } = await requireWorkspacePermission("contracts.manage");
  const rows = branches
    .filter((branch) => branch.key.trim())
    .map((branch) => ({
      workspace_id: workspaceId,
      user_id: userId,
      platform,
      branch_key: branch.key.trim().slice(0, 200),
      branch_name: branch.name.trim().slice(0, 200),
      cost_center: branch.costCenter.trim().slice(0, 60),
      updated_by: actorUserId,
      updated_at: new Date().toISOString(),
    }));
  if (rows.length) {
    const { error } = await (client as unknown as LooseClient)
      .from("journal_cost_centers")
      .upsert(rows, { onConflict: "workspace_id,platform,branch_key" });
    if (error) throw tableError(error);
  }
  return getJournalCostCentersOnServer(platform);
}
