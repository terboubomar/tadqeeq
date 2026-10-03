import type { Platform } from "../analysis/types";
import type { ServerUserClient } from "../server-auth.server";
import type { ColumnSnapshot } from "./changes";
import type { ColumnAlias } from "./match";

/**
 * Confirmed column matches (migration 0035). Missing table → no stored matches: uploads still
 * offer the matching step, the answer is just not remembered.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseClient = { from: (table: string) => any };

const TABLE = "format_column_aliases";

function isTableMissing(error: { code?: string; message: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205" || (/format_column_aliases/.test(error.message) && /does not exist|schema cache/i.test(error.message));
}

export async function loadColumnAliases(client: ServerUserClient, ownerUserId: string, platform: Platform): Promise<ColumnAlias[]> {
  const { data, error } = await (client as unknown as LooseClient)
    .from(TABLE)
    .select("source,canonical,observed")
    .eq("user_id", ownerUserId)
    .eq("platform", platform);
  if (error) {
    if (isTableMissing(error)) return [];
    throw new Error(error.message);
  }
  return ((data ?? []) as ColumnAlias[]).map((row) => ({ source: row.source, canonical: row.canonical, observed: row.observed }));
}

export async function saveColumnAliases(
  client: ServerUserClient,
  input: { workspaceId: string; ownerUserId: string; actorUserId: string; platform: Platform; aliases: ColumnAlias[] },
): Promise<void> {
  if (input.aliases.length === 0) return;
  const { error } = await (client as unknown as LooseClient).from(TABLE).upsert(
    input.aliases.map((alias) => ({
      workspace_id: input.workspaceId,
      user_id: input.ownerUserId,
      created_by: input.actorUserId,
      platform: input.platform,
      source: alias.source,
      canonical: alias.canonical,
      observed: alias.observed,
      created_at: new Date().toISOString(),
    })),
    { onConflict: "workspace_id,platform,source,observed" },
  );
  // The analysis itself succeeded; failing to remember the match only means asking again next time.
  if (error && !isTableMissing(error)) console.error("Failed to save column aliases", error.message);
}

const SNAPSHOTS = "platform_column_snapshots";

function isSnapshotTableMissing(error: { code?: string; message: string }): boolean {
  return error.code === "42P01" || error.code === "PGRST205" || (/platform_column_snapshots/.test(error.message) && /does not exist|schema cache/i.test(error.message));
}

/** Remembered columns for a platform; null when migration 0036 is not applied (no reports then). */
export async function loadColumnSnapshots(client: ServerUserClient, ownerUserId: string, platform: Platform): Promise<ColumnSnapshot[] | null> {
  const { data, error } = await (client as unknown as LooseClient)
    .from(SNAPSHOTS)
    .select("source,columns")
    .eq("user_id", ownerUserId)
    .eq("platform", platform);
  if (error) {
    if (isSnapshotTableMissing(error)) return null;
    throw new Error(error.message);
  }
  return ((data ?? []) as Array<{ source: string; columns: ColumnSnapshot["columns"] }>).map((row) => ({
    source: row.source,
    columns: Array.isArray(row.columns) ? row.columns : [],
  }));
}

export async function saveColumnSnapshots(
  client: ServerUserClient,
  input: { workspaceId: string; ownerUserId: string; platform: Platform; snapshots: ColumnSnapshot[] },
): Promise<void> {
  if (input.snapshots.length === 0) return;
  const { error } = await (client as unknown as LooseClient).from(SNAPSHOTS).upsert(
    input.snapshots.map((snapshot) => ({
      workspace_id: input.workspaceId,
      user_id: input.ownerUserId,
      platform: input.platform,
      source: snapshot.source,
      columns: snapshot.columns,
      updated_at: new Date().toISOString(),
    })),
    { onConflict: "workspace_id,platform,source" },
  );
  if (error && !isSnapshotTableMissing(error)) console.error("Failed to save column snapshots", error.message);
}
