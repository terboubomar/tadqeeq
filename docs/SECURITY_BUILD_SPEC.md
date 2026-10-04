# Security build spec

Review date: 2026-10-04 · Scope: the whole app on `main` (`2a5fffd`): client app, server functions, ops console, MCP, webhooks, database migrations 0000–0041, storage.

How to use this file: work through the phases in order. Each item has the problem, the fix, and how we know it is done. Tick the box in the PR that closes it. Items marked **verify** are settings outside the code (Supabase / Lovable dashboard).

## Summary

The core access model is solid. No cross-company data leak was found. The open items are one real redirect hole, missing browser security headers, ops accounts protected by password only, and several hardening items.

| ID | Severity | Item | Phase |
|---|---|---|---|
| H1 | High | ~~Open redirect after sign-in (`/auth?next=/\evil.com`)~~ ✅ fixed | 1 |
| M1 | Medium | No browser security headers (CSP, clickjacking, HSTS) (✅ headers live; CSP in report-only, enforce after a clean week) | 2 |
| M2 | Medium | Ops console: no two-step sign-in; reachable on preview hosts (✅ two-step sign-in built; host limit after `ops.tadqeeq.app` is live) | 3 |
| M3 | Medium | ~~Payment receipts accept any file type; SVG logos allowed~~ ✅ fixed | 1 |
| M4 | Medium | ~~Plan limits enforced in the app server only, not the database~~ ✅ fixed (migration 0042) | 4 |
| L1 | Low | ~~CSV export formula injection~~ ✅ fixed | 1 |
| L2 | Low | ~~No throttle on plan, reactivation and MCP audit requests~~ ✅ fixed (migration 0043) | 5 |
| L3 | Low | ~~Uploaders can write `periods` rows directly through the API~~ ✅ fixed (migration 0042) | 4 |
| L4 | Low | ~~`ensure_my_workspace` creates workspaces for ops staff and removed members~~ ✅ fixed (migration 0043) | 5 |
| L5 | Low | Sign-up password minimum is 6 characters (✅ code fixed; Supabase setting to verify) | 1 + verify |
| L6 | Low | ~~No dependency vulnerability scanning in CI~~ ✅ fixed (`dependency-audit` CI job) | 5 |
| V1–V5 | Verify | Dashboard settings to confirm | any time |

## What is already right (keep it)

- Every server function checks the signed-in user and the permission it needs, either in the handler or the first line of the server module (all 17 `*.functions.ts` files checked).
- Row-level security is on for every table created in migrations (all tables checked). Company isolation runs through `private.has_workspace_permission`, and the two branch-limited roles (`compensation`, `branch_manager`) cannot read invoice periods at all.
- The Telegram webhook checks its secret with a constant-time compare; evidence media checks permission and reads with the user's own client.
- All `SECURITY DEFINER` functions set `search_path = ''`.
- Migrations are checksummed and append-only (`docs/MIGRATIONS.md`).
- The MCP runs every query as the signed-in user, and access checks plan and suspension (`mcp_access`).
- Tadqeeq AI has an hourly limit per user; no service-role key or secret is exposed to the browser (only `VITE_SUPABASE_URL`, the publishable key, the project id and an AI on/off flag).

---

## Phase 1: quick fixes (one PR) — ✅ done

Built in `src/lib/redirects.ts` (`safeNextPath`), `src/lib/file-sniff.ts` (`sniffFile`) and `csvSafeText` in `src/lib/export.ts`, each with tests. Sign-up asks for 8+ characters; sign-in still accepts existing shorter passwords.

### H1 · Open redirect after sign-in — High

**Problem.** `src/routes/auth.tsx` accepts `?next=` when it starts with `/` and not `//`. Browsers treat `\` like `/`, so `/\evil.com` passes the check and `window.location.assign` sends the user to `https://evil.com` right after they sign in. A phishing email can use a real `tadqeeq.app` link to land users on a fake page that asks them to "sign in again".

**Fix.**
- Add `safeNextPath(raw: unknown): string | undefined` in `src/lib/redirects.ts`. Resolve with `new URL(raw, location.origin)`, accept only when the origin is unchanged, and return `pathname + search + hash`. Reject backslashes and control characters outright.
- Use it in `auth.tsx` `validateSearch`, and when building the OAuth `redirect_uri`.
- `_authenticated/route.tsx` already passes `location.href`, which is always a same-origin path, so nothing changes there.

