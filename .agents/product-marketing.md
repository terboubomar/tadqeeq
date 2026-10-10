# Product Marketing Context

_Version 1.2 · 2026-10-10 · read by the marketing skills (seo-audit, competitors, copywriting, …) before they ask questions._

## Product Overview

- **Name**: تدقيق (Tadqeeq) — tadqeeq.app
- **One line**: تدقيق يعيد احتساب كل بند في فواتير تطبيقات التوصيل (هنقرستيشن، جاهز، كيتا) من ملف الطلبات والعقد، ويكشف الفروقات لكل فرع، ويجهّز مطالبات التعويض بالأدلة.
- **Category**: Restaurant delivery-invoice reconciliation / financial operations SaaS (Saudi Arabia).
- **Products** (names from `src/lib/products.ts`; use them in all copy, first mention with the descriptor):
  - **مُطابِق (Mutabiq) · مطابقة الفاتورة**: upload the platform invoice + merchant order file (Excel/CSV/PDF); platform, period and branches auto-detected; every line recalculated by a versioned engine (engine + contract version saved with each result); format-change alerts instead of unreliable results.
  - **كاشِف (Kashif) · خريطة الرسوم**: commission, payment fees, free-delivery campaigns, VAT, offers, compensations and unclassified lines per platform and branch.
  - **رادار (Radar) · مركز الاستثناءات**: each difference becomes an exception with severity, source line, formula, owner and status (جديد ← قيد المراجعة ← تم التواصل ← تم الاعتراض ← تم الاسترداد).
  - **استرداد (Istirdad) · مركز التعويضات**: cashiers send order video/receipt photos in the branch Telegram group; the bot links evidence to the order number; dispute letters in Arabic and English; recovery tracking.
  - **عائد (Aaid) · عائد العروض والإعلانات**: real profit per promotion/ad campaign after commission, discounts and ad spend.
  - **رقيب (Raqeeb) · المراقب الذكي**: compares each branch with its history and similar branches after every upload, ranks unusual fees by SAR impact.
  - **نَبْض (Nabd) · المتابعة اليومية**: upload the daily order file (HungerStation, Keeta, Jahez) to follow sales, platform cost %, cost per order and month-end payout forecast per platform and branch; flags files exported before the platform settled commissions. In-app only (no public product page yet).
  - **Tadqeeq AI · المساعد الذكي**: answers questions about the numbers in Arabic; never changes them. Also usable from Claude and ChatGPT (MCP) on the top plan or with the add-on.
  - **القيود المحاسبية (journal entries)**: one entry per branch and platform from the audit result, cost center per branch, export for Excel, Odoo, Zoho Books, QuickBooks, Qoyod (قيود) and Daftra (دفترة).
  - Also: branch comparison, period close and re-analysis, contracts, team roles and permissions, optional two-step sign-in.
- **Pricing** (order-based, live in the database; homepage pricing section and `/pricing.md`): البداية 299 SAR/month up to 15,000 orders; النمو 499 SAR up to 45,000; الشاملة 799 SAR unlimited, includes استرداد + Tadqeeq AI + Claude/ChatGPT. Add-on (استرداد + Tadqeeq AI + MCP) 399 SAR every 4 months on the other plans. Yearly = 2 months free. Free trial: one upload. Prices exclude VAT; bank transfer after invoice.
- **Public pages**: `/`, `/guides` (+ 3 guides), `/contact`, `/privacy`, `/terms`, `/refund-policy`, `/cookies`.

## Target Audience

- Saudi restaurants and cafés selling on HungerStation, Jahez and Keeta (also The Chefz, Ninja, Mrsool).
- Sweet spot: 3–50 branches, multi-brand groups, franchise operators.
- Buyers: restaurant owner / GM, CFO / finance manager, accounting team; users: accountants, branch managers, cashiers (evidence only).

## Personas

- **Owner (صاحب المطعم)**: wants to know what the platform really takes per order and whether the invoice is right before paying.
- **Finance manager (المدير المالي)**: needs an auditable monthly close per platform with a source for every number.
- **Group ops (مجموعة مطاعم)**: compares branches and platforms, spots recurring differences.
- **Accounting team (فريق المحاسبة)**: wants results without manual spreadsheets, exportable to Excel.

## Problems & Pain Points

- Each platform sends different files and terms; nobody re-checks the invoice, it gets paid as is.
- Commission charged above the contracted rate; VAT on commission moves with it.
- Compensations/refunds deducted for orders the branch fulfilled correctly, with no evidence to contest.
- Unclassified deductions nobody can explain.
- Month-end rebuilt by hand in spreadsheets.

## Competitive Landscape

- **Direct**: Flowwtics (flowwtics.com) — Saudi, English-first, reconciliation + Refund Shield (Telegram photo evidence) + analytics, SAR 399–1,299/mo, demo-led, no free trial.
- **Secondary (service)**: Lift (lift-saudi.com) — managed service team that runs restaurant accounts on the apps, disputes compensations, reconciles invoices; free initial audit via WhatsApp.
- **Adjacent**: aggregator/POS integrators (Foodics, Grubtech, Deliverect), review/ratings tools (Sira), accounting firms and in-house spreadsheets.
- **Global analogues** (content playbook reference, not in-market): Voosh, Loop, Restaurant365 dispute management.

See `docs/marketing/competitors/` for profiles.

## Differentiation

- Arabic-first product and language (Flowwtics is English-first with `?lang=ar`).
- Line-by-line recalculation with a visible formula, source line and versioned engine/contract — auditable.
- Exceptions workflow with owners and statuses, period close and re-analysis.
- Compensation evidence via Telegram with no staff app, plus bilingual dispute letters.
- Self-serve software (vs. Lift's managed service); AI explains but never changes numbers.

## Objections

- "My accountant already checks it" → spreadsheets check totals, not each fee line against the contract.
- "Platforms change file formats" → format-change alerts instead of wrong results.
- "Is my data separate/secure?" → separate workspace per company with role permissions.
- "Will staff need another app?" → no, Telegram group only.

## Customer Language

- "العمولة أعلى من العقد" · "تعويضات ما لنا ذنب فيها" · "كم يوصلني من كل 100 ريال" · "الفاتورة ما تطابق التحويل" · "بنود غير مفهومة" · "نعترض على التعويض" · "مطابقة الفواتير آخر الشهر".

## Brand Voice

Calm, precise, Saudi-friendly Modern Standard Arabic with light Gulf phrasing in headlines ("قبل ما تتأكد منها"). Numbers first, no hype. Always label sample numbers as examples.

## Proof Points

- Illustrative: SAR 1,907.85 difference in one sample invoice; commission 20% charged vs 18% agreed.
- Needs real customer proof (logos, recovered amounts) — not yet available.

## Goals

- Get tadqeeq.app published and indexed; rank for Arabic queries on delivery-app commissions, invoice checks and compensations.
- Primary conversion: signup (ابدأ مجاناً); secondary: demo request.

## Changelog

- 1.0 (2026-09-27): initial context from the app, homepage and competitor scan.
- 1.1 (2026-10-05): product names, order-based pricing and add-on, public pages.
- 1.2 (2026-10-10): نَبْض (daily tracking), journal entries with cost centers and accounting-system exports, CPC ad invoices per branch in كاشِف.
