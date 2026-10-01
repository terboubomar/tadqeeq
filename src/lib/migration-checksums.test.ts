import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

/**
 * Applied migrations are immutable. Each committed migration's SHA-256 is recorded in
 * drizzle/migrations/meta/checksums.json; editing one fails here. Fix forward with a new
 * migration instead (see docs/MIGRATIONS.md).
 */
const DIR = "drizzle/migrations";
const journal = JSON.parse(readFileSync(`${DIR}/meta/_journal.json`, "utf8")) as { entries: Array<{ tag: string }> };
const checksums = JSON.parse(readFileSync(`${DIR}/meta/checksums.json`, "utf8")) as Record<string, string>;

function sha256(tag: string): string {
  return createHash("sha256").update(readFileSync(`${DIR}/${tag}.sql`)).digest("hex");
}

describe("migration immutability", () => {
  test("every migration in the journal has a recorded checksum", () => {
    const missing = journal.entries
      .filter((entry) => !checksums[entry.tag])
      .map((entry) => `"${entry.tag}": "${sha256(entry.tag)}"`);
    // A new migration: add the printed line to meta/checksums.json in the same commit.
    expect(missing).toEqual([]);
  });

  test("no applied migration has been edited", () => {
    const changed = journal.entries
      .filter((entry) => checksums[entry.tag] && checksums[entry.tag] !== sha256(entry.tag))
      .map((entry) => entry.tag);
    expect(changed).toEqual([]);
  });

  test("checksums only name migrations that exist in the journal", () => {
    const tags = new Set(journal.entries.map((entry) => entry.tag));
    expect(Object.keys(checksums).filter((tag) => !tags.has(tag))).toEqual([]);
  });

  test("migration numbers are unique and never reused", () => {
    const numbers = journal.entries.map((entry) => entry.tag.slice(0, 4));
    const duplicates = numbers.filter((value, index) => numbers.indexOf(value) !== index);
    // 0001 and 0002 were each used twice before this rule existed; nothing new may repeat.
    expect([...new Set(duplicates)].sort()).toEqual(["0001", "0002"]);
  });
});
