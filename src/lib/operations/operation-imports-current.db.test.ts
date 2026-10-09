import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite, Transaction } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { activateAllWorkspaces, createMigratedDatabase } from "../../test-support/database";

/** Migration 0056: one current upload per source and day, and orders stored once per day. */
const OWNER = "00000000-0000-4000-8000-0000000009a1";
const SUMMARY = (orders: number) => JSON.stringify({ orderCount: orders });
const order = (orderId: string, businessDate: string, grossSales: number) => ({
  orderId,
  businessDate,
  branchId: "1",
  branchName: "Branch",
  status: "Completed",
  deliveryMode: "Delivery",
  grossSales,
  deliveryAmount: 0,
  complaint: false,
  complaintReason: null,
  refundType: null,
  refundAmount: null,
  chargesTotal: 0,
  settlementAmount: grossSales,
  rawData: {},
});

type Step = (tx: Transaction) => Promise<unknown>;

/** Runs several statements as the workspace owner in one transaction, then rolls everything back. */
async function asOwner(db: PGlite, steps: Step[]): Promise<unknown[]> {
  const results: unknown[] = [];
  await db
    .transaction(async (tx) => {
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [OWNER]);
      await tx.exec("set local role authenticated");
      for (const step of steps) results.push(await step(tx));
      await tx.rollback();
    })
    .catch(() => undefined);
  return results;
}

const importFile = (sha: string, date: string, orders: ReturnType<typeof order>[]) => (tx: Transaction) =>
  tx.query<{ result: { status: string; import_id: string } }>(
    "select public.import_operation_snapshot('keeta_orders','keeta',$1::date,$2,$3,$4::jsonb,$5::jsonb,'[]'::jsonb) as result",
    [date, sha.slice(0, 4) + ".xlsx", sha.repeat(64).slice(0, 64), SUMMARY(orders.length), JSON.stringify(orders)],
  );

const current = (tx: Transaction) =>
  tx.query<{ sha256: string }>(
    "select sha256 from public.operation_imports where business_date = '2026-10-05' and superseded_at is null order by sha256",
  );
const orders = (tx: Transaction) =>
  tx.query<{ order_id: string; business_date: string }>("select order_id, business_date::text from public.operation_orders order by business_date, order_id");

let db: PGlite;

beforeAll(async () => {
  db = await createMigratedDatabase();
  await db.query("insert into auth.users (id, email) values ($1, 'ops-owner@example.com')", [OWNER]);
  await activateAllWorkspaces(db);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("daily operations uploads (migration 0056)", () => {
  test("a newer upload for the day supersedes the older one; re-uploading the older file makes it current again", async () => {
    const [, , afterSecond, , afterReupload] = (await asOwner(db, [
      importFile("a", "2026-10-05", [order("K-1", "2026-10-05", 10)]),
      importFile("b", "2026-10-05", [order("K-2", "2026-10-05", 20)]),
      current,
      importFile("a", "2026-10-05", [order("K-1", "2026-10-05", 10)]),
      current,
    ])) as Array<{ rows: Array<{ sha256: string }> }>;
    expect(afterSecond!.rows.map((row) => row.sha256[0])).toEqual(["b"]);
    expect(afterReupload!.rows.map((row) => row.sha256[0])).toEqual(["a"]);
  });

  test("deleting the current upload leaves the day with no current upload and no rows", async () => {
    const results = (await asOwner(db, [
      importFile("a", "2026-10-05", [order("K-1", "2026-10-05", 10)]),
      importFile("b", "2026-10-05", [order("K-2", "2026-10-05", 20)]),
      (tx) =>
        tx.query(
          "select public.delete_operation_import((select id from public.operation_imports where superseded_at is null and business_date = '2026-10-05'))",
        ),
      current,
      orders,
    ])) as Array<{ rows: unknown[] }>;
    expect(results[3]!.rows).toEqual([]);
    expect(results[4]!.rows).toEqual([]);
  });

  test("the same order can appear on two days (a later day's compensation or sales)", async () => {
    const results = (await asOwner(db, [
      importFile("c", "2026-10-01", [order("K-9", "2026-10-01", 0)]),
      importFile("d", "2026-10-04", [order("K-9", "2026-10-04", 30.28)]),
      orders,
    ])) as Array<{ rows: Array<{ order_id: string; business_date: string }> }>;
    expect(results[2]!.rows).toEqual([
      { order_id: "K-9", business_date: "2026-10-01" },
      { order_id: "K-9", business_date: "2026-10-04" },
    ]);
  });
});

describe("migration 0056 on existing uploads", () => {
  test("only the newest upload of each source and day stays current", async () => {
    const old = await createMigratedDatabase({ before: "0056_operation_imports_current" });
    try {
      await old.query("insert into auth.users (id, email) values ($1, 'ops-owner@example.com')", [OWNER]);
      await activateAllWorkspaces(old);
      const ws = (await old.query<{ id: string }>("select id from public.workspaces where owner_user_id = $1", [OWNER])).rows[0]!.id;
      for (const [sha, at] of [["a", "2026-10-05 08:00"], ["b", "2026-10-05 09:00"]] as const) {
        await old.query(
          `insert into public.operation_imports (workspace_id,user_id,source_kind,platform,business_date,original_name,sha256,row_count,summary,created_at)
           values ($1,$2,'keeta_orders','keeta','2026-10-05',$3,$4,0,'{}'::jsonb,$5)`,
          [ws, OWNER, sha + ".xlsx", sha.repeat(64), at],
        );
      }
      await old.exec(readFileSync(join(process.cwd(), "drizzle/migrations/0056_operation_imports_current.sql"), "utf8"));
      const rows = await old.query<{ original_name: string; current: boolean }>(
        "select original_name, superseded_at is null as current from public.operation_imports order by original_name",
      );
      expect(rows.rows).toEqual([
        { original_name: "a.xlsx", current: false },
        { original_name: "b.xlsx", current: true },
      ]);
    } finally {
      await old.close();
    }
  }, 120_000);
});
