# Multi-tenant onboarding for new companies

## What the new customer experiences

1. **Homepage** — redesigned to match the app's look (charcoal/amber, Arabic, RTL): what Tadqeeq does (invoice matching, compensation evidence, AI analyst, branch reports), platforms supported (HungerStation, Keeta, Jahez), and a clear «ابدأ الآن» / «تسجيل الدخول» button. No pricing section until you send it.
2. **Sign up** — creates their own company workspace (already how it works: each new sign-up gets a separate, isolated workspace).
3. **Onboarding form** (shown right after first login, until completed):
   - Company legal name + **brand name**
   - **Commercial Registration** — 10 digits
   - **VAT number** — 15 digits, starts and ends with 3
   - **Contact person** — name, Saudi mobile (+966 5XXXXXXXX), national ID / Iqama (10 digits starting with 1 or 2), email
   - **Number of branches**
   - **Logo** upload (PNG/JPG/SVG, up to 2MB)
   - **Book a meeting with an expert** — pick a date and time slot (Sun–Thu, working hours, Riyadh time) plus an optional note
4. **Locked workspace** — they see their workspace and the side menu, but every page shows a lock screen: «حسابك قيد التفعيل» with their status (details submitted → meeting booked → awaiting payment → onboarding → active) and their meeting time. No uploads, AI, or analysis until activated.

## What you (platform owner) get

- A new **«إدارة العملاء»** page, visible only to you, listing every company with its submitted details, logo, meeting date and status.
- Buttons per company: mark **payment received** (bank transfer), **start onboarding**, **activate** (features open), and **suspend**.
- Your own company and existing users stay fully active — nothing gets locked for you.

## Also fixed now

- Users added from the users page couldn't sign in: Kamal's account was created by the old invitation flow, so it never got the password you typed. Each member now has a **«تعيين كلمة المرور»** button; new users you add get their password immediately.

## Technical details

- New table `workspace_onboarding` (workspace_id PK, legal/brand name, cr_number, vat_number, contact fields, branch_count, logo_path, meeting_at, meeting_note, status enum `pending_details|meeting_booked|awaiting_payment|onboarding|active|suspended`, timestamps). Format validation via triggers + zod.
- Platform-admin role in a separate `platform_admins` table with a security-definer `is_platform_admin()`; admin server fns verify it before using the admin client.
- Existing workspaces backfilled as `active`; the signup trigger inserts `pending_details` for new ones.
- Private `workspace-logos` storage bucket.
- Gating: `_authenticated` layout loads workspace status; non-active workspaces render onboarding form or lock screen instead of page content; all feature server fns also check status via `requireWorkspacePermission` so the lock can't be bypassed.
