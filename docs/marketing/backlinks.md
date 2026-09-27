# Backlink Plan — tadqeeq.app

_2026-09-27 · built with the directory-submissions and competitor-profiling skills. Track every submission in `backlink-tracker.csv`._

## 0. Readiness — do these before submitting anywhere

Directories and partners check the site before approving. Links to a 404 are wasted and first impressions stick.

| # | Blocker | Status |
|---|---|---|
| 1 | Site published and returning 200 at `https://tadqeeq.app/` | **Open** — publish from Lovable |
| 2 | Privacy policy and terms pages | **Open** — no `/privacy` or `/terms` yet (required by G2, Capterra, Product Hunt, app marketplaces) |
| 3 | Pricing visible without login | Section on homepage (a `/الأسعار` page is better) |
| 4 | Logo assets | Done — SVG in `src/components/brand/Logo.tsx`, `/favicon.svg`, `/apple-touch-icon.png`, `/og.png`. Still need a 1024×1024 PNG and a transparent wordmark PNG |
| 5 | 5–8 real screenshots (1920×1080) + 60–90s demo video | **Open** |
| 6 | Structured data (Organization, SoftwareApplication, FAQPage) | Done |
| 7 | A few destination pages beyond the homepage (features, calculator, one guide) | **Open** — see `seo-plan.md` §4 |

## 1. What competitors have

Flowwtics and Lift have **no meaningful backlinks** beyond their own social profiles (Facebook, Instagram, TikTok, YouTube Shorts). The field is empty: every quality link below puts Tadqeeq ahead.

## 2. Tier A — Saudi ecosystem (highest relevance)

| Target | Type | What it takes | Why |
|---|---|---|---|
| **Foodics App Marketplace** (foodics.com/marketplace) | Partner listing, dofollow | Integration (pull order data from Foodics or push results) + partner application | Every Saudi restaurant on Foodics browses it; finance apps (Wafeq) are already listed |
| **Qoyod marketplace + technical partner program** (qoyod.com/marketplace) | Partner listing | Integration (post reconciled platform fees/compensations as journal entries) | 25k+ Saudi businesses, has an F&B sector page |
| **Daftra app marketplace + developer portal** (apps.daftra.com, developers.daftra.com) | App listing | Publish a Daftra app | 40k+ users; open developer program |
| **Wafeq, Rewaa** partner pages | Partner listing / co-marketing | Integration or referral partnership | Saudi finance and inventory tools restaurants already use |
| **MAGNiTT** startup profile (magnitt.com/startups) | Profile | Free company profile | Regional startup database, cited by media and investors |
| **Crunchbase** | Profile | Free | Entity signal for Google and AI answers |
| **LinkedIn company page** | Profile | Same name/logo/URL everywhere | Entity consistency |
| **Google Business Profile** | Profile | Only with a real address | Brand search panel |

## 3. Tier B — Arabic content & media (earned links)

| Target | Angle |
|---|---|
| sec-intel.com (Arabic article on delivery-app commissions) | Offer a data-backed update or a guest section on checking invoices line by line |
| getsira.ai blog (Saudi delivery apps guide) | Pitch a section on invoice reconciliation; they cover ratings, not money |
| X account @delivapps (writes about delivery-app fees in Saudi) | Share the calculator and platform guides; ask for a review, not a post |
| StartupScene ME, Wamda, Argaam (covered delivery-app pricing & GAC) | Pitch a data story: "كم تأخذ تطبيقات التوصيل فعلاً من كل 100 ريال" from anonymised aggregate data (with customer consent) |
| Restaurant-owner podcasts / YouTube (e.g. Al Arabiya FM coverage of delivery apps) | Founder interview on hidden fees and compensations |

## 4. Tier C — Global SaaS directories (dofollow, fast)

Submit after §0 is green, one batch per week, varying the copy (below).

