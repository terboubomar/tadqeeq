import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";

import { createMigratedDatabase } from "../test-support/database";

/** Migration 0068: signed-in users cannot write the Telegram group link columns; the webhook (service role) does. */
let db: PGlite;

async function can(column: string, privilege: "INSERT" | "UPDATE"): Promise<boolean> {
  const { rows } = await db.query<{ ok: boolean }>(
    "select has_column_privilege('authenticated', 'public.telegram_branch_chats', $1, $2) as ok",
    [column, privilege],
  );
  return rows[0]!.ok;
}

beforeAll(async () => {
  db = await createMigratedDatabase();
});

afterAll(async () => {
  await db.close();
});

describe("Telegram link columns", () => {
  test("the group link stays server-only", async () => {
    for (const column of ["telegram_chat_id", "telegram_chat_title", "connected_at", "last_message_at"]) {
      expect(await can(column, "INSERT")).toBe(false);
      expect(await can(column, "UPDATE")).toBe(false);
    }
  });

  test("the app can still create rows, issue codes and turn links on or off", async () => {
    for (const column of ["workspace_id", "branch_id", "branch_name", "connect_code_hash", "connect_code_expires_at", "active"]) {
      expect(await can(column, "INSERT")).toBe(true);
    }
    for (const column of ["connect_code_hash", "connect_code_expires_at", "active", "updated_at"]) {
      expect(await can(column, "UPDATE")).toBe(true);
    }
  });
});
