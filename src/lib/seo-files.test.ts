import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { NOINDEX_PAGES, PRIVATE_PAGES, PRIVATE_PREFIXES, PUBLIC_PAGES, SITE_URL } from "./seo";
import { buildLlmsTxt, buildRobots, buildSitemap } from "./seo-files";

const SEO_FILES = ["/sitemap.xml", "/robots.txt", "/llms.txt"];

function appRoutes() {
  const tree = readFileSync(new URL("../routeTree.gen.ts", import.meta.url), "utf8");
  const block = tree.slice(tree.indexOf("export interface FileRoutesByFullPath"), tree.indexOf("export interface FileRoutesByTo"));
  return [...block.matchAll(/^\s+'([^']+)':/gm)].map((m) => m[1]!.replace(/(.)\/$/, "$1"));
}

describe("route coverage", () => {
  test("every route is public, private, noindex or an SEO file", () => {
    const publicPaths = PUBLIC_PAGES.map((p) => p.path);
    const unclassified = appRoutes().filter(
      (path) =>
        !publicPaths.includes(path) &&
        !PRIVATE_PAGES.includes(path) &&
        !NOINDEX_PAGES.includes(path) &&
        !SEO_FILES.includes(path) &&
        !PRIVATE_PREFIXES.some((prefix) => path === prefix.replace(/\/$/, "") || path.startsWith(prefix)),
    );
    // A new route must be added to PUBLIC_PAGES (sitemap) or to the private lists (robots) in src/lib/seo.ts.
    expect(unclassified).toEqual([]);
  });

  test("no page is both public and private", () => {
    for (const page of PUBLIC_PAGES) {
      expect(PRIVATE_PAGES).not.toContain(page.path);
      expect(NOINDEX_PAGES).not.toContain(page.path);
      expect(PRIVATE_PREFIXES.some((prefix) => page.path.startsWith(prefix))).toBe(false);
    }
  });
});

describe("sitemap.xml", () => {
  test("lists every public page with an absolute URL and valid lastmod", () => {
    const xml = buildSitemap();
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    for (const page of PUBLIC_PAGES) {
      expect(xml).toContain(`<loc>${SITE_URL}${page.path}</loc>`);
      expect(page.lastmod).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
    expect(xml.match(/<url>/g)).toHaveLength(PUBLIC_PAGES.length);
  });

  test("never lists private or noindex pages", () => {
    const xml = buildSitemap();
    for (const path of [...PRIVATE_PAGES, ...NOINDEX_PAGES]) expect(xml).not.toContain(`<loc>${SITE_URL}${path}</loc>`);
  });
});

describe("robots.txt", () => {
  const robots = buildRobots();

  test("allows the site, blocks private screens exactly and points to the sitemap", () => {
    expect(robots).toContain("User-agent: *\nAllow: /");
    expect(robots).toContain("Disallow: /dashboard$");
    expect(robots).toContain("Disallow: /ops\n");
    expect(robots).toContain(`Sitemap: ${SITE_URL}/sitemap.xml`);
  });

  test("keeps noindex pages crawlable so their noindex tag is seen", () => {
    for (const path of NOINDEX_PAGES) expect(robots).not.toContain(`Disallow: ${path}`);
  });

  test("gives named AI crawlers the same rules as everyone else", () => {
    const groups = robots.split("\n\n").filter((g) => g.startsWith("User-agent:"));
    const rules = groups.map((g) => g.split("\n").slice(1).join("\n"));
    expect(new Set(rules).size).toBe(1);
    expect(robots).toContain("User-agent: GPTBot");
    expect(robots).toContain("User-agent: ClaudeBot");
    expect(robots).toContain("User-agent: PerplexityBot");
  });
});

describe("llms.txt", () => {
  test("describes the product and links public pages", () => {
    const txt = buildLlmsTxt();
    expect(txt.startsWith("# تدقيق (Tadqeeq)")).toBe(true);
    expect(txt).toContain(`${SITE_URL}/`);
    expect(txt).toContain("HungerStation");
  });
});
