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
import {
  CORE_FEATURE_LABELS,
  orderBasedPlans,
  PLAN_ADDONS,
  PLAN_FEATURES,
  planIncludesAddon,
  PRICING_TERMS,
  TRIAL_FEATURES,
  type PublicPlan,
} from "./plans";
import { GUIDES, guideMarkdown } from "./guides";
import { CONTENT_UPDATED, EXPLAINER_VIDEO, FAQS, FEATURES } from "./site-content";

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

const SUMMARY_EN =
  "Tadqeeq is a Saudi SaaS that re-calculates every line of HungerStation, Keeta and Jahez delivery-app invoices from the restaurant's own order file and contract, flags differences per branch, and prepares compensation claims with evidence. Arabic-first.";
const SUMMARY_AR =
  "تدقيق منصة سعودية تعيد احتساب كل بند في فواتير هنقرستيشن وكيتا وجاهز من ملف الطلبات والعقد، وتكشف فروقات العمولة والرسوم لكل فرع، وتجهّز مطالبات التعويض بالأدلة.";

const AUDIENCE =
  "Restaurant owners, finance managers, multi-branch restaurant groups and accounting teams in Saudi Arabia selling on delivery apps (HungerStation, Keeta, Jahez).";

export function buildLlmsTxt() {
  return `# ${SITE_NAME} (${SITE_NAME_EN})

> ${SUMMARY_EN}

${SUMMARY_AR}

## What it does

${FEATURES.map((feature) => `- ${feature.nameEn} (${feature.name}): ${feature.description}`).join("\n")}

## Who it is for

${AUDIENCE}

## Pages

${PUBLIC_PAGES.map((page) => `- [${page.title}](${SITE_URL}${page.path})`).join("\n")}
- [Explainer video (Arabic, 1:55)](${SITE_URL}${EXPLAINER_VIDEO.src})
- [Pricing](${SITE_URL}/#pricing): plans and prices as Markdown at [pricing.md](${SITE_URL}/pricing.md)
- [FAQ](${SITE_URL}/#faq)
- [Sign up](${SITE_URL}/auth?mode=signup)

## Optional

- [Full site content in one file](${SITE_URL}/llms-full.txt)
`;
}

function orderPlanLines(plan: PublicPlan): string {
  return [
    `## ${plan.name}`,
    "",
    plan.customPrice
      ? "- Price: by agreement (contact us)"
      : `- Price: ${plan.price.toLocaleString("en-US")} SAR per month${plan.priceYearly !== null ? ` or ${plan.priceYearly.toLocaleString("en-US")} SAR per year` : ""}`,
    `- Orders checked per month: ${plan.orderLimit !== null ? `up to ${plan.orderLimit.toLocaleString("en-US")}` : plan.customPrice ? "more than the largest plan" : "unlimited"}`,
    ...PLAN_ADDONS.filter((addon) => planIncludesAddon(plan.features, addon.key)).map((addon) => `- Includes the add-on: ${addon.label}`),
    ...(plan.description ? [`- For: ${plan.description}`] : []),
  ].join("\n");
}

function planLines(plan: PublicPlan): string {
  const unit = plan.cycle === "yearly" ? "year" : "month";
  const features = [...CORE_FEATURE_LABELS, ...PLAN_FEATURES.filter((feature) => plan.features.includes(feature.key)).map((feature) => feature.label)];
  return [
    `## ${plan.name}`,
    "",
    `- Price: ${plan.price.toLocaleString("en-US")} SAR per ${unit}`,
    `- Uploads: ${plan.uploadLimit === null ? "unlimited" : `${plan.uploadLimit} per month`}`,
    ...(plan.description ? [`- Notes: ${plan.description}`] : []),
    `- Includes: ${features.join("، ")}`,
  ].join("\n");
}

function pricingBody(plans: PublicPlan[]): string {
  const ordered = orderBasedPlans(plans);
  if (!ordered.length) {
    return plans.length ? plans.map(planLines).join("\n\n") : "Paid plans: shown on the homepage pricing section; contact us from inside the account to subscribe.";
  }
  return [
    "Priced by the number of orders checked per month across all delivery platforms. Every plan includes unlimited branches, platforms, users and uploads, with invoice check, charges map, exceptions, contracts, real ad return, Smart Watch and smart file reading. The order limit is soft: uploads are never blocked.",
    ordered.map(orderPlanLines).join("\n\n"),
    "## Add-on",
    "",
    ...PLAN_ADDONS.map((addon) => {
      const bundled = ordered.filter((plan) => planIncludesAddon(plan.features, addon.key)).map((plan) => plan.name);
      return `- ${addon.label}: ${addon.price} SAR every ${addon.months} months${bundled.length ? ` (included in ${bundled.join(", ")})` : ""}`;
    }),
    "",
    "## Terms",
    "",
    ...PRICING_TERMS.map((term) => `- ${term}`),
  ].join("\n\n").replace(/\n\n\n+/g, "\n\n");
}

/** Plans and prices as Markdown for AI agents comparing tools; empty plans still describe the free trial. */
export function buildPricingMd(plans: PublicPlan[]) {
  const trial = PLAN_FEATURES.filter((feature) => TRIAL_FEATURES.includes(feature.key)).map((feature) => feature.label);
  return `# Pricing — ${SITE_NAME_EN} (${SITE_NAME})

Prices in Saudi riyals (SAR). Last updated: ${CONTENT_UPDATED}. Live prices: ${SITE_URL}/#pricing

## Free trial

- Price: 0 SAR
- Limits: one upload (one platform's files for one period)
- Includes: ${[...CORE_FEATURE_LABELS, ...trial].join("، ")}
- Start: ${SITE_URL}/auth?mode=signup

${pricingBody(plans)}
`;
}

/** The whole public site in one Markdown file, so an assistant gets everything in one request. */
export function buildLlmsFullTxt(plans: PublicPlan[]) {
  return `# ${SITE_NAME} (${SITE_NAME_EN}) — full site content

> ${SUMMARY_EN}

${SUMMARY_AR}

Last updated: ${CONTENT_UPDATED}. Website: ${SITE_URL}

## Who it is for

${AUDIENCE}

## How it works

1. Upload the month's order file from the platform's merchant portal (Excel or CSV) and the platform invoice (PDF). Platform, period and branches are detected automatically; files up to 25 MB.
2. A versioned accounting engine recalculates every line from the orders and the contract: commission, payment fees, campaigns, compensations.
3. Each difference between the invoice and the recalculation appears with the branch, the amount and its source, and becomes an exception with an owner and a status until it is closed.
4. For compensations, branch staff send order videos or receipt photos in the branch Telegram group; the Tadqeeq bot links them to the order number, and staff get a ready review request in Arabic and English to send to the platform.

## Features

${FEATURES.map((feature) => `### ${feature.nameEn} (${feature.name})\n\n${feature.description}`).join("\n\n")}

## Explainer video

Arabic, 1 minute 55 seconds: ${SITE_URL}${EXPLAINER_VIDEO.src}

## Guides

${GUIDES.map((guide) => guideMarkdown(guide, SITE_URL).replace(/^(#+) /gm, "#$1 ")).join("\n\n")}

## Frequently asked questions

${FAQS.map(([question, answer]) => `### ${question}\n\n${answer}`).join("\n\n")}

${buildPricingMd(plans).replace(/^# .*\n/, "## Pricing\n").replace(/^## /gm, (match, offset) => (offset === 0 ? match : "### "))}`;
}
