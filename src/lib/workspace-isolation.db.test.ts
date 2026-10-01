import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";

import { asUser, createMigratedDatabase } from "../test-support/database";
import { ROLE_PERMISSIONS, type WorkspaceRole } from "./workspace-access";

/**
 * Multi-tenant isolation against the real migrations and row-level security (PGlite).
 * Workspace A has every role; Workspace B is another restaurant company.
 */
const U = {
  ownerA: "00000000-0000-4000-8000-0000000000a1",
  adminA: "00000000-0000-4000-8000-0000000000a2",
  auditorA: "00000000-0000-4000-8000-0000000000a3",
  compensationA: "00000000-0000-4000-8000-0000000000a4",
  branchManagerA1: "00000000-0000-4000-8000-0000000000a5",
  viewerA: "00000000-0000-4000-8000-0000000000a6",
  ownerB: "00000000-0000-4000-8000-0000000000b1",
} as const;

const B = {
  a1: "10000000-0000-4000-8000-0000000000a1",
  a2: "10000000-0000-4000-8000-0000000000a2",
  b1: "10000000-0000-4000-8000-0000000000b1",
} as const;

let db: PGlite;
let wsA: string;
let wsB: string;

async function workspaceOf(owner: string): Promise<string> {
  const { rows } = await db.query<{ id: string }>("select id from public.workspaces where owner_user_id = $1", [owner]);
  return rows[0]!.id;
}

