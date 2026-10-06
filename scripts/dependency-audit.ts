/**
 * Dependency vulnerability gate for CI (docs/SECURITY_BUILD_SPEC.md, L6).
 *
 * Runs `bun audit --json` and fails only on high or critical advisories for package versions that production
 * dependencies actually install (walked through bun.lock). Advisories that only reach dev tooling (eslint, test
 * and build helpers) are printed as warnings so a new advisory in a linter does not block every pull request.
 *
 * Usage: bun scripts/dependency-audit.ts
 */

export interface Advisory {
  title: string;
  url: string;
  severity: string;
  vulnerable_versions: string;
}

export type AuditReport = Record<string, Advisory[]>;

interface LockEntry {
  version: string;
  dependencies: string[];
}

export interface Lockfile {
  rootDependencies: string[];
  /** bun.lock package keys ("postcss/nanoid" is the nanoid installed under postcss). */
  packages: Map<string, LockEntry>;
}

export interface Finding {
  name: string;
  version: string;
  advisory: Advisory;
}

const BLOCKING = new Set(["high", "critical"]);

/**
 * Exact advisories proven non-applicable to Tadqeeq's production use.
 * Keep this list narrow: package + advisory URL, never a package-wide exemption.
 *
 * @modelcontextprotocol/sdk is pulled transitively by @lovable.dev/mcp-js. Tadqeeq hosts an MCP
 * server and does not instantiate the SDK OAuth client/provider or store MCP client credentials,
 * which is the vulnerable path in GHSA-6qxp-vccf-f47h. Remove this exception as soon as mcp-js
 * updates its exact SDK pin to a patched release.
 */
const NON_APPLICABLE = new Set([
  "@modelcontextprotocol/sdk|https://github.com/advisories/GHSA-6qxp-vccf-f47h",
]);

/** bun.lock is JSON with trailing commas. */
export function parseLockfile(text: string): Lockfile {
  const raw = JSON.parse(text.replace(/,(\s*[}\]])/g, "$1")) as {
    workspaces: Record<string, { dependencies?: Record<string, string>; optionalDependencies?: Record<string, string> }>;
    packages: Record<string, [string, string, Record<string, Record<string, string>>?, string?]>;
  };
  const root = raw.workspaces[""] ?? {};
  const packages = new Map<string, LockEntry>();
  for (const [key, [ident, , meta]] of Object.entries(raw.packages)) {
    const at = ident.lastIndexOf("@");
    const deps = { ...meta?.["dependencies"], ...meta?.["optionalDependencies"], ...meta?.["peerDependencies"] };
    packages.set(key, { version: at > 0 ? ident.slice(at + 1) : "", dependencies: Object.keys(deps) });
  }
  return {
    rootDependencies: [...Object.keys(root.dependencies ?? {}), ...Object.keys(root.optionalDependencies ?? {})],
    packages,
  };
}

/** Every installed package version reachable from the production dependencies, as "name" -> versions. */
export function productionVersions(lock: Lockfile): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const seen = new Set<string>();
  // Node-style lookup: a dependency of a/b is installed at a/b/dep, else a/dep, else dep.
  const resolve = (path: string[], name: string): string[] | null => {
    for (let i = path.length; i >= 0; i -= 1) {
      const candidate = [...path.slice(0, i), name];
      if (lock.packages.has(candidate.join("/"))) return candidate;
    }
    return null;
  };
  const stack = lock.rootDependencies.map((name) => resolve([], name)).filter((p): p is string[] => p !== null);
  while (stack.length) {
    const path = stack.pop()!;
    const key = path.join("/");
    if (seen.has(key)) continue;
    seen.add(key);
    const entry = lock.packages.get(key)!;
    const name = path[path.length - 1]!;
    if (!out.has(name)) out.set(name, new Set());
    out.get(name)!.add(entry.version);
    for (const dep of entry.dependencies) {
      const child = resolve(path, dep);
      if (child) stack.push(child);
    }
  }
  return out;
}

/** High and critical advisories that match a version production dependencies install. */
export function blockingFindings(report: AuditReport, versions: Map<string, Set<string>>): Finding[] {
  const findings: Finding[] = [];
  for (const [name, advisories] of Object.entries(report)) {
    for (const version of versions.get(name) ?? []) {
      for (const advisory of advisories) {
        if (!BLOCKING.has(advisory.severity)) continue;
        if (!Bun.semver.satisfies(version, advisory.vulnerable_versions)) continue;
        if (NON_APPLICABLE.has(`${name}|${advisory.url}`)) continue;
        findings.push({ name, version, advisory });
      }
    }
  }
  return findings;
}

async function main(): Promise<number> {
  const proc = Bun.spawn(["bun", "audit", "--json"], { stdout: "pipe", stderr: "inherit" });
  const output = await new Response(proc.stdout).text();
  await proc.exited;
  let report: AuditReport;
  try {
    report = JSON.parse(output || "{}") as AuditReport;
  } catch {
    console.error("bun audit did not return JSON:\n" + output);
    return 1;
  }

  const lock = parseLockfile(await Bun.file("bun.lock").text());
  const findings = blockingFindings(report, productionVersions(lock));
  const blocked = new Set(findings.map((f) => f.name));

  for (const [name, advisories] of Object.entries(report)) {
    if (blocked.has(name)) continue;
    for (const advisory of advisories) {
      console.log(`warning (dev tooling or not installed): ${name} ${advisory.severity}: ${advisory.title} ${advisory.url}`);
    }
  }
  for (const f of findings) {
    console.error(`::error::${f.name}@${f.version} ${f.advisory.severity}: ${f.advisory.title} ${f.advisory.url}`);
  }
  if (findings.length) {
    console.error(`${findings.length} high or critical advisories in production dependencies.`);
    return 1;
  }
  console.log("No high or critical advisories in production dependencies.");
  return 0;
}

if (import.meta.main) process.exit(await main());
