# Product Marketing Context

_Version 1.0 · 2026-09-27 · read by the marketing skills (seo-audit, competitors, copywriting, …) before they ask questions._

## Product Overview

- **Name**: تدقيق (Tadqeeq) — tadqeeq.app
- **One line**: تدقيق يعيد احتساب كل بند في فواتير تطبيقات التوصيل (هنقرستيشن، جاهز، كيتا) من ملف الطلبات والعقد، ويكشف الفروقات لكل فرع، ويجهّز مطالبات التعويض بالأدلة.
- **Category**: Restaurant delivery-invoice reconciliation / financial operations SaaS (Saudi Arabia).
- **Core features (live in the app)**:
  - Invoice check: upload the platform invoice + merchant order file (Excel/CSV/PDF); platform, period and branches are auto-detected; format-change alerts instead of unreliable results.
  - Versioned recalculation engine (engine version + contract version saved with every result).
  - Charges map: commission, payment fees, free-delivery campaigns, VAT, offers, net settlement, compensations, unclassified lines.
  - Exceptions center: each difference becomes an exception with severity, source line, formula, owner and status (جديد ← قيد المراجعة ← تم التواصل ← تم الاعتراض ← تم الاسترداد).
  - Compensation center: cashiers send order video/receipt photos in the branch Telegram group; the bot links evidence to the order number; dispute letters in Arabic and English; recovery tracking.
  - Promotions ROI, branch comparison, period close and re-analysis, Tadqeeq AI (explains numbers, never changes them), team roles and permissions.
- **Pricing**: plans are managed in the ops console (database), shown on the homepage pricing section.

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