beforeAll(async () => {
  db = await createMigratedDatabase();
  // Signing up creates each user's own workspace and owner membership (as in production).
  for (const [name, id] of Object.entries(U)) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@example.com`]);
  }
  wsA = await workspaceOf(U.ownerA);
  wsB = await workspaceOf(U.ownerB);

  const members: Array<[string, WorkspaceRole]> = [
    [U.adminA, "admin"],
    [U.auditorA, "auditor"],
    [U.compensationA, "compensation"],
    [U.branchManagerA1, "branch_manager"],
    [U.viewerA, "viewer"],
  ];
  for (const [user, role] of members) {
    await db.query("insert into public.workspace_members (workspace_id, user_id, role, status) values ($1, $2, $3, 'active')", [wsA, user, role]);
  }

  for (const [id, ws, owner, name] of [
    [B.a1, wsA, U.ownerA, "فرع العليا"],
    [B.a2, wsA, U.ownerA, "فرع الملقا"],
    [B.b1, wsB, U.ownerB, "فرع الروضة"],
  ] as const) {
    await db.query("insert into public.branch_registry (id, workspace_id, user_id, name) values ($1, $2, $3, $4)", [id, ws, owner, name]);
  }
  // Branch managers and the compensation role are branch-scoped: both are assigned to A1 only.
  for (const user of [U.branchManagerA1, U.compensationA]) {
    await db.query(
      `insert into public.workspace_member_branches (workspace_id, workspace_member_id, branch_id)
       select $1, id, $2 from public.workspace_members where workspace_id = $1 and user_id = $3`,
      [wsA, B.a1, user],
    );
  }

  for (const [ws, owner, label] of [
    [wsA, U.ownerA, "A period"],
    [wsB, U.ownerB, "B period"],
  ] as const) {
    await db.query("insert into public.periods (workspace_id, user_id, platform, label) values ($1, $2, 'hungerstation', $3)", [ws, owner, label]);
    await db.query("insert into public.platform_contracts (workspace_id, user_id, platform, name) values ($1, $2, 'hungerstation', $3)", [ws, owner, label + " contract"]);
    await db.query(
      "insert into public.workspace_audit_events (workspace_id, actor_user_id, event_type, entity_type) values ($1, $2, 'test', 'workspace')",
      [ws, owner],
    );
  }

  let message = 1;
  for (const [ws, owner, branch, order] of [
    [wsA, U.ownerA, B.a1, "A1-ORDER"],
    [wsA, U.ownerA, B.a2, "A2-ORDER"],
    [wsB, U.ownerB, B.b1, "B1-ORDER"],
  ] as const) {
    const chat = await db.query<{ id: string }>(
      `insert into public.telegram_branch_chats (workspace_id, user_id, branch_id, branch_key, branch_name, telegram_chat_id)
       values ($1, $2, $3, $4, $4, $5) returning id`,
      [ws, owner, branch, order, -1000 - message],
    );
    await db.query(
      `insert into public.telegram_order_evidence
         (workspace_id, user_id, branch_id, branch_chat_id, order_number, order_lookup_key, telegram_chat_id,
          telegram_message_id, telegram_file_id, telegram_file_unique_id, media_type, captured_at)
       values ($1, $2, $3, $4, $5, $5, $6, $7, 'file-' || $5, 'uniq-' || $5, 'video', now())`,
      [ws, owner, branch, chat.rows[0]!.id, order, -1000 - message, message],
    );
    await db.query(
      `insert into public.compensation_cases
         (workspace_id, user_id, branch_id, platform, order_number, compensation_reason, employee_explanation, draft_ar, draft_en)
       values ($1, $2, $3, 'hungerstation', $4, 'missing item', 'explained', 'ar', 'en')`,
      [ws, owner, branch, order],
    );
    message += 1;
  }
}, 120_000);

afterAll(async () => {
  await db?.close();
});

const WORKSPACE_TABLES = [
  "branch_registry",
  "periods",
  "platform_contracts",
  "compensation_cases",
  "telegram_branch_chats",
  "telegram_order_evidence",
] as const;

describe("cross-workspace isolation", () => {
  for (const table of WORKSPACE_TABLES) {
    test(`${table}: each company reads only its own rows`, async () => {
      const a = await asUser<{ workspace_id: string }>(db, U.ownerA, `select workspace_id from public.${table}`);
      const b = await asUser<{ workspace_id: string }>(db, U.ownerB, `select workspace_id from public.${table}`);
      expect(a.error).toBeNull();
      expect(a.rows.length).toBeGreaterThan(0);
      expect(a.rows.every((row) => row.workspace_id === wsA)).toBe(true);
      expect(b.rows.length).toBeGreaterThan(0);
      expect(b.rows.every((row) => row.workspace_id === wsB)).toBe(true);
    });

    test(`${table}: a company cannot update or delete another company's rows`, async () => {
      const update = await asUser(db, U.ownerA, `update public.${table} set workspace_id = workspace_id where workspace_id = $1`, [wsB]);
      const remove = await asUser(db, U.ownerA, `delete from public.${table} where workspace_id = $1`, [wsB]);
      expect(update.affected).toBe(0);
      expect(remove.affected).toBe(0);
    });
  }

  test("a company cannot insert rows into another company", async () => {
    const period = await asUser(
      db,
      U.ownerA,
      "insert into public.periods (workspace_id, user_id, platform, label) values ($1, $2, 'keeta', 'injected')",
      [wsB, U.ownerB],
    );
    expect(period.error).not.toBeNull();
    const kase = await asUser(
      db,
      U.ownerA,
      `insert into public.compensation_cases (workspace_id, user_id, platform, order_number, compensation_reason, employee_explanation, draft_ar, draft_en)
       values ($1, $2, 'keeta', 'X-1', 'r', 'e', 'a', 'b')`,
      [wsB, U.ownerB],
    );
    expect(kase.error).not.toBeNull();
  });

  test("a guessed evidence id from another company returns nothing", async () => {
    const { rows } = await db.query<{ id: string }>("select id from public.telegram_order_evidence where workspace_id = $1", [wsB]);
    const guess = await asUser(db, U.ownerA, "select id from public.telegram_order_evidence where id = $1", [rows[0]!.id]);
    expect(guess.rows).toEqual([]);
  });

  test("audit events are visible only to the company's own authorised users", async () => {
    const a = await asUser<{ workspace_id: string }>(db, U.ownerA, "select workspace_id from public.workspace_audit_events");
    expect(a.rows.length).toBeGreaterThan(0);
    expect(a.rows.every((row) => row.workspace_id === wsA)).toBe(true);
    expect((await asUser(db, U.viewerA, "select * from public.workspace_audit_events")).rows).toEqual([]);
  });

  test("signed-out (anon) requests read nothing", async () => {
    for (const table of WORKSPACE_TABLES) {
      const result = await asUser(db, null, `select * from public.${table}`);
      expect({ table, rows: result.rows.length }).toEqual({ table, rows: 0 });
    }
  });
});

