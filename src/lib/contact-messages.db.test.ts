import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";

import { asUser, createMigratedDatabase } from "../test-support/database";

/** Migration 0046: contact messages are only readable and writable by the server (service role). */
const USER = "00000000-0000-4000-8000-0000000046a1";
let db: PGlite;

beforeAll(async () => {
  db = await createMigratedDatabase();
  await db.query("insert into auth.users (id, email) values ($1, 'visitor@example.com')", [USER]);
  await db.query(
    "insert into public.contact_messages (topic, name, email, mobile, message) values ('sales', 'سارة', 'sara@example.com', '+966551234567', 'مرحبا')",
  );
});

afterAll(async () => {
  await db.close();
});

describe("contact_messages", () => {
  test("visitors and signed-in users cannot read or insert", async () => {
    for (const user of [null, USER]) {
      expect((await asUser(db, user, "select id from public.contact_messages")).error).toContain("permission denied");
      const insert = await asUser(
        db,
        user,
        "insert into public.contact_messages (topic, name, email, mobile, message) values ('other', 'x', 'x@y.zz', '+966551234567', 'spam')",
      );
      expect(insert.error).toContain("permission denied");
    }
  });

  test("rejects invalid topics and status", async () => {
    await expect(
      db.query("insert into public.contact_messages (topic, name, email, mobile, message) values ('spam', 'x', 'x@y.zz', '+966551234567', 'm')"),
    ).rejects.toThrow();
    await expect(db.query("update public.contact_messages set status = 'deleted'")).rejects.toThrow();
  });
});
