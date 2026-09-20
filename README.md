# Tadqeeq

Tadqeeq audits delivery-platform settlements and invoices using deterministic accounting engines for HungerStation, Keeta, and Jahez.

## AI architecture

Tadqeeq AI is deliberately separated from the accounting engine:

```
raw platform files
  -> deterministic audit engine
  -> structured audit evidence
  -> Tadqeeq AI explanation layer
```

The AI layer cannot change calculated values, exception status, tolerances, or recovery amounts.

### Exception Explainer V1

Inside **مركز الاستثناءات -> التفاصيل**, users can request **فسّر هذا الاستثناء**.

The server:

1. authenticates the current Supabase session;
2. re-fetches the owned period from the database;
3. rebuilds the exception and Evidence Trail server-side;
4. sends only the minimal structured evidence packet to the AI provider;
5. requests a schema-constrained Arabic explanation;
6. records usage metadata only for rate limiting.

Raw Excel, CSV, and PDF files are not sent to the AI provider. Workflow notes/history and internal database identifiers are excluded from the AI packet.

AI outputs are not written back into the audit result.

### Period Summary V1

Inside **اللوحة التنفيذية**, users can request **أنشئ ملخص الفترة**.

The server re-authenticates the Supabase session, re-fetches the owned period, rebuilds the deterministic exception set, and creates a compact management packet containing audited period metrics, exception exposure, top exceptions, top branches, and platform-specific deterministic metrics.

The packet excludes raw files, workflow notes/history, user IDs, period database IDs, branch database IDs, and the private stored period label. The model is explicitly prohibited from inventing calculations or claiming month-over-month trends from a single period.

Period Summary output is schema-constrained Arabic commentary only. It cannot edit figures, exception state, recovery amounts, or accounting results.

### Period Intelligence V1

The executive dashboard automatically finds the nearest earlier saved period for the same delivery platform and builds a deterministic comparison before any AI call.

The comparison calculates:

- orders, gross sales, net sales, commission, total platform cost, and their relative changes;
- commission-rate and platform-cost-rate changes in **percentage points**, kept distinct from relative percentage change;
- open-exception count, amount under review, potential recovery, and recovered-amount movement;
- exception-category movement;
- branch-level sales, platform-cost, cost-rate, and commission-rate movement;
- warnings when period duration or branch coverage differs.

Users can then request **فسّر التغيّرات بـ AI**. The server re-fetches both owned periods, rebuilds the comparison, and sends only the deterministic comparison packet to the model. Raw source files, workflow notes/history, user IDs, period IDs, and branch IDs are not included in the AI packet.

The AI cannot change the comparison or accounting result and is instructed not to claim a cause unless the supplied comparison evidence supports it.

### Ask Tadqeeq V1

**اسأل تدقيق** is a period-aware financial analyst built on top of Tadqeeq's deterministic audit outputs.

For every question, the server:

1. authenticates the current user and re-fetches the selected owned period;
2. builds a fresh fact registry from deterministic period KPIs, branch metrics, branch rankings, daily rankings, exceptions, Evidence Trails, and the nearest valid previous-period comparison;
3. excludes raw files, user IDs, database period IDs, stored period labels, branch/store IDs, workflow notes/history, and direct order identifiers from the model packet;
4. sends the question, limited conversational history, and the fact registry to OpenAI;
5. requires a schema-constrained response containing explicit fact IDs;
6. resolves those IDs against the server-built registry before returning the answer.

Chat history is used only for conversational continuity. It is not a financial source of truth.

If a supposedly grounded answer does not reference any valid fact in the current server registry, Tadqeeq replaces it with a safe **data not available** response instead of returning an unsupported financial claim.

Ask Tadqeeq does not recalculate accounting figures, rank branches itself, modify audit state, change potential recovery, close exceptions, or submit disputes. Rankings, deltas, percentage changes, and percentage-point changes are calculated deterministically before the AI request.

Chat messages and AI responses are not stored in the audit result. The AI usage ledger records metadata only.

## AI setup

Configure these as deployment/server secrets, never as `VITE_*` client variables:

```sh
OPENAI_API_KEY=...
TADQEEQ_AI_MODEL=gpt-5.6-luna
TADQEEQ_AI_MAX_REQUESTS_PER_HOUR=30
```

`SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` must also be available server-side. The current deployment normally provides them automatically.

The AI request uses the OpenAI Responses API with `store: false` and structured JSON output.

## Development

```sh
git clone <repository-url>
cd tadqeeq
bun install
bun run dev
```

Run checks:

```sh
bun test
bun run build
```
