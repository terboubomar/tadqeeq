import { PGlite, type Transaction } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Real Postgres (PGlite, in-process) with every committed migration applied in journal order,
 * on top of a small Supabase stand-in. Lets tests exercise the actual row-level security.
 */
export async function createMigratedDatabase(): Promise<PGlite> {
  const db = await PGlite.create();
  await db.exec(readFileSync(join(HERE, "supabase-shim.sql"), "utf8"));
  const dir = join(HERE, "../../drizzle/migrations");
  const journal = JSON.parse(readFileSync(join(dir, "meta/_journal.json"), "utf8")) as {
    entries: Array<{ tag: string }>;
  };
  for (const entry of journal.entries) {
    await db.exec(readFileSync(join(dir, `${entry.tag}.sql`), "utf8"));
  }
  return db;
}

export interface QueryOutcome<T> {
  rows: T[];
  affected: number;
  error: string | null;
}

/**
 * Runs one statement exactly as Supabase would for a signed-in user (role `authenticated`,
 * auth.uid() = userId), or as `anon` when userId is null. Always rolled back, so tests never
 * leak writes into each other.
 */
export async function asUser<T = Record<string, unknown>>(
  db: PGlite,
  userId: string | null,
  sql: string,
  params: unknown[] = [],
): Promise<QueryOutcome<T>> {
  let outcome: QueryOutcome<T> = { rows: [], affected: 0, error: null };
  await db
    .transaction(async (tx: Transaction) => {
      await tx.query("select set_config('request.jwt.claim.sub', $1, true)", [userId ?? ""]);
      await tx.exec(userId ? "set local role authenticated" : "set local role anon");
      try {
        const result = await tx.query<T>(sql, params);
        outcome = { rows: result.rows, affected: result.affectedRows ?? 0, error: null };
      } catch (error) {
        outcome = { rows: [], affected: 0, error: error instanceof Error ? error.message : String(error) };
      }
      await tx.rollback();
    })
    .catch(() => undefined);
  return outcome;
}
