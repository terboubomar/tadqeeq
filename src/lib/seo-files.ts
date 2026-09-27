import {
  AI_CRAWLERS,
  PRIVATE_PAGES,
  PRIVATE_PREFIXES,
  PUBLIC_PAGES,
  SITE_NAME,
  SITE_NAME_EN,
  SITE_URL,
  type PublicPage,
} from "./seo";

export function buildSitemap(pages: PublicPage[] = PUBLIC_PAGES) {
  const urls = pages
    .map(
      (page) => `  <url>
    <loc>${SITE_URL}${page.path}</loc>
    <lastmod>${page.lastmod}</lastmod>
    <changefreq>${page.changefreq}</changefreq>
    <priority>${page.priority.toFixed(1)}</priority>
  </url>`,
    )
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
}

export function buildRobots() {
  const rules = [
    "Allow: /",
    ...PRIVATE_PREFIXES.map((prefix) => `Disallow: ${prefix}`),
    ...PRIVATE_PAGES.map((path) => `Disallow: ${path}$`),
  ].join("\n");
  // A crawler that matches a named group ignores the * group, so each group repeats the same rules.
  const groups = ["*", ...AI_CRAWLERS].map((agent) => `User-agent: ${agent}\n${rules}`);
  return `${groups.join("\n\n")}\n\nSitemap: ${SITE_URL}/sitemap.xml\n`;
}

export function buildLlmsTxt() {
  return `# ${SITE_NAME} (${SITE_NAME_EN})

> ${SITE_NAME_EN} is a Saudi SaaS that re-calculates every line of HungerStation, Jahez and Keeta invoices from the restaurant's own order file and contract, flags differences per branch, and prepares compensation claims with evidence. Arabic-first.

تدقيق منصة سعودية تعيد احتساب كل بند في فواتير هنقرستيشن وجاهز وكيتا من ملف الطلبات والعقد، وتكشف فروقات العمولة والرسوم لكل فرع، وتجهّز مطالبات التعويض بالأدلة.

## What it does

- Invoice check: upload the platform invoice and the merchant order file (Excel, CSV or PDF); platform, period and branches are detected automatically.
- Versioned recalculation engine: every result stores the engine and contract version, so the same files always give the same result.
- Charges map: commission, payment fees, free-delivery campaigns, VAT on fees, offers, compensations and unclassified lines.
- Exceptions center: each difference gets a severity, the source invoice line, the formula, an owner and a status until it is recovered.
- Compensation center: branch staff send order videos or receipt photos in a Telegram group; the bot links them to the order number; dispute letters are generated in Arabic and English.
- Tadqeeq AI explains results in plain language; numbers come from the accounting engine and AI never changes them.

## Who it is for

Restaurant owners, finance managers, multi-branch restaurant groups and accounting teams in Saudi Arabia selling on delivery apps.

## Pages

${PUBLIC_PAGES.map((page) => `- [${page.path === "/" ? "Home" : page.path}](${SITE_URL}${page.path})`).join("\n")}
- [Pricing](${SITE_URL}/#pricing)
- [FAQ](${SITE_URL}/#faq)
- [Sign up](${SITE_URL}/auth?mode=signup)
`;
}