| Directory | DR | Link | Notes |
|---|---|---|---|
| SaaSHub | 77 | dofollow | List as alternative to Voosh / Loop / Flowwtics |
| G2 | 92 | dofollow | Free listing; needs reviews to rank — ask first customers |
| Capterra / GetApp / Software Advice | 78–93 | dofollow | One Gartner/G2 listing syncs to several |
| SourceForge | 92 | dofollow | Trivial listing |
| AlternativeTo | 79 | nofollow | Still ranks for "X alternatives" |
| F6S | 65 | dofollow | Startup profile |
| TheSaaSDirectory, SaaSWorthy, Startup Stash | 50–88 | dofollow | Category: restaurant / finance / reconciliation |
| Product Hunt | 91 | dofollow | Only with a 3-week warm-up and an English version; later |

## 5. Tier D — Link magnets (links others give without asking)

1. **Free calculator** `/حاسبة-صافي-المطعم`: net per 100 SAR after commission, payment fee, VAT, offers. People share tools.
2. **Annual report** "تقرير عمولات تطبيقات التوصيل في السعودية": aggregated, anonymised, published once a year; journalists cite reports.
3. **Invoice glossary** "قاموس بنود فواتير تطبيقات التوصيل": every fee line explained; bloggers link definitions.

## 6. Submission copy (vary per directory — never paste the same text everywhere)

**Name**: تدقيق (Tadqeeq) · **URL**: https://tadqeeq.app · **Category**: Restaurant management / Accounting / Reconciliation · **Country**: Saudi Arabia · **Languages**: Arabic, English

**Tags**: restaurant finance, delivery app reconciliation, HungerStation, Jahez, Keeta, invoice audit, commission tracking, chargeback / compensation disputes

**Taglines (<10 words)**
- AR: لا تدفع فاتورة المنصة قبل ما تتأكد منها.
- EN: Check every delivery-app invoice before you pay it.

**Short (≤60 chars)**
- AR: تدقيق فواتير هنقرستيشن وجاهز وكيتا للمطاعم
- EN: Delivery-app invoice audits for Saudi restaurants

**Long — SaaS directories (alternative framing, EN)**
Tadqeeq is an Arabic-first alternative to spreadsheet reconciliation and to tools like Voosh or Loop, built for Saudi delivery apps. Upload a HungerStation, Jahez or Keeta invoice with your merchant order file and Tadqeeq recalculates every line from your contract: commission, payment fees, free-delivery campaigns, VAT on fees and compensations. Each difference becomes an exception with its source line, formula and owner, and compensation claims come with evidence your branch staff send from Telegram. Built for restaurant owners, finance teams and multi-branch groups.

**Long — B2B review sites (ROI + use case, EN)**
Restaurants on delivery apps pay invoices nobody re-checks. Tadqeeq rebuilds each HungerStation, Jahez and Keeta invoice from the restaurant's own orders and contract, shows the exact fee line where the platform charged more than agreed, and prepares the dispute with evidence. Finance teams close each period with a source for every number; owners see what each branch really keeps.

**وصف طويل — المواقع العربية**
تدقيق منصة سعودية تعيد احتساب كل بند في فواتير هنقرستيشن وجاهز وكيتا من ملف طلبات المطعم وعقده: العمولة، رسوم الدفع، حملات التوصيل المجاني، ضريبة القيمة المضافة على الرسوم، والتعويضات. كل فرق يظهر كاستثناء بمصدره ومعادلته ومسؤوله، ومطالبات التعويض تُجهَّز بالأدلة التي يرسلها موظف الفرع من قروب Telegram. مصممة لأصحاب المطاعم والإدارات المالية ومجموعات المطاعم متعددة الفروع.

**Founder story (fill in)**: _2–3 sentences on why you built it — e.g. the invoice difference you found yourself._

## 7. Rules

- Only link to pages that exist and are indexed; update `PUBLIC_PAGES` in `src/lib/seo.ts` when a new page ships.
- Same name, logo and URL on every profile (entity consistency helps Google and AI answers).
- Verify each live listing: the link is there and has no `rel="nofollow"` (unless expected).
- No paid link schemes or PBNs.
