# Operations Dashboard (ops.tadqeeq.app)

A separate staff-only control panel inside the same project, with its own look, own sign-in check, and no links to/from the customer app. Served on its own subdomain.

## Subdomain setup (for you)
At your domain provider add:
- Type **A**, Name **ops**, Value **185.158.133.1**
Then in Project Settings -> Domains -> Connect Domain, enter `ops.tadqeeq.app` (it also gives a TXT verification record to add). Leave `tadqeeq.app` as-is; do not set `ops` as Primary, or everything would redirect to it.

## Sections
1. **Overview** - ARR, MRR, active / pending / suspended clients, new sign-ups, overdue payments, renewals due in 30 days, charts over time.
2. **Clients** - every company: legal/brand name, CR, VAT, contact, logo, branch count, status, plan, users, last activity. Detail page with onboarding steps (move existing «إدارة العملاء» here), notes, activate / suspend.
3. **Subscriptions** - plans (name, price per branch or fixed, monthly/yearly), each client's subscription (start, end, price, discount, status: trial/active/overdue/cancelled). Auto-lock the client workspace when a subscription is suspended.
4. **Payments** - record bank transfers manually (amount, date, reference, receipt file), invoice list per client, outstanding balance.
5. **Usage & activity** - per client: uploads, audits run, AI calls, Telegram evidence, users, last login.
6. **Logs** - audit log of every staff action (who activated, recorded payment, changed plan) plus client workspace events.
7. **Staff** - your ops team with roles: owner, finance, sales, support (each role sees/does only its part).

## Behaviour
- Visiting `ops.tadqeeq.app` shows only the ops panel; visiting `/ops` on the main domain redirects away. Customer app has no link to it.
- Only ops staff can sign in; everyone else sees "no access".
- Customer app's «إدارة العملاء» page is removed from its menu.

## Technical details
- Routes under `src/routes/ops/*` with own layout (no AppShell); host check in layout (`ops.` hostname or preview) otherwise redirect to `/`.
- New tables (GRANTs + RLS, access via SECURITY DEFINER `ops_role()`): `ops_staff (user_id, role enum owner|finance|sales|support)`, `subscription_plans`, `subscriptions (workspace_id, plan_id, price, cycle, starts_on, ends_on, status)`, `payments (workspace_id, subscription_id, amount, paid_on, reference, receipt_path)`, `ops_audit_log`, `client_notes`. Seed current platform admin as owner.
- Server functions `src/lib/ops.functions.ts` + `ops.server.ts`, each verifying staff role; aggregates (ARR = sum of active yearly-normalised prices) computed server-side.
- Private `ops-receipts` storage bucket.
- Subscription status syncs to `workspace_onboarding.status` (suspended/active).
