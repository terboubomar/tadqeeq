import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * supabase.auth.signOut() defaults to scope "global", which ends every session of the account, including the
 * sessions Claude / ChatGPT hold through the Tadqeeq MCP. Signing out of the web app must end this browser only.
 */
function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("web sign-out", () => {
  test("every signOut call ends this browser's session only", () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(join(import.meta.dir, ".."))) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(/auth\.signOut\(([^)]*)\)/g)) {
        if (!/scope:\s*"local"/.test(match[1] ?? "")) offenders.push(`${file}: ${match[0]}`);
      }
    }
    expect(offenders).toEqual([]);
  });
});
