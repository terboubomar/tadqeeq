import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";

import { createMigratedDatabase } from "../test-support/database";
import { branchSaveErrorMessage } from "./branch-registry-errors";

/** Branch identity rules (migration 0026), checked on the real schema. */
const OWNER_A = "00000000-0000-4000-8000-0000000000f1";
const OWNER_B = "00000000-0000-4000-8000-0000000000f2";
let db: PGlite;
let wsA: string;
let wsB: string;

beforeAll(async () => {
  db = await createMigratedDatabase();
  await db.query("insert into auth.users (id, email) values ($1, 'a@example.com'), ($2, 'b@example.com')", [OWNER_A, OWNER_B]);
  const ws = async (owner: string) =>
    (await db.query<{ id: string }>("select id from public.workspaces where owner_user_id = $1", [owner])).rows[0]!.id;
  wsA = await ws(OWNER_A);
  wsB = await ws(OWNER_B);
  await db.query(
    `insert into public.branch_registry (workspace_id, user_id, name, hungerstation_id, keeta_id, jahez_id)
     values ($1, $2, 'فرع العليا', '123', 'K-123', 'J-123')`,
    [wsA, OWNER_A],
  );
}, 120_000);

afterAll(async () => {
  await db?.close();
});

type Row = { name: string; hungerstation_id: string | null; keeta_id: string | null; jahez_id: string | null };

/** Inserts a branch inside a savepoint; returns the clear message the app would show, or null on success. */
async function save(workspace: string, owner: string, row: Row): Promise<string | null> {
  await db.exec("begin");
  try {
    await db.query(
      `insert into public.branch_registry (workspace_id, user_id, name, hungerstation_id, keeta_id, jahez_id)
       values ($1, $2, $3, $4, $5, $6)`,
      [workspace, owner, row.name, row.hungerstation_id, row.keeta_id, row.jahez_id],
    );
    return null;
  } catch (error) {
    return branchSaveErrorMessage(error as { code?: string; message?: string }, row);
  } finally {
    await db.exec("rollback");
  }
}

const blank: Row = { name: "فرع جديد", hungerstation_id: null, keeta_id: null, jahez_id: null };

describe("branch identifiers inside one workspace", () => {
  test("a HungerStation branch ID cannot be used by two branches", async () => {
    expect(await save(wsA, OWNER_A, { ...blank, hungerstation_id: "123" })).toBe("معرّف هنقرستيشن 123 مستخدم مسبقاً لفرع آخر.");
  });

  test("a Keeta branch ID cannot be used by two branches", async () => {
    expect(await save(wsA, OWNER_A, { ...blank, keeta_id: "K-123" })).toBe("معرّف كيتا K-123 مستخدم مسبقاً لفرع آخر.");
  });

  test("a Jahez branch ID cannot be used by two branches", async () => {
    expect(await save(wsA, OWNER_A, { ...blank, jahez_id: "J-123" })).toBe("معرّف جاهز J-123 مستخدم مسبقاً لفرع آخر.");
  });

  test("branch names are unique regardless of letter case", async () => {
    expect(await save(wsA, OWNER_A, { ...blank, name: "فرع العليا" })).toBe("يوجد فرع بنفس الاسم.");
    await db.exec("begin");
    try {
      await db.query("insert into public.branch_registry (workspace_id, user_id, name) values ($1, $2, 'Olaya')", [wsA, OWNER_A]);
      const clash = await db
        .query("insert into public.branch_registry (workspace_id, user_id, name) values ($1, $2, 'OLAYA')", [wsA, OWNER_A])
        .then(() => null)
        .catch((error: { code?: string }) => error.code);
      expect(clash).toBe("23505");
    } finally {
      await db.exec("rollback");
    }
  });

  test("branches without platform IDs do not clash with each other", async () => {
    expect(await save(wsA, OWNER_A, { ...blank, name: "فرع بلا معرّفات" })).toBeNull();
  });
});

describe("branch identifiers across workspaces", () => {
  test("another company may use the same IDs and name", async () => {
    expect(
      await save(wsB, OWNER_B, { name: "فرع العليا", hungerstation_id: "123", keeta_id: "K-123", jahez_id: "J-123" }),
    ).toBeNull();
  });
});
