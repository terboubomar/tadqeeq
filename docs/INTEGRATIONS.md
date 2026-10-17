# Accounting integrations: setup and operations

Tadqeeq sends the journal entries from «القيود المحاسبية» straight into a client's accounting system. Five systems are
supported. This page is for whoever runs Tadqeeq. The client-facing guide is `/guides/accounting-integrations`, linked
from each card on «التكاملات».

| System | How a client connects | Cost center | Tadqeeq reference goes to |
|---|---|---|---|
| Qoyod | Pastes an API key | Not sent | End of the description |
| Daftra | Pastes site address + API key | Not sent (Daftra's journal API has no cost center field) | End of the description |
| Zoho Books | Signs in with Zoho (OAuth) | Reporting tag option with the same name (any active tag) | `reference_number` |
| Odoo (16+) | Pastes address, login, database (optional on Odoo Online), API key | Analytic account (code or id) | `ref` |
| QuickBooks Online | Signs in with Intuit (OAuth) | Class | `DocNumber` |

Entries are always posted (never drafts). Each branch's entry is sent at most once per period
(`accounting_sync_entries`), so pressing send twice skips what was already sent.

## Server secrets (Lovable project secrets, not Supabase)

| Name | Needed for | Value |
|---|---|---|
| `INTEGRATIONS_ENCRYPTION_KEY` | All five | Random string of at least 32 characters. **Never change it**: saved connections cannot be decrypted with a new value and every client would have to reconnect. |
| `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET` | Zoho Books | From the Zoho API console (Server-based Applications). |
| `ZOHO_REDIRECT_URI` | Optional | Defaults to `https://tadqeeq.app/integrations`. |
| `QUICKBOOKS_CLIENT_ID`, `QUICKBOOKS_CLIENT_SECRET` | QuickBooks | From the Intuit developer app, **Production** keys for real clients. |
| `QUICKBOOKS_ENVIRONMENT` | Testing only | `sandbox` (lowercase) with Development keys. Delete it for Production. |
| `QUICKBOOKS_REDIRECT_URI` | Optional | Defaults to `https://tadqeeq.app/integrations`. |

Names are uppercase. Only `QUICKBOOKS_ENVIRONMENT`'s value is case-sensitive (`sandbox`). Qoyod, Daftra and Odoo need
no Tadqeeq-wide secrets: each client pastes their own key.

## Database migrations (run in the Supabase SQL editor, in order)

| Migration | What it does |
|---|---|
| `0061_accounting_connections` | `accounting_connections` (sealed key per workspace and provider) and `accounting_sync_entries` (what was sent). Server-only: no grants to `anon`/`authenticated`, RLS on, no policies. |
| `0062_daftra_connection` | `site` column; allows `daftra` with a Daftra host. |
| `0063_zoho_connection` | Allows `zoho` with a Zoho API host. |
| `0064_odoo_connection` | Allows `odoo` with a plain public host name. |
| `0065_quickbooks_connection` | Allows `quickbooks` (no site). |

All are additive and re-runnable. Files are in `drizzle/migrations/`.

## Provider setup

### Zoho Books
1. https://api-console.zoho.com → **Server-based Applications**.
2. Homepage `https://tadqeeq.app`, Authorized Redirect URI `https://tadqeeq.app/integrations`.
3. App **Settings** → turn on **Multi-DC**, so `.sa` and other data centers can connect.
4. Put the Client ID and Secret in the secrets above.

Scopes requested: `ZohoBooks.accountants.READ`, `ZohoBooks.accountants.CREATE`, `ZohoBooks.settings.READ`. The
client's **default** Zoho Books organization is used.

Cost centers: Zoho Books has no cost center field, so a branch's cost center is matched (case-insensitive) to an option
name of any active reporting tag (`GET /reportingtags`, `GET /reportingtags/options`, settings.READ scope) and sent as
`tags` on every journal line. The tag must be enabled for Journals in Zoho Books.

### QuickBooks Online
1. https://developer.intuit.com → app → scope **Accounting** (`com.intuit.quickbooks.accounting`).
2. **Settings → Redirect URIs**: add `https://tadqeeq.app/integrations` on **both** the Development and Production
   tabs (they are separate lists).
3. Launch, Disconnect and Connect/Reconnect URLs: all `https://tadqeeq.app/integrations`.
4. Production keys need the app assessment and compliance questionnaire.

Tadqeeq uses one set of keys at a time. Development keys + `QUICKBOOKS_ENVIRONMENT=sandbox` only reach Intuit's test
companies; real clients see "There is no sandbox companies found for the user" until Production keys are in place.
After switching keys, existing connections must be disconnected and connected again.

## How it works (code)

| Piece | File |
|---|---|
| Shared entry shape, code matching, balance check | `src/lib/integrations/sendable.ts` |
| Encryption (AES-256-GCM) and signed OAuth state | `src/lib/integrations/secret-box.server.ts` |
| Store/read connections, send loop, status | `src/lib/integrations/connections.server.ts` |
| HTTP helper, `SyncStop` (stops a send on key/network errors) | `src/lib/integrations/http.server.ts` |
| Per system: payload (pure) + adapter (server) | `qoyod.ts`/`qoyod.server.ts`, `daftra*`, `zoho*`, `odoo*`, `quickbooks*` |
| OAuth start/finish | `zoho-connect.server.ts`, `quickbooks-connect.server.ts` |
| Server functions | `connections.functions.ts` |
| UI | `src/components/integrations/` (`AccountingDialog`, `SendJournalsButton`, `providers.ts`), `src/routes/_authenticated/integrations.tsx` |

Notes worth knowing:
- Credentials are sealed with `INTEGRATIONS_ENCRYPTION_KEY` and never returned to the browser (only the last 4
  characters as a hint).
- Hosts are allow-listed in code and by database checks: Daftra `*.daftra.com`/`*.daftara.com`, Zoho `zohoapis.*`,
  Odoo any public `https` host name (no IPs, ports or local names).
- QuickBooks replaces the refresh token on every use; the new one is saved before anything is posted.
- QuickBooks needs a customer on Accounts Receivable lines and a vendor on Accounts Payable lines. Tadqeeq uses the
  platform (HungerStation, Keeta, Jahez), creating it once if missing (vendor falls back to "<platform> (Vendor)").
- Odoo: JSON-2 for Odoo 19+, JSON-RPC for 16–18 (Odoo removes JSON-RPC in Odoo 22). A draft that fails to post is
  deleted so a retry does not duplicate it. Odoo 19 API keys expire after at most 3 months.
- Sending requires the `contracts.manage` permission; seeing the status needs `reports.read`.

## Troubleshooting

| Message (Arabic, in the app) | Cause | Fix |
|---|---|---|
| «الربط المباشر غير مفعّل بعد: أضف INTEGRATIONS_ENCRYPTION_KEY…» | Secret missing or shorter than 32 characters | Add it (see above) |
| «ربط Zoho Books غير مفعّل بعد…» / «ربط QuickBooks غير مفعّل بعد…» | Client ID/Secret secrets missing | Add them, refresh |
| «الربط المباشر يحتاج تحديث قاعدة البيانات…» | A migration above was not run | Run the missing migration |
| «هذه الحسابات بلا رمز مطابق في …: 1، 2…» | «دليل الحسابات» codes not in the client's chart | Match the codes (QuickBooks: enable account numbers, or leave the code empty to match by name) |
| «مراكز التكلفة هذه بلا …» | Branch cost center has no analytic account (Odoo), Class (QuickBooks) or reporting tag option (Zoho Books) | Create it, or clear the branch's cost center |
| «لا توجد مؤسسة في Zoho Books لهذا الحساب» | Signed in with a Zoho login that has no Books organization | Sign in with the login that owns the books |
| «مفتاح QuickBooks غير صالح…» right after Intuit sign-in | Keys and environment don't match (e.g. Development keys without `QUICKBOOKS_ENVIRONMENT=sandbox`) | Fix the secrets |
| Intuit page: "redirect_uri … not valid" | Redirect URI not on the tab (Development/Production) of the keys in use | Add `https://tadqeeq.app/integrations` there |