describe("branch-level isolation", () => {
  test("a branch manager sees compensation, evidence and branch chats of their branch only", async () => {
    for (const table of ["compensation_cases", "telegram_order_evidence", "telegram_branch_chats"]) {
      const result = await asUser<{ branch_id: string }>(db, U.branchManagerA1, `select branch_id from public.${table}`);
      expect({ table, error: result.error }).toEqual({ table, error: null });
      expect({ table, branches: [...new Set(result.rows.map((row) => row.branch_id))] }).toEqual({
        table,
        branches: [B.a1],
      });
    }
  });

  test("company-wide roles see every branch of their own company", async () => {
    for (const user of [U.ownerA, U.adminA, U.auditorA, U.viewerA]) {
      const result = await asUser<{ branch_id: string }>(db, user, "select branch_id from public.compensation_cases");
      expect({ user, branches: new Set(result.rows.map((row) => row.branch_id)) }).toEqual({
        user,
        branches: new Set([B.a1, B.a2]),
      });
    }
  });

  test("the compensation role is limited to its assigned branch", async () => {
    const result = await asUser<{ branch_id: string }>(db, U.compensationA, "select branch_id from public.compensation_cases");
    expect([...new Set(result.rows.map((row) => row.branch_id))]).toEqual([B.a1]);
    const otherBranch = await asUser(
      db,
      U.compensationA,
      `insert into public.compensation_cases (workspace_id, user_id, branch_id, platform, order_number, compensation_reason, employee_explanation, draft_ar, draft_en)
       values ($1, $2, $3, 'jahez', 'NEW-2', 'r', 'e', 'a', 'b')`,
      [wsA, U.ownerA, B.a2],
    );
    expect(otherBranch.error).not.toBeNull();
  });

  test("viewers do not see Telegram evidence (no telegram.read)", async () => {
    expect((await asUser(db, U.viewerA, "select id from public.telegram_order_evidence")).rows).toEqual([]);
  });

  test("a branch manager cannot change another branch's compensation case", async () => {
    const result = await asUser(db, U.branchManagerA1, "update public.compensation_cases set status = 'closed' where branch_id = $1", [B.a2]);
    expect(result.affected).toBe(0);
  });
});

describe("role permissions", () => {
  test("viewers cannot create compensation cases; the compensation role can", async () => {
    const insert = `insert into public.compensation_cases (workspace_id, user_id, branch_id, platform, order_number, compensation_reason, employee_explanation, draft_ar, draft_en)
                    values ($1, $2, $3, 'jahez', 'NEW-1', 'r', 'e', 'a', 'b')`;
    expect((await asUser(db, U.viewerA, insert, [wsA, U.ownerA, B.a1])).error).not.toBeNull();
    expect((await asUser(db, U.compensationA, insert, [wsA, U.ownerA, B.a1])).error).toBeNull();
  });

  test("Telegram evidence can only be written by the server (service role)", async () => {
    const { rows } = await db.query<{ id: string }>("select id from public.telegram_branch_chats where workspace_id = $1 limit 1", [wsA]);
    const insert = await asUser(
      db,
      U.ownerA,
      `insert into public.telegram_order_evidence
         (workspace_id, user_id, branch_id, branch_chat_id, order_number, order_lookup_key, telegram_chat_id,
          telegram_message_id, telegram_file_id, telegram_file_unique_id, media_type, captured_at)
       values ($1, $2, $3, $4, 'FORGED', 'FORGED', -1, 999, 'f', 'u', 'video', now())`,
      [wsA, U.ownerA, B.a1, rows[0]!.id],
    );
    expect(insert.error).not.toBeNull();
  });

  test("the database permission function matches the app's role matrix exactly", async () => {
    const permissions = ROLE_PERMISSIONS.owner;
    const users: Record<WorkspaceRole, string> = {
      owner: U.ownerA,
      admin: U.adminA,
      auditor: U.auditorA,
      compensation: U.compensationA,
      branch_manager: U.branchManagerA1,
      viewer: U.viewerA,
    };
    const mismatches: string[] = [];
    for (const [role, user] of Object.entries(users) as Array<[WorkspaceRole, string]>) {
      for (const permission of permissions) {
        const result = await asUser<{ allowed: boolean }>(
          db,
          user,
          "select private.has_workspace_permission($1, $2) as allowed",
          [wsA, permission],
        );
        const app = ROLE_PERMISSIONS[role].includes(permission);
        if (result.error || result.rows[0]?.allowed !== app) {
          mismatches.push(`${role}/${permission}: db=${result.rows[0]?.allowed ?? result.error} app=${app}`);
        }
      }
    }
    expect(mismatches).toEqual([]);
  });

  test("membership in one company grants nothing in another", async () => {
    const result = await asUser<{ allowed: boolean }>(db, U.ownerA, "select private.has_workspace_permission($1, 'periods.read') as allowed", [wsB]);
    expect(result.rows[0]?.allowed).toBe(false);
  });
});
