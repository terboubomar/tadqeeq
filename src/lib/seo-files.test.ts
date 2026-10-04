import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { NOINDEX_PAGES, PRIVATE_PAGES, PRIVATE_PREFIXES, PUBLIC_PAGES, SITE_URL } from "./seo";
import { buildLlmsFullTxt, buildLlmsTxt, buildPricingMd, buildRobots, buildSitemap } from "./seo-files";
import { FAQS, FEATURES } from "./site-content";

const SEO_FILES = ["/sitemap.xml", "/robots.txt", "/llms.txt", "/llms-full.txt", "/pricing.md"];

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

describe("AI files", () => {
  const plans = [
    { id: "p1", name: "أساسي", price: 399, cycle: "monthly" as const, features: ["invoice_audit" as const], uploadLimit: 4, description: null, highlighted: false, code: null, orderLimit: null, priceYearly: null, customPrice: false },
    { id: "p2", name: "المجموعات", price: 9990, cycle: "yearly" as const, features: ["invoice_audit" as const, "compensation" as const], uploadLimit: null, description: "حتى 50 فرعاً", highlighted: true, code: null, orderLimit: null, priceYearly: null, customPrice: false },
  ];

  test("pricing.md lists the trial and every plan with price, unit and limits", () => {
    const md = buildPricingMd(plans);
    expect(md).toContain("## Free trial");
    expect(md).toContain("- Price: 399 SAR per month");
    expect(md).toContain("- Price: 9,990 SAR per year");
    expect(md).toContain("- Uploads: 4 per month");
    expect(md).toContain("- Uploads: unlimited");
    expect(md).toContain("مركز التعويضات");
    expect(buildPricingMd([])).toContain("## Free trial");
  });

  test("llms-full.txt carries the features, every FAQ answer and the pricing", () => {
    const txt = buildLlmsFullTxt(plans);
    for (const feature of FEATURES) expect(txt).toContain(feature.nameEn);
    for (const [question, answer] of FAQS) {
      expect(txt).toContain(question);
      expect(txt).toContain(answer);
    }
    expect(txt).toContain("## Pricing");
    expect(txt).toContain("### أساسي");
    expect(txt.match(/^# /gm)?.length).toBe(1);
  });

  test("llms.txt points to the full file and the pricing file", () => {
    const txt = buildLlmsTxt();
    expect(txt).toContain(`${SITE_URL}/llms-full.txt`);
    expect(txt).toContain(`${SITE_URL}/pricing.md`);
  });
});

describe("pricing.md with order-based plans", () => {
  const plan = (code: string, name: string, price: number, priceYearly: number | null, orderLimit: number | null, customPrice = false) => ({
    id: code, name, price, cycle: "monthly" as const, features: [], uploadLimit: null, description: null, highlighted: false, code, orderLimit, priceYearly, customPrice,
  });

  test("lists order limits, both prices, the custom plan, the add-on and the terms", () => {
    const md = buildPricingMd([plan("start", "البداية", 299, 2990, 3000), plan("enterprise", "المؤسسات", 0, null, null, true)]);
    expect(md).toContain("## البداية");
    expect(md).toContain("- Price: 299 SAR per month or 2,990 SAR per year");
    expect(md).toContain("- Orders checked per month: up to 3,000");
    expect(md).toContain("- Price: by agreement (contact us)");
    expect(md).not.toContain("0 SAR per month");
    expect(md).toContain("399 SAR every 4 months");
    expect(md).toContain("لا تشمل ضريبة القيمة المضافة");
    expect(md).toContain("unlimited branches, platforms, users and uploads");
  });
});
