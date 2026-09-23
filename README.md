# Tadqeeq

Tadqeeq audits delivery-platform settlements and invoices using deterministic accounting engines for HungerStation, Keeta, and Jahez.

The accounting engine is the source of truth. AI can explain, summarize, and retrieve audited facts, but it does not recalculate accounting results.

## Requirements

- Bun 1.4.2
- PostgreSQL / Supabase
- Node-compatible deployment environment
- OpenAI API key only when Tadqeeq AI features are enabled

## Local setup

```sh
git clone <repository-url>
cd tadqeeq
cp .env.example .env
bun install --frozen-lockfile
bun run dev
```

The dependency registry is pinned to the public npm registry. SheetJS is pinned to its official CE distribution tarball.

## Environment contract

Database and Supabase:

```sh
DATABASE_URL=
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
VITE_SUPABASE_URL=
VITE_SUPABASE_PUBLISHABLE_KEY=
```

AI, server-side only:

```sh
OPENAI_API_KEY=
TADQEEQ_AI_MODEL=gpt-5.6-luna
TADQEEQ_AI_MAX_REQUESTS_PER_HOUR=30
```

Never expose `OPENAI_API_KEY` or `SUPABASE_SERVICE_ROLE_KEY` through a `VITE_*` variable.

## Database migrations

The migration journal under `drizzle/migrations/meta/_journal.json` is the authoritative execution order for the committed SQL migrations.

Apply migrations with:

```sh
DATABASE_URL='postgresql://...' bun run db:migrate
```

The repository contains a regression test that verifies every committed SQL migration is registered exactly once and that dependency-sensitive migrations run in a safe order.

## Quality gate

The release gate is:

```sh
bun install --frozen-lockfile
bun run typecheck
bun run lint
bun run test
bun run build
```

Formatting can be checked separately with:

```sh
bun run format:check
```

## Accounting architecture

```text
platform source files
  -> strict parser
  -> deterministic platform engine
  -> structured audit result
  -> exception and evidence logic
  -> optional AI explanation
  -> human review
```

Required financial values fail loudly when malformed. Missing official/invoice values remain missing rather than being converted to zero.

## AI architecture

Tadqeeq AI is deliberately separated from the accounting engine:

```text
deterministic audit result
  -> server-built fact/evidence registry
  -> AI explanation layer
```

The AI layer cannot change calculated values, exception status, tolerances, or recovery amounts.

### Exception Explainer

Inside **مركز الاستثناءات -> التفاصيل**, the server re-authenticates the user, rebuilds the exception and Evidence Trail from stored deterministic data, and sends only the minimum structured evidence required for the explanation.

Raw Excel, CSV, and PDF files are not sent to the AI provider. AI outputs are not written back into the audit result.

### Period Summary

Inside **اللوحة التنفيذية**, Tadqeeq builds a compact deterministic management packet containing audited period metrics, exception exposure, top exceptions, top branches, and platform-specific metrics before requesting AI commentary.

### Period Intelligence

Tadqeeq finds the nearest earlier saved period for the same platform and calculates deterministic movements before any AI request. Percentage-point changes remain distinct from relative percentage changes.

### Ask Tadqeeq

**اسأل تدقيق** uses a server-built fact registry. Chat history is used only for conversational continuity and not as a financial source of truth.

Every numeric claim in the final AI answer is checked against the cited deterministic facts. Unsupported numeric claims are rejected and replaced with a safe data-not-available response.

## Security notes

- Raw financial files are not sent to OpenAI.
- AI usage is rate-limited atomically before paid calls.
- Failed paid AI calls still count toward the rate limit.
- Uploads larger than 25 MB are rejected before client parsing.
- Exception workflow updates use a server-side atomic database function.
- Duplicate audit periods are protected at the database level.
