---
name: tadqeeq-seo
description: How SEO, AI-search (GEO/AEO) and marketing pages work in the Tadqeeq codebase. Use for any SEO, ranking, indexing, sitemap, robots, llms.txt, structured data, meta tags, Open Graph, guides/blog content, landing pages, keyword or product-naming work on tadqeeq.app — before editing pages or using the generic skills (seo-audit, ai-seo, schema, programmatic-seo, site-architecture, content-strategy, copywriting, competitors). It says where each piece lives, the rules every public page must follow, and the checks to run.
metadata:
  version: 1.0.0
---

# Tadqeeq SEO playbook

Tadqeeq (تدقيق, https://tadqeeq.app) is an Arabic-first Saudi SaaS that audits HungerStation, Jahez and Keeta invoices for restaurants. The audience searches in Arabic; English is secondary.

Read first:
- `.agents/product-marketing.md`: product, audience, competitors, voice. The generic marketing skills read it too. Update it when product, pricing or positioning changes.
- `docs/marketing/seo-plan.md`: the audit, keyword map and roadmap. Mark items done there when you ship them.
- `docs/marketing/competitors/`, `docs/marketing/backlinks.md`, `docs/marketing/backlink-tracker.csv`.

Then use the generic skills for method: `seo-audit` (technical/on-page), `ai-seo` (AI citations, llms.txt), `schema` (JSON-LD), `programmatic-seo` (pages at scale), `site-architecture` (URLs, internal links), `content-strategy` / `copywriting` (what to write and how), `competitors` / `competitor-profiling` (comparison pages), `directory-submissions` (backlinks).

## Where things live

| What | File |
|---|---|
| Site URL, name, OG image, `canonical()`, `socialMeta()`, `jsonLd()`, `NOINDEX` | `src/lib/seo.ts` |
| Indexable pages (sitemap + llms.txt) | `PUBLIC_PAGES` in `src/lib/seo.ts` (each has `lastmod`) |
| Blocked from crawlers | `PRIVATE_PREFIXES` / `PRIVATE_PAGES` / `NOINDEX_PAGES` in `src/lib/seo.ts` |
| robots.txt, sitemap.xml, llms.txt, llms-full.txt, pricing.md | `src/routes/robots[.]txt.ts`, `sitemap[.]xml.ts`, `llms[.]txt.ts`, `llms-full[.]txt.ts`, `pricing[.]md.ts`, content from `src/lib/seo-files.ts` |
| AI crawlers allowed by name | `AI_CRAWLERS` in `src/lib/seo.ts` |
| Homepage (meta, Organization/WebSite/SoftwareApplication/FAQPage JSON-LD) | `src/routes/index.tsx` (`head`) |
| FAQs, feature list, explainer video, `CONTENT_UPDATED` | `src/lib/site-content.ts` |
| Product names (مُطابِق، كاشِف، رادار، استرداد، عائد، رقيب، Tadqeeq AI) | `src/lib/products.ts`; never hard-code a product name |
| Guides (articles) | data in `src/lib/guides.ts`, head/JSON-LD in `src/lib/guides-seo.ts`, UI in `src/components/guides/GuidePages.tsx`, routes in `src/routes/guides/` |
| Legal pages | `src/lib/legal.ts`, `src/lib/legal-seo.ts`, `src/components/legal/LegalPage.tsx` |
| Contact page (ContactPage JSON-LD) | `src/routes/contact.tsx`, `src/components/ContactPage.tsx` |
| Plans and prices (live from the database) | `src/lib/plans.ts`, `listPublicPlans`; never hard-code prices in copy except FAQs that say so |
| Security headers / CSP (affects third-party scripts like analytics) | `src/lib/security-headers.ts` |

## Rules for every public page

1. **Classify the route.** A new route must be added to `PUBLIC_PAGES` (indexable) or to the private lists. `src/lib/seo-files.test.ts` ("route coverage") fails otherwise.
2. **Head tags.** Use `head: () => ({ meta: [title, description, ...socialMeta(...)], links: [canonical(path)], scripts: [jsonLd(...)] })`. Title ≤ ~60 chars ending "| تدقيق"; description 120–160 chars, Arabic, specific (platform names, the problem).
3. **One H1**, Arabic, matching the main query. Section headings as real `<h2>`; if a section has phone and desktop copies, only one is a heading.
4. **Structured data** that matches visible content: `Article` + `FAQPage` + `BreadcrumbList` for guides (see `guideHead`), `WebPage` for legal, `ContactPage` for contact, `SoftwareApplication` + `FAQPage` on the homepage. Validate with the Rich Results Test after deploy.
5. **Arabic and RTL.** `lang="ar" dir="rtl"` is set at the root. Keep Latin words (Claude, HungerStation, Tadqeeq AI) away from the end of an Arabic sentence or line, because they reorder badly. Wrap numbers in `<span className="num">` where the page does. Check every new page at 390 px and 1280 px.
6. **Product names** come from `PRODUCTS` / `productTitle()`; in prose quote them («استرداد»). The first mention on a page should include the descriptor (استرداد · مركز التعويضات), because people search for the descriptor, not the name.
7. **Facts only.** Numbers in marketing copy are labelled as examples. No invented customer counts, logos, recovered amounts or rankings. Competitor claims must be verifiable (see `docs/marketing/competitors/`).
8. **Update dates.** Bump that page's `lastmod` in `PUBLIC_PAGES` (and `updated` for guides, `CONTENT_UPDATED` for homepage/FAQ changes) when content changes meaningfully.
9. **Internal links.** Every new page links to at least one related guide or product section and is linked from the homepage footer, the guides index or a related guide.
10. **Never index app screens**, the ops console, auth or utility pages; they carry `NOINDEX`.

## Adding a guide (most common SEO task)

1. Pick a query cluster from `docs/marketing/seo-plan.md` (keyword map) that has no page yet.
2. Add an entry to `GUIDES` in `src/lib/guides.ts` (slug, path `/guides/<slug>`, title, metaTitle, description, published/updated, sections, faqs) following the existing three.
3. Add the route file in `src/routes/guides/<slug>.tsx` like the others (`head: () => guideHead(guide)`).
4. Add the path to `PUBLIC_PAGES`, link it from related guides and the footer group «أدلة» in `src/routes/index.tsx` if it is a main one.
5. Run the checks below, screenshot it on mobile and desktop, and update `seo-plan.md`.

## Checks before pushing

```bash
bun test src/lib/seo-files.test.ts        # route coverage, sitemap, robots, llms, pricing.md
bunx tsc --noEmit && bun run lint
bun run build                              # regenerates src/routeTree.gen.ts when routes change
```

To see pages locally: `bunx vite --port 4173 --host 127.0.0.1`, then screenshot with Playwright using `executablePath: "/opt/pw-browsers/chromium"` (install `playwright-core` in a scratch folder). Pricing is hidden locally because there is no database.

## After deploy (owner)

Google Search Console (sitemap `https://tadqeeq.app/sitemap.xml`, URL inspection for new pages), Bing Webmaster Tools, Rich Results Test, share preview (WhatsApp/LinkedIn) for `/og.png`. No keyword-volume provider is connected; say so instead of inventing search volumes.
