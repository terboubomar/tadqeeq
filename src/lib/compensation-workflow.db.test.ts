import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";

import { applyMigration, asUser, createMigratedDatabase } from "../test-support/database";
import { caseWriteErrorMessage, normalizeOrderLookupKey } from "./compensation-evidence";
import {
  advanceCaseWorkflow,
  buildCompensationOverview,
  readCaseWorkflow,
  type CompensationCaseStatus,
  type OverviewCase,
} from "./compensation-overview";

/**
 * End-to-end compensation flow on the real schema and row-level security: a branch is
 * connected to Telegram, evidence arrives, an employee finds it, opens a case and moves it to
 * a partial recovery, then closes it. Also covers the duplicate guards of migration 0032.
 */
const OWNER = "00000000-0000-4000-8000-00000000e001";
const AGENT = "00000000-0000-4000-8000-00000000e002";
const BRANCH = "20000000-0000-4000-8000-00000000e001";
const ORDER = "HS-1001";

let db: PGlite;
let workspace: string;
let evidenceId: string;
let secondEvidenceId: string;

beforeAll(async () => {
  db = await createMigratedDatabase();
  await db.query("insert into auth.users (id, email) values ($1, 'owner@example.com'), ($2, 'agent@example.com')", [OWNER, AGENT]);
  workspace = (await db.query<{ id: string }>("select id from public.workspaces where owner_user_id = $1", [OWNER])).rows[0]!.id;

  // Branch and a compensation employee assigned to it.
  await db.query("insert into public.branch_registry (id, workspace_id, user_id, name) values ($1, $2, $3, 'فرع الملقا')", [BRANCH, workspace, OWNER]);
  const member = await db.query<{ id: string }>(
    "insert into public.workspace_members (workspace_id, user_id, role, status) values ($1, $2, 'compensation', 'active') returning id",
    [workspace, AGENT],
  );
  await db.query(
    "insert into public.workspace_member_branches (workspace_id, workspace_member_id, branch_id) values ($1, $2, $3)",
    [workspace, member.rows[0]!.id, BRANCH],
  );

  // Telegram group connected to the branch, and two evidence messages saved by the bot (service role).
  const chat = await db.query<{ id: string }>(
    `insert into public.telegram_branch_chats (workspace_id, user_id, branch_id, branch_key, branch_name, telegram_chat_id, active)
     values ($1, $2, $3, 'malqa', 'فرع الملقا', -100777, true) returning id`,
    [workspace, OWNER, BRANCH],
  );
  const insertEvidence = async (order: string, message: number) =>
    (
      await db.query<{ id: string }>(
        `insert into public.telegram_order_evidence
           (workspace_id, user_id, branch_id, branch_chat_id, order_number, order_lookup_key, telegram_chat_id,
            telegram_message_id, telegram_file_id, telegram_file_unique_id, media_type, captured_at)
         values ($1, $2, $3, $4, $5, $6, -100777, $7::bigint, 'file-' || $7::text, 'uniq-' || $7::text, 'photo', now()) returning id`,
        [workspace, OWNER, BRANCH, chat.rows[0]!.id, order, normalizeOrderLookupKey(order), message],
      )
    ).rows[0]!.id;
  evidenceId = await insertEvidence(ORDER, 1);
  secondEvidenceId = await insertEvidence("HS-2002", 2);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

const INSERT_CASE = `insert into public.compensation_cases
  (workspace_id, user_id, branch_id, evidence_id, platform, order_number, compensation_amount,
   compensation_reason, employee_explanation, draft_ar, draft_en, status, audit_context)
  values ($1, $2, $3, $4, 'hungerstation', $5, 100, 'Missing item', 'Photo shows the item packed', 'ar', 'en', $6, $7)
  returning id`;

describe("compensation workflow end to end", () => {
  test("evidence → case → submitted → accepted → partial recovery → closed keeps the recovered SAR", async () => {
    // The employee finds the evidence by order number.
    const found = await asUser<{ id: string }>(db, AGENT, "select id from public.telegram_order_evidence where order_lookup_key = $1", [
      normalizeOrderLookupKey(" hs-1001 "),
    ]);
    expect(found.rows.map((row) => row.id)).toEqual([evidenceId]);

    // Each step is written exactly as the server does: status plus audit_context.workflow.
    const at = (day: number) => `2026-09-${String(day).padStart(2, "0")}T10:00:00.000Z`;
    let workflow = advanceCaseWorkflow(readCaseWorkflow(null), null, { status: "ready", compensationAmount: 100 }, at(1));

    await db.exec("begin");
    try {
      // Writes run as the employee and persist inside this transaction for the whole scenario.
      await db.query("select set_config('request.jwt.claim.sub', $1, true)", [AGENT]);
      await db.exec("set local role authenticated");
      const created = await db.query<{ id: string }>(INSERT_CASE, [
        workspace,
        OWNER,
        BRANCH,
        evidenceId,
        ORDER,
        "ready",
        JSON.stringify({ workflow }),
      ]);
      const caseId = created.rows[0]!.id;

      const steps: Array<[CompensationCaseStatus, number, number | null]> = [
        ["submitted", 2, null],
        ["accepted", 5, null],
        ["recovered", 9, 65],
        ["closed", 10, null],
      ];
      let previous: CompensationCaseStatus = "ready";
      for (const [status, day, recoveredAmount] of steps) {
        workflow = advanceCaseWorkflow(workflow, previous, { status, compensationAmount: 100, recoveredAmount }, at(day));
        const updated = await db.query("update public.compensation_cases set status = $1, audit_context = $2 where id = $3", [
          status,
          JSON.stringify({ workflow }),
          caseId,
        ]);
        expect(updated.affectedRows).toBe(1);
        previous = status;
      }

      // Repeating the last transition (double click / retried request) adds no history.
      const again = advanceCaseWorkflow(workflow, "closed", { status: "closed", compensationAmount: 100 }, at(11));
      expect(again.history).toEqual(workflow.history);

      const stored = await db.query<{
        id: string;
        platform: string;
        branch_name: string | null;
        compensation_amount: string;
        status: string;
        created_at: string;
        updated_at: string;
        audit_context: unknown;
      }>("select * from public.compensation_cases where id = $1", [caseId]);
      const row = stored.rows[0]!;
      expect(row.status).toBe("closed");
      expect(readCaseWorkflow(row.audit_context).history.map((entry) => entry.status)).toEqual([
        "ready",
        "submitted",
        "accepted",
        "recovered",
        "closed",
      ]);

      const asOverview: OverviewCase = {
        platform: row.platform,
        branchName: row.branch_name,
        compensationAmount: Number(row.compensation_amount),
        status: row.status,
        createdAt: at(1),
        updatedAt: at(10),
        auditContext: row.audit_context,
      };
      const overview = buildCompensationOverview([asOverview], [], { range: "all", platform: "all", now: new Date(at(20)) });
      expect(overview.claimedAmount).toBe(100);
      expect(overview.recoveredAmount).toBe(65);
      expect(overview.recoveryShortfall).toBe(35);
      expect(overview.recoveryRate).toBeCloseTo(0.65);
      expect(overview.avgDaysToRecover).toBeCloseTo(7);
    } finally {
      await db.exec("rollback");
    }
  });
});

/** Runs a statement inside the current transaction; a failure is rolled back to a savepoint and returned. */
async function attempt(sql: string, params: unknown[]): Promise<{ code: string; message: string } | null> {
  await db.exec("savepoint attempt");
  try {
    await db.query(sql, params);
    await db.exec("release savepoint attempt");
    return null;
  } catch (error) {
    await db.exec("rollback to savepoint attempt");
    const e = error as { code?: string; message?: string };
    return { code: e.code ?? "", message: e.message ?? String(error) };
  }
}

describe("duplicate protection (0032)", () => {
  const workflow = JSON.stringify({ workflow: { history: [], recoveredAmount: null, rejectionReason: null } });

  test("a second case for the same order and platform is refused, whatever the spacing or case", async () => {
    await db.exec("begin");
    try {
      await db.query(INSERT_CASE, [workspace, OWNER, BRANCH, null, ORDER, "ready", workflow]);
      const duplicate = await attempt(INSERT_CASE, [workspace, OWNER, BRANCH, null, " hs-1001 ", "draft", workflow]);
      expect(duplicate?.code).toBe("23505");
      expect(caseWriteErrorMessage(duplicate!)).toContain("يوجد حالة تعويض لهذا الطلب");
    } finally {
      await db.exec("rollback");
    }
  });

  test("the same order on another platform is a separate claim", async () => {
    await db.exec("begin");
    try {
      await db.query(INSERT_CASE, [workspace, OWNER, BRANCH, null, ORDER, "ready", workflow]);
      const other = await db.query(
        INSERT_CASE.replace("'hungerstation'", "'keeta'"),
        [workspace, OWNER, BRANCH, null, ORDER, "ready", workflow],
      );
      expect(other.rows).toHaveLength(1);
    } finally {
      await db.exec("rollback");
    }
  });

  test("one piece of evidence cannot back two cases", async () => {
    await db.exec("begin");
    try {
      await db.query(INSERT_CASE, [workspace, OWNER, BRANCH, secondEvidenceId, "HS-2002", "ready", workflow]);
      const reuse = await attempt(INSERT_CASE, [workspace, OWNER, BRANCH, secondEvidenceId, "HS-9999", "ready", workflow]);
      expect(reuse?.code).toBe("23505");
      expect(caseWriteErrorMessage(reuse!)).toContain("هذا الدليل مرتبط بحالة");
    } finally {
      await db.exec("rollback");
    }
  });

  test("the same Telegram message is stored once", async () => {
    const chat = await db.query<{ id: string }>("select id from public.telegram_branch_chats where workspace_id = $1", [workspace]);
    let error: { code?: string } | null = null;
    try {
      await db.query(
        `insert into public.telegram_order_evidence
           (workspace_id, user_id, branch_id, branch_chat_id, order_number, order_lookup_key, telegram_chat_id,
            telegram_message_id, telegram_file_id, telegram_file_unique_id, media_type, captured_at)
         values ($1, $2, $3, $4, 'HS-1001', 'HS-1001', -100777, 1, 'again', 'again', 'photo', now())`,
        [workspace, OWNER, BRANCH, chat.rows[0]!.id],
      );
    } catch (caught) {
      error = caught as { code?: string };
    }
    expect(error?.code).toBe("23505");
  });
});

describe("0032 on a database that already has duplicates", () => {
  test("the migration does not fail; it skips the index so the duplicates can be resolved first", async () => {
    const legacy = await createMigratedDatabase({ before: "0032_compensation_case_uniqueness" });
    try {
      await legacy.query("insert into auth.users (id, email) values ($1, 'legacy@example.com')", [OWNER]);
      const ws = (await legacy.query<{ id: string }>("select id from public.workspaces where owner_user_id = $1", [OWNER])).rows[0]!.id;
      for (const order of ["HS-5", "hs-5 "]) {
        await legacy.query(
          `insert into public.compensation_cases (workspace_id, user_id, platform, order_number, compensation_reason, employee_explanation, draft_ar, draft_en)
           values ($1, $2, 'hungerstation', $3, 'r', 'e', 'a', 'b')`,
          [ws, OWNER, order],
        );
      }
      await applyMigration(legacy, "0032_compensation_case_uniqueness");
      const indexes = await legacy.query<{ indexname: string }>(
        "select indexname from pg_indexes where tablename = 'compensation_cases' and indexname like '%uidx'",
      );
      expect(indexes.rows.map((row) => row.indexname)).toEqual(["compensation_cases_workspace_evidence_uidx"]);
    } finally {
      await legacy.close();
    }
  }, 120_000);
});