**Done when.** Unit tests reject `//x`, `/\x`, `/\/x`, `\x`, `https://x`, `javascript:x` and `/%5C%5Cx`, and accept `/import?platform=keeta&mcp=<uuid>`.

### M3 · Receipt and logo uploads trust the browser's file type — Medium

**Problem.** `recordPaymentOnServer` (`src/lib/ops.server.ts`) stores a receipt with whatever MIME type the data URL claims, including `text/html`. Ops later opens it through a signed URL, so an HTML or script file would run in the storage origin. Company logos (`onboarding.server.ts`) allow `image/svg+xml`, which can carry scripts.

**Fix.**
- Receipts: allow only `application/pdf`, `image/png`, `image/jpeg` and `image/webp`. Check the file's first bytes (`%PDF`, PNG, JPEG and WEBP signatures) and store with the detected type, not the claimed one.
- Logos: drop SVG, or sanitize it on the server. Dropping it is simpler: PNG, JPEG or WEBP only.

**Done when.** Tests show a `text/html` receipt and an SVG logo are refused, and a real PDF and PNG still save.

### L1 · CSV export formula injection — Low

**Problem.** `exportCsv` (`src/lib/export.ts`) writes cell text as is. Branch names and labels come from platform files. A value that starts with `=`, `+`, `-`, `@`, a tab or a carriage return becomes a live formula when the CSV is opened in Excel.

**Fix.** Prefix such text cells with `'`. Numbers stay numbers. XLSX export is already safe, because `aoa_to_sheet` writes strings as text.

**Done when.** A test exports `=HYPERLINK(...)` and gets `'=HYPERLINK(...)`.

### L5 · Password minimum — Low

**Fix.**
- Code: `minLength={8}` on sign-up, the same as reset and invite.
- **Verify** in Supabase Auth settings:
  - minimum password length 8;
  - leaked-password protection on;
  - "confirm email" on.

---

## Phase 2: browser security headers — ✅ built (CSP report-only)

Built in `src/lib/security-headers.ts`, applied to every response in `src/server.ts`. Violations are posted to `/api/public/csp-report` and logged as `csp_violation`, with only the directive and the origin kept. Framing is blocked for real on the live domains and left open on Lovable preview hosts. **Next step:** after a week with no unexpected `csp_violation` logs, switch `Content-Security-Policy-Report-Only` to `Content-Security-Policy`.

### M1 · No security headers — Medium

**Problem.** Responses carry no `Content-Security-Policy`, `frame-ancestors`/`X-Frame-Options`, `Strict-Transport-Security`, `Referrer-Policy` or `X-Content-Type-Options`; only evidence media sets `nosniff`. This leaves:
- the app and the ops console open to clickjacking (they can be framed by any site);
- no second line of defence if a script injection ever slips in.

**Fix.** Add headers to every HTML and server response in one place: Nitro `routeRules` or a server middleware.

| Header | Value |
|---|---|
| `Strict-Transport-Security` | `max-age=31536000; includeSubDomains` |
| `X-Content-Type-Options` | `nosniff` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `X-Frame-Options` | `DENY`. Also `frame-ancestors 'none'` in the CSP. Keep framing allowed only where Lovable's editor preview needs it (check the preview host first). |
| `Permissions-Policy` | `camera=(), microphone=(), geolocation=()` |
| `Content-Security-Policy` | Report-only first. Start from `default-src 'self'` and add: Supabase (`https://*.supabase.co`, `wss://*.supabase.co`), Google Fonts, the Lovable OAuth and email hosts, and `cdn.sheetjs.com` if it is fetched at runtime. Inline styles (`'unsafe-inline'` for `style-src`) are needed by the chart component. Enforce after one week of clean reports. |

**Done when.** A test fetches `/`, `/auth` and `/ops` from the built server and finds the headers. The CSP has run in report-only mode with no unexpected violations before it is switched to enforcing.

---

## Phase 3: ops console protection — ✅ two-step sign-in built

