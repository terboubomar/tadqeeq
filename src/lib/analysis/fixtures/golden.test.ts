import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { buildPeriodExceptions } from "../../exceptions";
import type { StoredPeriod } from "../../periods";
import type { AnalysisResult } from "../types";
import { ENGINE_VERSION } from "../version";
import { analyzeFixture, FIXTURE_DIRS, type FixturePlatform } from "./load";

/**
 * Golden regression: the WHOLE financial output of each fixture (summary, branches, daily rows,
 * invoice figures, checks and the exceptions built from them) must stay exactly as recorded.
 *
 * A golden file may only be regenerated for a confirmed platform format change or a confirmed
 * accounting rule change, in its own commit that says why:
 *   UPDATE_GOLDEN=1 bun test src/lib/analysis/fixtures/golden.test.ts
 */
const UPDATE = process.env["UPDATE_GOLDEN"] === "1";
const PLATFORMS = Object.keys(FIXTURE_DIRS) as FixturePlatform[];

/** Rounds every number to 6 decimals so the snapshot is stable across float noise, never across real changes. */
function normalize(value: unknown): unknown {
  if (typeof value === "number") {
    const rounded = Number(value.toFixed(6));
    return Object.is(rounded, -0) ? 0 : rounded;
  }
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .filter(([, v]) => v !== undefined)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => [k, normalize(v)]),
    );
  }
  return value;
}

function storedPeriod(result: AnalysisResult): StoredPeriod {
  return {
    id: "00000000-0000-4000-8000-000000000000",
    label: result.label,
    platform: result.platform,
    period_start: result.summary.periodStart,
    period_end: result.summary.periodEnd,
    created_at: "2026-01-01T00:00:00.000Z",
    engine_version: ENGINE_VERSION,
    format_ids: result.formatIds ?? [],
    summary: result.summary,
    branches: result.branches,
    daily: result.daily,
    invoice: { ...result.invoice, checks: result.checks },
  };
}

function financialSnapshot(result: AnalysisResult) {
  const exceptions = buildPeriodExceptions(storedPeriod(result)).map((item) => ({
    id: item.id,
    category: item.category,
    label: item.label,
    branch: item.branch,
    computed: item.computed,
    invoiced: item.invoiced,
    difference: item.difference,
    tolerance: item.tolerance,
    reviewAmount: item.reviewAmount,
    potentialRecovery: item.potentialRecovery,
    severity: item.severity,
  }));
  return normalize({
    platform: result.platform,
    formatIds: result.formatIds,
    label: result.label,
    summary: result.summary,
    branches: result.branches,
    daily: result.daily,
    invoice: result.invoice,
    checks: result.checks,
    exceptions,
    totals: {
      reviewAmount: exceptions.reduce((sum, item) => sum + item.reviewAmount, 0),
      potentialRecovery: exceptions.reduce((sum, item) => sum + item.potentialRecovery, 0),
    },
  });
}

describe("golden financial output", () => {
  for (const platform of PLATFORMS) {
    test(`${platform}: full audit output matches the recorded golden file`, async () => {
      const path = join(FIXTURE_DIRS[platform], "golden.json");
      const actual = financialSnapshot(await analyzeFixture(platform));

      if (UPDATE) {
        writeFileSync(path, JSON.stringify(actual, null, 2) + "\n");
        return;
      }
      if (!existsSync(path)) {
        throw new Error(`Missing ${path}. Record it once with UPDATE_GOLDEN=1 and commit it.`);
      }
      expect(actual).toEqual(JSON.parse(readFileSync(path, "utf8")));
    });

    test(`${platform}: same source file gives the same result every time`, async () => {
      const first = financialSnapshot(await analyzeFixture(platform));
      const second = financialSnapshot(await analyzeFixture(platform));
      expect(second).toEqual(first);
    });
  }
});

/** Local modules reachable from a file through static imports (relative and "@/" paths). */
function reachableModules(entry: string, root: string): Set<string> {
  const seen = new Set<string>();
  const visit = (file: string) => {
    if (seen.has(file)) return;
    seen.add(file);
    const source = readFileSync(file, "utf8");
    for (const match of source.matchAll(/(?:import|export)\s[^'"]*?from\s+["']([^"']+)["']/g)) {
      const spec = match[1]!;
      if (spec.startsWith("@/") || spec.startsWith(".")) {
        const base = spec.startsWith("@/") ? join(root, "src", spec.slice(2)) : resolve(dirname(file), spec);
        const target = [".ts", ".tsx", "/index.ts"].map((ext) => base + ext).find((p) => existsSync(p));
        if (target) visit(target);
      } else {
        seen.add(`package:${spec}`);
      }
    }
  };
  visit(entry);
  return seen;
}

describe("accounting core boundary", () => {
  test("engines, exceptions and the charge map never import AI code", () => {
    const root = resolve(import.meta.dir, "../../../..");
    const entries = [
      "src/lib/analysis/hungerstation.ts",
      "src/lib/analysis/keeta.ts",
      "src/lib/analysis/jahez.ts",
      "src/lib/exceptions.ts",
      "src/lib/charges-mapper.ts",
    ];
    for (const entry of entries) {
      const modules = [...reachableModules(join(root, entry), root)];
      const ai = modules.filter((m) => /[\\/]lib[\\/]ai[\\/]|openai|anthropic|@ai-sdk/i.test(m));
      expect({ entry, ai }).toEqual({ entry, ai: [] });
    }
  });
});
