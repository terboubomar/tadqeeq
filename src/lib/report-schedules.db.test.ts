import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";

import { activateAllWorkspaces, asUser, createMigratedDatabase } from "../test-support/database";

/** Migration 0057: report schedules are visible with reports.read and managed only by owners and admins. */
const U = {
  ownerA: "00000000-0000-4000-8000-0000000009a1",
  adminA: "00000000-0000-4000-8000-0000000009a2",
  auditorA: "00000000-0000-4000-8000-0000000009a3",
  ownerB: "00000000-0000-4000-8000-0000000009b1",
} as const;

let db: PGlite;
let wsA: string;
let wsB: string;

const INSERT = `insert into public.report_schedules (workspace_id, name, frequency, day_of_month, weekday, recipients)
  values ($1, $2, $3, $4, $5, $6) returning id`;

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
  for (const [user, role] of [[U.adminA, "admin"], [U.auditorA, "auditor"]] as const) {
    await db.query("insert into public.workspace_members (workspace_id, user_id, role, status) values ($1, $2, $3, 'active')", [wsA, user, role]);
    await db.query("update public.profiles set active_workspace_id = $1 where id = $2", [wsA, user]);
  }
  // asUser rolls back its statement, so rows the read tests need are written directly.
  await db.query(INSERT, [wsA, "Monthly board pack", "monthly", 3, null, ["cfo@example.com"]]);
  await db.query(INSERT, [wsA, "Weekly", "weekly", null, 0, ["ops@example.com"]]);
  await db.query(INSERT, [wsB, "B monthly", "monthly", 1, null, ["b@example.com"]]);
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe("report schedules", () => {
  test("owners and admins create schedules; an auditor cannot", async () => {
    const owner = await asUser(db, U.ownerA, INSERT, [wsA, "Monthly board pack", "monthly", 3, null, ["cfo@example.com"]]);
    expect(owner.error).toBeNull();
    const admin = await asUser(db, U.adminA, INSERT, [wsA, "Weekly", "weekly", null, 0, ["ops@example.com", "x@example.com"]]);
    expect(admin.error).toBeNull();
    const auditor = await asUser(db, U.auditorA, INSERT, [wsA, "Nope", "on_upload", null, null, ["a@example.com"]]);
    expect(auditor.error).not.toBeNull();
  });

  test("an auditor can read the schedules but not change or delete them", async () => {
    const read = await asUser<{ name: string }>(db, U.auditorA, "select name from public.report_schedules order by name");
    expect(read.rows.map((row) => row.name)).toEqual(["Monthly board pack", "Weekly"]);
    const update = await asUser<{ id: string }>(db, U.auditorA, "update public.report_schedules set active = false returning id");
    expect(update.rows.length).toBe(0);
    const remove = await asUser<{ id: string }>(db, U.auditorA, "delete from public.report_schedules returning id");
    expect(remove.rows.length).toBe(0);
    const adminUpdate = await asUser<{ id: string }>(db, U.adminA, "update public.report_schedules set active = false returning id");
    expect(adminUpdate.rows.length).toBe(2);
  });

  test("each company sees and writes only its own schedules", async () => {
    const read = await asUser<{ name: string }>(db, U.ownerB, "select name from public.report_schedules");
    expect(read.rows.map((row) => row.name)).toEqual(["B monthly"]);
    const write = await asUser(db, U.ownerA, INSERT, [wsB, "Into B", "monthly", 1, null, ["a@example.com"]]);
    expect(write.error).not.toBeNull();
  });

  test("timing must match the frequency and recipients are 1 to 10", async () => {
    const check = async (params: unknown[]) => {
      await db.exec("begin");
      try {
        return await db.query(INSERT, params).then(() => null).catch((cause: { code?: string }) => cause.code);
      } finally {
        await db.exec("rollback");
      }
    };
    expect(await check([wsA, "No day", "monthly", null, null, ["a@example.com"]])).toBe("23514");
    expect(await check([wsA, "Day 31", "monthly", 31, null, ["a@example.com"]])).toBe("23514");
    expect(await check([wsA, "No weekday", "weekly", null, null, ["a@example.com"]])).toBe("23514");
    expect(await check([wsA, "No one", "on_upload", null, null, []])).toBe("23514");
    expect(await check([wsA, "Too many", "on_upload", null, null, Array.from({ length: 11 }, (_, i) => `u${i}@example.com`)])).toBe("23514");
    expect(await check([wsA, "Fine", "on_upload", null, null, ["a@example.com"]])).toBeNull();
  });
});