Every ops server action now requires a session that passed an authenticator code (Supabase `aal2`), via `requireOps` and `opsMfaState` in `src/lib/ops.ts`. The ops console shows `OpsMfa`: a QR code to set up an authenticator app on first sign-in, then the 6-digit code each time. Server secret `OPS_MFA_REQUIRED=false` turns it off as an emergency switch only.

Not done yet, on purpose:
- **Hosts:** previews stay allowed until `ops.tadqeeq.app` is confirmed as the way the team opens ops, so nobody is locked out. The two-step code protects every host meanwhile.
- **Session length:** after the team has used the code for a while, consider asking for it again every 12 hours.

### M2 · Ops sign-in is password-only; ops opens on preview hosts — Medium

**Problem.** Ops staff can suspend or delete clients, record payments and add staff. Those accounts are protected by a password alone. `opsAllowedHost` also opens `/ops` on any `*.lovable.app` and `*.lovableproject.com` host. Access still needs an `ops_staff` row, but every extra host is more surface for phishing and for session theft.

**Fix.**
1. **Two-step sign-in for ops:**
   - Turn on TOTP MFA in Supabase Auth.
   - In `requireOps`, require the session to be at `aal2`; read `aal` from the verified JWT claims.
   - Add an ops screen to enrol an authenticator app on first sign-in, and to verify a code when the session is only `aal1`.
2. **Hosts:** in production, allow ops only on `ops.tadqeeq.app`. Keep localhost for development, and allow previews only behind an explicit environment flag.
3. **Session length:** shorter refresh-token lifetime for ops staff, or re-check MFA after 12 hours.

**Done when.**
- An ops staff session without `aal2` gets "verify your code" from every ops server function.
- The ops route refuses a preview host when the flag is off.
- Tests cover `requireOps` with `aal1` and `aal2` claims.

---

## Phase 4: database hardening — ✅ built (migration 0042)

`private.has_workspace_permission` now combines the unchanged role rules (`private.workspace_role_allows`) with the plan (`private.workspace_feature_allows`):
- the free trial allows only the invoice check;
- otherwise the plan's features, plus compensation and AI with the add-on;
- no plan means everything, as in the app;
- platform admins are never limited.

Every row-level rule and database function that checks a permission picks this up. Members can no longer insert or update `periods` directly; the upload saves them on the server. Covered by `src/lib/plan-limits-db.db.test.ts`; the older isolation tests now model active clients (`activateAllWorkspaces`). Watch query times on large evidence lists after deploy: gated permissions now do two extra indexed lookups per check.

### M4 · Plan limits are enforced in the app server only — Medium

**Problem.**
- Plan features (contracts, compensation, AI) are removed from a user's permissions in `resolvePlanAccess` on the server.
- Row-level security only checks the role (`has_workspace_permission`), not the plan.
- So a trial or lower-plan user who calls the Supabase REST API directly with their own token can read and write plan-locked tables, for example contracts and compensation cases.

It is their own company's data, so this is a billing and feature bypass, not a leak.

**Fix.**
- New migration: add `private.workspace_has_feature(workspace_id, feature)`. It mirrors `my_workspace_plan`: the plan's features plus add-ons; trial means `invoice_audit` only; no subscription means everything allowed, matching the app.
- Add it to the write policies (and to read policies where the feature is paid) of:
  - `platform_contracts`, `contract_*`;
  - `compensation_cases`, `telegram_*`, `recovery_*`;
  - `ai_usage`.

**Done when.**
- PGlite tests: a trial member is refused on direct insert into those tables.
- A الشاملة member or an add-on subscriber is allowed.
- Server import and existing flows still pass.

### L3 · Uploaders can write `periods` directly — Low

**Problem.** A member with `imports.create` can insert or update `periods` rows through the API with any numbers, bypassing the engine. The "numbers come from the engine" promise then depends on trusting every uploader.

**Fix.** Remove direct `INSERT` and `UPDATE` on `periods` (and `audit_source_files`) for `authenticated`. Save through the server only: the upload already runs on the server, so switch `insertPeriod` and re-analysis to a `SECURITY DEFINER` function or to the service role, after the permission check. Keep `SELECT` as is.

