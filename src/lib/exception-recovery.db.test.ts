import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";

import { activateAllWorkspaces, asUser, createMigratedDatabase } from "../test-support/database";

/** Migration 0059: recovery statuses, owner, claimable amount and documents on exceptions; classification rules. */
const U = {
  ownerA: "00000000-0000-4000-8000-0000000059a1",
  viewerA: "00000000-0000-4000-8000-0000000059a2",
  ownerB: "00000000-0000-4000-8000-0000000059b1",
} as const;

let db: PGlite;
let wsA: string;
let wsB: string;
let periodA: string;

beforeAll(async () => {
  db = await createMigratedDatabase();
  for (const [name, id] of Object.entries(U)) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@example.com`]);
  }
  await activateAllWorkspaces(db);
  const ws = async (owner: string) =>
    (await db.query<{ id: string }>("select id from public.workspaces where owner_user_id = $1", [owner])).rows[0]!.id;
  wsA = await ws(U.ownerA);
  wsB = await ws(U.ownerB);
  await db.query("insert into public.workspace_members (workspace_id, user_id, role, status) values ($1, $2, 'viewer', 'active')", [wsA, U.viewerA]);
  await db.query("update public.profiles set active_workspace_id = $1 where id = $2", [wsA, U.viewerA]);
  periodA = (
    await db.query<{ id: string }>(
      "insert into public.periods (workspace_id, user_id, platform, label, period_start, period_end) values ($1, $2, 'hungerstation', 'HS Sept', '2026-09-01', '2026-09-30') returning id",
      [wsA, U.ownerA],
    )
  ).rows[0]!.id;
}, 120_000);

afterAll(async () => {
  await db?.close();
});

const SET = "select public.set_exception_workflow($1, $2, $3::jsonb) as period";

describe("exception workflow (0059)", () => {
  test("an exception can be marked claimable with an owner, an amount and a document", async () => {
    const patch = {
      status: "claimable",
      owner: "المحاسب",
      claimableAmount: 500,
      classification: "أجهزة، غير خاضعة للعمولة",
      attachments: [{ path: `${wsA}/${periodA}/printers/invoice.pdf`, name: "invoice.pdf" }],
    };
    const result = await asUser<{ period: { invoice: { exceptionWorkflow: Record<string, Record<string, unknown>> } } }>(db, U.ownerA, SET, [
      periodA,
      "printers-al-mazrua",
      JSON.stringify(patch),
    ]);
    expect(result.error).toBeNull();
    expect(result.rows[0]!.period.invoice.exceptionWorkflow["printers-al-mazrua"]).toMatchObject(patch);
  });

  test("the older statuses still work", async () => {
    const result = await asUser(db, U.ownerA, SET, [periodA, "x", JSON.stringify({ status: "disputed" })]);
    expect(result.error).toBeNull();
  });

  test("a document outside the workspace folder, an unknown status or a negative amount is refused", async () => {
    const outside = await asUser(db, U.ownerA, SET, [periodA, "x", JSON.stringify({ attachments: [{ path: `${wsB}/a.pdf`, name: "a.pdf" }] })]);
    expect(outside.error).toContain("INVALID_ATTACHMENTS");
    const status = await asUser(db, U.ownerA, SET, [periodA, "x", JSON.stringify({ status: "paid" })]);
    expect(status.error).toContain("INVALID_WORKFLOW_STATUS");
    const amount = await asUser(db, U.ownerA, SET, [periodA, "x", JSON.stringify({ claimableAmount: -1 })]);
    expect(amount.error).toContain("INVALID_CLAIMABLE_AMOUNT");
  });

  test("a viewer cannot change the workflow", async () => {
    const viewer = await asUser(db, U.viewerA, SET, [periodA, "x", JSON.stringify({ status: "claimable" })]);
    expect(viewer.error).toContain("FORBIDDEN");
  });
});

describe("classification rules (0059)", () => {
  const INSERT = "insert into public.exception_classification_rules (match_text, classification, commissionable, claimable) values ($1, $2, false, false)";

  test("a manager adds a rule; a viewer cannot", async () => {
    expect((await asUser(db, U.ownerA, INSERT, ["Printers", "أجهزة نقاط البيع"])).error).toBeNull();
    expect((await asUser(db, U.viewerA, INSERT, ["Printers", "أجهزة"])).error).not.toBeNull();
  });

  test("rules stay inside their company", async () => {
    await db.query("insert into public.exception_classification_rules (workspace_id, match_text, classification) values ($1, 'Subscription', 'اشتراك')", [wsA]);
    const other = await asUser<{ match_text: string }>(db, U.ownerB, "select match_text from public.exception_classification_rules");
    expect(other.rows).toEqual([]);
    const mine = await asUser<{ match_text: string }>(db, U.ownerA, "select match_text from public.exception_classification_rules");
    expect(mine.rows.map((row) => row.match_text)).toContain("Subscription");
  });
});

describe("exception documents bucket (0059)", () => {
  // The storage policies call this check (the test database has no storage grants of its own).
  const CAN = "select private.can_access_exception_document($1, $2) as ok";
  const can = async (user: string, name: string, permission: string) =>
    (await asUser<{ ok: boolean }>(db, user, CAN, [name, permission])).rows[0]?.ok ?? false;

  test("only the workspace's own folder, and only with exceptions.manage to write", async () => {
    expect(await can(U.ownerA, `${wsA}/${periodA}/doc.pdf`, "exceptions.manage")).toBe(true);
    expect(await can(U.ownerA, `${wsB}/doc.pdf`, "exceptions.manage")).toBe(false);
    expect(await can(U.ownerA, "not-a-workspace/doc.pdf", "exceptions.manage")).toBe(false);
    expect(await can(U.viewerA, `${wsA}/doc.pdf`, "exceptions.manage")).toBe(false);
  });

  test("the bucket exists and is private", async () => {
    const bucket = await db.query<{ public: boolean }>("select public from storage.buckets where id = 'exception-documents'");
    expect(bucket.rows).toEqual([{ public: false }]);
  });
});

describe("per-charge decisions (0060)", () => {
  test("each charge can carry a status and a document reference", async () => {
    const items = [
      { line: "الطابعات", status: "accepted", documentRef: "INV-PRN-1" },
      { line: "رسوم حملات التوصيل المجاني", status: "claimable", documentRef: null },
      { line: "الاشتراك الشهري", status: "pending" },
    ];
    const result = await asUser<{ period: { invoice: { exceptionWorkflow: Record<string, Record<string, unknown>> } } }>(db, U.ownerA, SET, [
      periodA,
      "combined",
      JSON.stringify({ items, status: "claimable", claimableAmount: 587.83 }),
    ]);
    expect(result.error).toBeNull();
    expect(result.rows[0]!.period.invoice.exceptionWorkflow["combined"]).toMatchObject({ items, status: "claimable" });
  });

  test("an unknown item status, a missing line or a long reference is refused", async () => {
    for (const items of [
      [{ line: "الطابعات", status: "paid" }],
      [{ status: "accepted" }],
      [{ line: "الطابعات", status: "accepted", documentRef: "x".repeat(201) }],
      { line: "الطابعات" },
    ]) {
      const refused = await asUser(db, U.ownerA, SET, [periodA, "combined", JSON.stringify({ items })]);
      expect(refused.error).toContain("INVALID_WORKFLOW_ITEMS");
    }
  });

  test("a viewer cannot record decisions", async () => {
    const viewer = await asUser(db, U.viewerA, SET, [periodA, "combined", JSON.stringify({ items: [] })]);
    expect(viewer.error).toContain("FORBIDDEN");
  });
});
