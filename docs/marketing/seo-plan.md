# SEO Audit & Plan — tadqeeq.app

_2026-09-27 · built with the seo-audit, competitor-profiling, site-architecture and content-strategy skills. Keyword volumes are not included (no keyword-data provider connected); priorities come from competitor gaps and observed search results._

## 1. Audit findings

| # | Priority | Finding | Status |
|---|---|---|---|
| 1 | **Critical** | `https://tadqeeq.app/` returns 404 "No published build" — nothing can be indexed until the project is published from Lovable. | **Owner action**: click Publish in Lovable |
| 2 | High | No `sitemap.xml`; `robots.txt` had no sitemap line and let crawlers into app screens. | Fixed: `/sitemap.xml`, `/robots.txt` and `/llms.txt` are generated from `PUBLIC_PAGES` / private lists in `src/lib/seo.ts`; a test fails if a new route is not classified |
| 3 | High | No canonical URL on the homepage. | Fixed |
| 4 | High | No structured data. | Fixed: Organization, WebSite, SoftwareApplication, FAQPage (JSON-LD) |
| 5 | Medium | No share image / `og:url` / `og:locale`; minimal Twitter tags. | Fixed: 1200×630 `/og.png`, full OG + Twitter set, `ar_SA` |
| 6 | Medium | Title repeated "تدقيق"; description short; root description had a typo ("وجاهز وجاهز"). | Fixed |
| 7 | Medium | Section H2s rendered twice (desktop + phone copies). | Fixed: one real `<h2>` per section, phone copy uses `role="heading"` |
| 8 | Medium | Signed-in screens, ops console, invite and login pages were indexable. | Fixed: `noindex` + robots disallow |
| 9 | Low | Only one public URL (homepage) — nothing for Google to rank beyond the brand name. | Plan below |

Already good: server-side rendered Arabic HTML (`lang="ar" dir="rtl"`), single H1, ~13k characters of real content, fast static assets, mobile layout.

## 2. After publishing (owner, ~15 minutes)

1. Publish in Lovable and confirm `https://tadqeeq.app/` returns the homepage (not 404).
2. Add the domain to **Google Search Console** (Domain property via DNS TXT), submit `https://tadqeeq.app/sitemap.xml`, request indexing for `/`.
3. Add the site to **Bing Webmaster Tools** (import from Search Console).
4. Test with the Rich Results Test (FAQ + SoftwareApplication) and a WhatsApp/LinkedIn share preview (`/og.png`).
5. Create a **Google Business Profile** only if there is a real office address.

## 3. Keyword map (Arabic-first)

| Cluster | Example queries | Intent | Target page |
|---|---|---|---|
| Brand + category | تدقيق فواتير تطبيقات التوصيل، مراجعة فاتورة هنقرستيشن | Commercial | `/` (done) |
| Commissions | كم عمولة هنقرستيشن، نسبة جاهز من المطاعم، عمولة كيتا للمطاعم | Informational | `/دليل/عمولة-هنقرستيشن` etc. (one per platform) |
| Compensations | تعويضات هنقرستيشن، كيف أعترض على تعويض جاهز، خصم تعويض كيتا | Problem | `/تعويضات-تطبيقات-التوصيل` + per-platform guides |
| Invoice reading | شرح فاتورة هنقرستيشن، بنود فاتورة جاهز، رسوم الدفع الإلكتروني | Informational | Platform invoice guides |
| Reconciliation | مطابقة فواتير تطبيقات التوصيل، مطابقة التحويل مع الفاتورة | Commercial | `/مطابقة-الفواتير` feature page |
| Net per order | كم يوصل المطعم من الطلب، صافي المطعم بعد العمولة | Tool | `/حاسبة-صافي-المطعم` (free calculator) |
| English (secondary) | HungerStation commission, Jahez invoice reconciliation, Keeta restaurant fees | Mixed | English versions later (`/en/...`) |
| Competitor | Flowwtics، بديل فلوتيكس | Comparison | `/مقارنة/فلوتيكس` (after launch, factual) |

## 4. Site architecture to build (in order)

```
/                                  ✔ homepage
/مطابقة-الفواتير                   feature: invoice check + charges map
/مركز-التعويضات                    feature: Telegram evidence + dispute letters
/مركز-الاستثناءات                  feature: exceptions workflow
/الأسعار                           pricing (currently a homepage section)
/حاسبة-صافي-المطعم                 free calculator (lead magnet, link bait)
/دليل/                             guides hub
  /دليل/عمولة-هنقرستيشن
  /دليل/عمولة-جاهز
  /دليل/عمولة-كيتا
  /دليل/الاعتراض-على-تعويضات-التوصيل
  /دليل/قراءة-فاتورة-هنقرستيشن
/مقارنة/فلوتيكس                     comparison (later)
```

Rules: Arabic slugs (URL-encoded automatically), one topic per page, every guide links to the matching feature page and the calculator, homepage links to the hub. Add each new page to `PUBLIC_PAGES` in `src/lib/seo.ts` (sitemap and llms.txt update automatically).

## 5. Content plan (first 8 weeks)

| Week | Piece | Why |
|---|---|---|
| 1 | Feature pages ×3 + pricing page | Give Google more than one URL; match commercial queries |
| 2 | Free net-per-order calculator | Answers "كم يوصلني من كل 100 ريال" (Lift's hook) self-serve; natural backlinks |
| 3 | Guide: عمولة هنقرستيشن للمطاعم (commission, delivery fee, payment fee, VAT, HPlus) | Highest-interest platform |
| 4 | Guides: عمولة جاهز، عمولة كيتا | Complete the trio |
| 5 | Guide: الاعتراض على تعويضات تطبيقات التوصيل بالأدلة | Problem-aware traffic; ties to compensation center |
| 6 | Guide: قراءة فاتورة هنقرستيشن بنداً بنداً | Captures invoice-reading searches |
| 7 | First case study (real numbers, with permission) | Proof gap across all competitors |
| 8 | Comparison page vs Flowwtics (factual, dated) | Capture competitor-brand searches |

Each guide: answer in the first 2 sentences (AI-search friendly), a worked example with SAR numbers labelled as examples, FAQ block with FAQPage schema, CTA to the calculator and signup.

## 6. Off-page

Full plan, submission copy and tracker: `backlinks.md`, `backlink-tracker.csv`.


- Saudi SaaS / F&B directories and Arabic startup lists; LinkedIn company page with the same name/logo; X account.
- Partner content with POS/integrators (Foodics marketplace) and restaurant-owner communities.
- Every social post about commissions links to the matching guide.