**Done when.** A direct REST insert into `periods` as a member fails, and upload, re-analysis and delete still work (existing tests plus a new DB test).

---

## Phase 5: abuse limits and hygiene — ✅ built (migration 0043)

Built:
- **L2.** Plan requests: the same choice again within 10 minutes returns the earlier request, and a different choice (to fix a mistake) is allowed up to 3 requests an hour (`planRequestThrottle` in `src/lib/plans.ts`). Reactivation requests: one an hour, even across suspensions (`requestedWithin` in `src/lib/onboarding.ts`). MCP: at most 30 upload links per company per hour, checked in `mcp_create_audit_request`.
- **L4.** `ensure_my_workspace` skips `ops_staff`, `platform_admins` and users with a `user_removed` audit event. They see "not linked to a company" with a hint to ask for a new invite.
- **L6.** CI job `dependency-audit` runs `scripts/dependency-audit.ts`. It runs `bun audit` and fails on high or critical advisories for versions that production dependencies install (walked through `bun.lock`); dev-only tooling is printed as warnings. `xlsx` stays pinned to the SheetJS 0.20.3 tarball, which `bun audit` cannot check, so review it on every upgrade. The lockfile now uses `js-yaml` 4.3.2 and the `nanoid` under `postcss` 3.3.19 to clear current advisories.

### L2 · No throttle on requests that notify ops — Low

**Problem.**
- `requestPlanOnServer`, `requestReactivationOnServer` and `mcp_create_audit_request` can be called in a loop. That floods `workspace_audit_events`, the ops action centre and `mcp_audit_requests`.
- Requests are scoped to the caller's own workspace, so there is no harm beyond noise and table growth.

**Fix.** Throttle per workspace:
- plan requests: at most 1 per 10 minutes;
- reactivation requests: at most 1 per hour (already de-duplicated while pending);
- MCP audit requests: at most 30 open per hour.

**Done when.** Tests show the second call within the window returns the existing request or a friendly error.

### L4 · Auto-created workspaces for ops staff and removed members — Low

**Problem.** `ensure_my_workspace` (migration 0039) creates a new trial workspace for any signed-in user without a membership. That includes ops staff who open the client app, and members who were removed from a company. Ops sees them as new signups, and a removed member gets a fresh trial.

**Fix.**
- Skip users in `ops_staff` or `platform_admins`.
- For users whose membership was removed, show "you are no longer part of a company" instead of creating a workspace. This needs a `removed` status or audit event check.

**Done when.** DB tests cover an ops staff user, a removed member and a genuinely old account.

### L6 · No dependency scanning — Low

**Fix.**
- Add a CI job that runs `osv-scanner` or `bun audit` against `bun.lock`, failing on high or critical issues in production dependencies.
- Pin `xlsx` (served from the SheetJS CDN) and review it on each upgrade.

**Done when.** The CI job runs on every PR and is green.

---

## Verify in dashboards (no code)

| ID | Where | Check |
|---|---|---|
| V1 | Supabase Storage | Buckets `ops-receipts` and `workspace-logos` are **private**. They are created outside migrations; the others are private by migration. |
| V2 | Supabase Auth → URL configuration | Redirect URLs list only `https://tadqeeq.app/**`, `https://ops.tadqeeq.app/**` and the Lovable preview host you use. No wildcards on other domains. |
| V3 | Supabase Auth | JWT expiry ≤ 1 hour; refresh token rotation on; email confirmation on. |
| V4 | Secrets | `SUPABASE_SERVICE_ROLE_KEY`, `TELEGRAM_WEBHOOK_SECRET`, `LOVABLE_API_KEY` and the AI gateway key are set only as server secrets. Rotate `TELEGRAM_WEBHOOK_SECRET` if it was ever shared. |
| V5 | Ops staff list | Remove anyone who no longer needs access; every owner and finance account uses a unique password (MFA after Phase 3). |

## Out of scope / not found

- No SQL injection: all database access goes through the Supabase client or parameterised SQL.
- No `dangerouslySetInnerHTML` except the chart component's generated CSS variables.
- No secrets in the client bundle.
- MCP OAuth: the token issuer and audience are pinned; cross-origin browser calls are refused by default.
