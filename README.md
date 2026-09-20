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
