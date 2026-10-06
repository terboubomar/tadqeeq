import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

/**
 * Workspace tables whose workspace_id is ON DELETE CASCADE (or not a foreign key),
 * so deleting the workspace row removes them without an explicit delete.
 */
const CASCADES_WITH_WORKSPACE = [
  "client_notes",
  "journal_account_settings",
  "mcp_audit_requests",
  "ops_audit_log",
  "payments",
  "subscriptions",
  "workspace_audit_events",
  "workspace_member_branches",
  "workspace_members",
  "workspace_onboarding",
];

/** Tables that have a workspace_id column in the generated Supabase types. */
async function workspaceTables() {
  const types = await readFile(path.join(root, "src/integrations/supabase/types.ts"), "utf8");
  const tables = types.split("Tables: {")[1]?.split("Views: {")[0] ?? "";
  return [...tables.matchAll(/\n {6}(\w+): \{\n {8}Row: \{([\s\S]*?)\n {8}\}/g)]
    .filter((m) => /\n\s+workspace_id:/.test(m[2]))
    .map((m) => m[1]);
}

async function deleteOrder() {
  const source = await readFile(path.join(root, "src/lib/ops.server.ts"), "utf8");
  const list = source.match(/const OWNED_TABLES_DELETE_ORDER = \[([\s\S]*?)\];/);
  if (!list) throw new Error("OWNED_TABLES_DELETE_ORDER not found");
  return [...list[1].matchAll(/"(\w+)"/g)].map((m) => m[1]);
}

describe("ops client delete", () => {
  test("every workspace table is deleted explicitly or cascades with the workspace", async () => {
    const order = new Set(await deleteOrder());
    const tables = await workspaceTables();
    expect(tables.length).toBeGreaterThan(20);
    const unhandled = tables.filter((t) => !order.has(t) && !CASCADES_WITH_WORKSPACE.includes(t));
    expect(unhandled).toEqual([]);
  });

  test("the delete order only names workspace tables, each once", async () => {
    const order = await deleteOrder();
    const tables = new Set(await workspaceTables());
    expect(order.filter((t) => !tables.has(t))).toEqual([]);
    expect(new Set(order).size).toBe(order.length);
  });

  test("child tables are deleted before the tables they reference", async () => {
    const order = await deleteOrder();
    const before = (child: string, parent: string) => expect(order.indexOf(child)).toBeLessThan(order.indexOf(parent));
    before("recovery_case_documents", "recovery_case_details");
    before("recovery_case_details", "periods");
    before("contract_fee_rules", "contract_versions");
    before("contract_versions", "platform_contracts");
    before("compensation_cases", "telegram_order_evidence");
    before("telegram_order_evidence", "telegram_branch_chats");
    before("compensation_cases", "branch_registry");
    before("telegram_branch_chats", "branch_registry");
    before("smart_watch_acceptances", "periods");
  });
});
