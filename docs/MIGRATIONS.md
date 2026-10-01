# Database migrations

Migrations live in `drizzle/migrations/` and run in the order of `meta/_journal.json`.
Every migration that has reached production is permanent history.

## Never

- Edit a migration that has already been applied. `meta/checksums.json` records each
  file's SHA-256 and `src/lib/migration-checksums.test.ts` fails if one changes.
- Delete, rename, renumber or reorder migrations, or reuse a number.
  (`0001` and `0002` were each used twice before this rule; no number may repeat again.)
- Fix a problem by rewriting an old migration. Fix forward with a new one.

## Always

1. Create the next number: `0033_short_description.sql`, `0034_…`.
2. Add it to `meta/_journal.json` (next `idx`, a later `when`, the file name as `tag`).
3. Add its checksum to `meta/checksums.json`. The test prints the exact line to add.
4. Make it forward-safe and re-runnable: `IF NOT EXISTS`, `CREATE OR REPLACE`,
   `DROP … IF EXISTS` before re-creating a policy or trigger.
5. Prefer additive changes (`ADD COLUMN`, `ADD INDEX`, `ADD POLICY`, `CREATE FUNCTION`) so
   the previous app version keeps working if the deploy is rolled back.
6. If the migration could fail on existing data (a new unique index, a NOT NULL), check the
   data first and skip with a `RAISE NOTICE` that says how to resolve it — see `0032`.
7. Write a header comment: what it fixes, why, and whether it must be applied to production.
8. Cover it with a test. `src/test-support/database.ts` runs every migration on an
   in-process Postgres (PGlite); `createMigratedDatabase({ before: "<tag>" })` stops just
   before a migration so it can be tested against prepared data.

## Applying to production

- Run new migrations in the Supabase SQL editor (or `bun run db:migrate` with
  `DATABASE_URL`) inside a transaction, before deploying the code that needs them.
- Record the applied versions with the deploy (previous and new commit, migration tags).
- Rollback is a redeploy of the previous commit. Do not rely on destructive down-migrations;
  fix forward.

## Do not mix

Financial-rule changes (commission, fees, VAT, tolerances, parsers) are never part of a
schema or hardening migration. They go in their own change with dedicated validation and an
explanation of why a golden financial fixture changed.
