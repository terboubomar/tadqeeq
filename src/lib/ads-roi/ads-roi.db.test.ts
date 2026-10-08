import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";

import { asUser, createMigratedDatabase } from "../../test-support/database";

/** Migration 0033: saved ads analyses and brand settings follow the workspace roles. */
const U = {
  ownerA: "00000000-0000-4000-8000-0000000003a1",
  auditorA: "00000000-0000-4000-8000-0000000003a2",
  viewerA: "00000000-0000-4000-8000-0000000003a3",
  ownerB: "00000000-0000-4000-8000-0000000003b1",
} as const;

let db: PGlite;
let wsA: string;
let wsB: string;

const INSERT_ANALYSIS = `insert into public.ads_roi_analyses (workspace_id, user_id, created_by, date_from, date_to, report, spent, gmv)
  values ($1, $2, $3, '2026-08-01', '2026-08-01', '{"campaigns":[]}', 10, 60) returning id`;

beforeAll(async () => {
  db = await createMigratedDatabase();
  for (const [name, id] of Object.entries(U)) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, `${name}@example.com`]);
  }
  const ws = async (owner: string) =>
    (await db.query<{ id: string }>("select id from public.workspaces where owner_user_id = $1", [owner])).rows[0]!.id;
  wsA = await ws(U.ownerA);
  wsB = await ws(U.ownerB);
  for (const [user, role] of [[U.auditorA, "auditor"], [U.viewerA, "viewer"]] as const) {
    await db.query("insert into public.workspace_members (workspace_id, user_id, role, status) values ($1, $2, $3, 'active')", [wsA, user, role]);
    await db.query("update public.profiles set active_workspace_id = $1 where id = $2", [wsA, user]);
  }
  await db.query(INSERT_ANALYSIS, [wsA, U.ownerA, U.ownerA]);
  await db.query(INSERT_ANALYSIS, [wsB, U.ownerB, U.ownerB]);
  await db.query(
    "insert into public.ads_roi_brand_settings (workspace_id, user_id, brand_key, commission_rate, food_cost_rate) values ($1, $2, 'PAST', 0.15, 0.3)",
    [wsA, U.ownerA],
  );
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("ads ROI tables", () => {
  test("each company sees only its own analyses and settings", async () => {
    const a = await asUser<{ workspace_id: string }>(db, U.ownerA, "select workspace_id from public.ads_roi_analyses");
    expect(a.rows.map((row) => row.workspace_id)).toEqual([wsA]);
    const b = await asUser(db, U.ownerB, "select * from public.ads_roi_brand_settings");
    expect(b.rows).toHaveLength(0);
  });

  test("an auditor can save; a viewer can read but not save", async () => {
    const saved = await asUser(db, U.auditorA, INSERT_ANALYSIS.replace("'2026-08-01', '2026-08-01'", "'2026-08-02', '2026-08-02'"), [wsA, U.ownerA, U.auditorA]);
    expect(saved.error).toBeNull();
    const read = await asUser(db, U.viewerA, "select * from public.ads_roi_analyses");
    expect(read.rows).toHaveLength(1);
    const write = await asUser(db, U.viewerA, INSERT_ANALYSIS, [wsA, U.ownerA, U.viewerA]);
    expect(write.error).not.toBeNull();
  });

  test("nobody can write into another company", async () => {
    const write = await asUser(db, U.ownerB, INSERT_ANALYSIS.replace("'2026-08-01', '2026-08-01'", "'2026-08-05', '2026-08-05'"), [wsA, U.ownerA, U.ownerB]);
    expect(write.error).not.toBeNull();
    const update = await asUser(db, U.ownerB, "update public.ads_roi_brand_settings set food_cost_rate = 0.9");
    expect(update.affected).toBe(0);
  });

  test("the same days are saved once per company", async () => {
    const again = await asUser(db, U.ownerA, INSERT_ANALYSIS, [wsA, U.ownerA, U.ownerA]);
    expect(again.code).toBe("23505");
  });

  test("rates are fractions", async () => {
    const bad = await asUser(
      db,
      U.ownerA,
      "insert into public.ads_roi_brand_settings (workspace_id, user_id, brand_key, food_cost_rate) values ($1, $2, 'MORGY', 30)",
      [wsA, U.ownerA],
    );
    expect(bad.code).toBe("23514");
  });
});
