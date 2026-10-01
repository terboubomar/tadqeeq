import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";

import { createMigratedDatabase } from "../test-support/database";

const OWNER = "00000000-0000-4000-8000-00000000c0c0";
let db: PGlite;
let workspace: string;

beforeAll(async () => {
  db = await createMigratedDatabase();
  await db.query("insert into auth.users (id, email) values ($1, 'owner@example.com')", [OWNER]);
  workspace = (await db.query<{ id: string }>("select id from public.workspaces where owner_user_id = $1", [OWNER])).rows[0]!.id;
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("contract audit trigger (0031)", () => {
  test("creating, editing and approving a contract is logged with its workspace", async () => {
    const contract = await db.query<{ id: string }>(
      "insert into public.platform_contracts (workspace_id, user_id, platform, name) values ($1, $2, 'hungerstation', 'HS 2026') returning id",
      [workspace, OWNER],
    );
    const contractId = contract.rows[0]!.id;
    await db.query("update public.platform_contracts set name = 'HS 2026 v2' where id = $1", [contractId]);

    const version = await db.query<{ id: string }>(
      `insert into public.contract_versions (workspace_id, user_id, contract_id, version_number, effective_from)
       values ($1, $2, $3, 1, '2026-01-01') returning id`,
      [workspace, OWNER, contractId],
    );
    const versionId = version.rows[0]!.id;
    await db.query(
      `insert into public.contract_fee_rules (workspace_id, user_id, contract_id, version_id, rule_key, rule_type, value_kind, numeric_value)
       values ($1, $2, $3, $4, 'commission', 'commission_rate', 'percentage', 18)`,
      [workspace, OWNER, contractId, versionId],
    );
    await db.query("update public.contract_versions set status = 'approved' where id = $1", [versionId]);

    const events = await db.query<{ entity_type: string; event_type: string; workspace_id: string }>(
      "select entity_type, event_type, workspace_id from public.contract_rule_events where contract_id = $1 order by created_at, id",
      [contractId],
    );
    expect(events.rows.every((row) => row.workspace_id === workspace)).toBe(true);
    const kinds = events.rows.map((row) => `${row.entity_type}:${row.event_type}`);
    expect(kinds).toContain("contract:insert");
    expect(kinds).toContain("contract:update");
    expect(kinds).toContain("version:insert");
    expect(kinds).toContain("rule:insert");
    expect(kinds).toContain("version:approve");
  });
});
