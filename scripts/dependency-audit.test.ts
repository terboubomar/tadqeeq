import { describe, expect, test } from "bun:test";

import { blockingFindings, parseLockfile, productionVersions, type AuditReport } from "./dependency-audit";

const LOCK = `{
  "lockfileVersion": 1,
  "workspaces": {
    "": {
      "name": "app",
      "dependencies": { "web": "^1.0.0", },
      "devDependencies": { "linter": "^1.0.0", },
    },
  },
  "packages": {
    "web": ["web@1.0.0", "", { "dependencies": { "yaml": "^4.0.0", "tiny-id": "^3.0.0" } }, "sha512-a"],
    "web/tiny-id": ["tiny-id@3.3.16", "", {}, "sha512-b"],
    "tiny-id": ["tiny-id@6.0.1", "", {}, "sha512-c"],
    "yaml": ["yaml@4.3.0", "", {}, "sha512-d"],
    "linter": ["linter@1.0.0", "", { "dependencies": { "braces": "^1.0.0" } }, "sha512-e"],
    "braces": ["braces@1.1.0", "", {}, "sha512-f"],
  }
}`;

const advisory = (severity: string, vulnerable_versions: string) => ({ title: "t", url: "u", severity, vulnerable_versions });

describe("dependency audit gate", () => {
  test("walks production dependencies with node-style nesting and skips dev tooling", () => {
    const versions = productionVersions(parseLockfile(LOCK));
    expect([...versions.get("tiny-id")!].sort()).toEqual(["3.3.16"]);
    expect([...versions.get("yaml")!]).toEqual(["4.3.0"]);
    expect(versions.has("linter")).toBe(false);
    expect(versions.has("braces")).toBe(false);
  });

  test("fails only on high or critical advisories for installed production versions", () => {
    const versions = productionVersions(parseLockfile(LOCK));
    const report: AuditReport = {
      "tiny-id": [advisory("high", "<3.3.18")],
      yaml: [advisory("moderate", "<4.3.1"), advisory("critical", ">=5.0.0")],
      braces: [advisory("critical", "<2.0.0")],
    };
    const findings = blockingFindings(report, versions);
    expect(findings.map((f) => `${f.name}@${f.version}`)).toEqual(["tiny-id@3.3.16"]);
  });
});
