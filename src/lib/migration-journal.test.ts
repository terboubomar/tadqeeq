import { describe, expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

interface JournalEntry {
  idx: number;
  tag: string;
}

interface MigrationJournal {
  entries: JournalEntry[];
}

const migrationsDir = path.resolve(process.cwd(), "drizzle/migrations");
const journalPath = path.join(migrationsDir, "meta/_journal.json");

async function loadJournal(): Promise<MigrationJournal> {
  return JSON.parse(await readFile(journalPath, "utf8")) as MigrationJournal;
}

describe("migration journal", () => {
  test("registers every SQL migration exactly once", async () => {
    const journal = await loadJournal();
    const sqlTags = (await readdir(migrationsDir))
      .filter((file) => file.endsWith(".sql"))
      .map((file) => file.replace(/\.sql$/, ""))
      .sort();
    const journalTags = journal.entries.map((entry) => entry.tag);

    expect([...journalTags].sort()).toEqual(sqlTags);
    expect(new Set(journalTags).size).toBe(journalTags.length);
  });

  test("uses sequential journal indexes", async () => {
    const journal = await loadJournal();
    expect(journal.entries.map((entry) => entry.idx)).toEqual(
      journal.entries.map((_, index) => index),
    );
  });

  test("orders migrations by their real database dependencies", async () => {
    const journal = await loadJournal();
    const position = (tag: string) =>
      journal.entries.findIndex((entry) => entry.tag === tag);

    expect(position("0002_ai_usage")).toBeLessThan(
      position("0001_add_reserve_ai_call"),
    );
    expect(position("0001_add_reserve_ai_call")).toBeLessThan(
      position("0006_ai_usage_reservations"),
    );
    expect(position("0002_scope_period_duplicates_by_label")).toBeLessThan(
      position("0008_period_duplicate_guard"),
    );
  });
});
