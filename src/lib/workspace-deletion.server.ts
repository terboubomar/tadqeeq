import { supabaseAdmin } from "@/integrations/supabase/client.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

type Row = Record<string, unknown>;

/**
 * Workspace-owned tables, children first; their foreign keys to workspaces are ON DELETE RESTRICT.
 * compensation_cases references telegram_order_evidence, which references telegram_branch_chats.
 * Used by the ops client delete and by an owner deleting one of their companies.
 */
export const OWNED_TABLES_DELETE_ORDER = [
  "operation_adjustments",
  "operation_orders",
  "operation_imports",
  "recovery_case_events",
  "recovery_case_documents",
  "recovery_case_details",
  "compensation_appeal_marks",
  "compensation_cases",
  "telegram_order_evidence",
  "telegram_branch_chats",
  "exception_events",
  "format_change_alerts",
  "format_column_aliases",
  "platform_column_snapshots",
  "audit_source_files",
  "promotion_audits",
  "ads_roi_analyses",
  "ads_roi_brand_settings",
  "smart_watch_acceptances",
  "ai_usage",
  "hungerstation_branch_mappings",
  "contract_rule_events",
  "contract_fee_rules",
  "contract_documents",
  "contract_versions",
  "platform_contracts",
  "periods",
  "branch_registry",
];

/** Files stored for a workspace: [table, path column, bucket]. */
export const WORKSPACE_FILES: Array<[string, string, string]> = [
  ["audit_source_files", "storage_path", "source-files"],
  ["format_change_alerts", "storage_path", "source-files"],
  ["contract_documents", "storage_path", "contract-files"],
  ["recovery_case_documents", "storage_path", "recovery-case-files"],
  ["telegram_order_evidence", "thumbnail_storage_path", "telegram-evidence-thumbnails"],
  ["payments", "receipt_path", "ops-receipts"],
  ["workspace_onboarding", "logo_path", "workspace-logos"],
];

export async function collectWorkspaceFiles(
  workspaceId: string,
  files: Array<[string, string, string]> = WORKSPACE_FILES,
): Promise<Map<string, string[]>> {
  const byBucket = new Map<string, string[]>();
  for (const [table, column, bucket] of files) {
    const { data, error } = await db().from(table).select(column).eq("workspace_id", workspaceId);
    if (error) throw new Error(`${table}: ${error.message}`);
    const paths = ((data ?? []) as Row[]).map((r) => r[column]).filter((p): p is string => typeof p === "string" && p.length > 0);
    if (paths.length) byBucket.set(bucket, [...(byBucket.get(bucket) ?? []), ...paths]);
  }
  return byBucket;
}

/** How many platform contracts a workspace has; their database guards block a delete, so callers stop first. */
export async function countWorkspaceContracts(workspaceId: string): Promise<number> {
  const { count, error } = await db()
    .from("platform_contracts")
    .select("id", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);
  if (error) throw new Error(error.message);
  return count ?? 0;
}

/** Deletes a workspace's rows, children first, then the workspace itself (the rest cascades with it). */
export async function deleteWorkspaceRows(workspaceId: string): Promise<void> {
  for (const table of OWNED_TABLES_DELETE_ORDER) {
    const { error } = await db().from(table).delete().eq("workspace_id", workspaceId);
    // A table whose migration has not been applied yet holds no rows to delete.
    if (error && (error.code === "42P01" || error.code === "PGRST205")) continue;
    if (error) throw new Error(`تعذّر حذف بيانات ${table}: ${error.message}`);
  }
  const { error } = await db().from("workspaces").delete().eq("id", workspaceId);
  if (error) throw new Error(`تعذّر حذف مساحة العمل: ${error.message}`);
}

/** Removes stored files after their rows are gone; returns how many were removed. A failed bucket is logged, not thrown. */
export async function removeWorkspaceFiles(files: Map<string, string[]>): Promise<number> {
  let removed = 0;
  for (const [bucket, paths] of files) {
    for (let i = 0; i < paths.length; i += 100) {
      const chunk = paths.slice(i, i + 100);
      const { error } = await supabaseAdmin.storage.from(bucket).remove(chunk);
      if (error) console.error(`Failed to remove files from ${bucket}`, error.message);
      else removed += chunk.length;
    }
  }
  return removed;
}
