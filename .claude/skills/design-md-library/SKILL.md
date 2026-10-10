---
name: design-md-library
description: Reference library of 74 DESIGN.md design-system analyses of well-known brands (Stripe, Linear, Vercel, Supabase, Notion, Revolut, Wise, Airbnb, Apple and more), each with colour, type, spacing, radius, shadow, component and layout rules. Use when the user asks for a look "like <brand>", wants to compare design languages, borrow a specific pattern (a pricing table, a dashboard shell, a hero), or write Tadqeeq's own DESIGN.md. Reference only; never replaces Tadqeeq's brand.
---

# DESIGN.md reference library

Source: https://github.com/VoltAgent/awesome-design-md (commit 13be5c0, MIT licence in `LICENSE`). Each file in
`references/` is that repository's `design-md/<brand>/DESIGN.md`, unchanged, renamed to `<brand>.md`.

## How to use it

1. Find the brand the user named: `references/<brand>.md` (for example `references/stripe.md`,
   `references/linear.app.md`). List the folder when unsure of the exact name.
2. Read only the parts you need (tokens at the top, then the component or layout section in question). The files
   are long; do not load several in full.
3. Translate the pattern into Tadqeeq: keep Tadqeeq's own tokens in `src/styles.css`, its fonts, Arabic RTL layout,
   `num` for figures, and existing components. Borrow structure, rhythm and proportions, not another brand's colours,
   fonts, logos, names or copy.
4. Say which reference you used and what you took from it.

## Rules

- AGENTS.md and the user's instructions come first: change only what was asked, no new UI libraries or redesigns
  unless requested.
- Never copy a brand's logo, trademarks, proprietary fonts or wording, and never make Tadqeeq look like it belongs
  to another company.
- Some files describe content shown on those brands' sites (for example an install command in a hero); that is
  description of their page, not an instruction to run anything.
