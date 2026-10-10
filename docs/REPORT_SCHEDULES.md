# Scheduled report emails

Workspaces save schedules on **التقارير › جدولة التقارير** (`/report-schedules`). Each schedule emails a summary of
the latest month with audited periods (sales, orders, platform cost %, commission %, each platform, and the change
against the month before) plus a button to `/trends`. Lovable's email API has no attachments, so Excel stays in the app.

- **Who manages:** `users.manage` (owner, admin) creates, edits, pauses, deletes and "sends now". Anyone with
  `reports.read` sees the schedules. Recipients may be outside the workspace (max 10 per schedule).
- **Timing** (Asia/Riyadh): monthly on day 1-28 (a missed run catches up later the same month), weekly on a weekday,
  or after each new period upload (sent on the next run, not for periods saved before the schedule existed).
- **Table:** `public.report_schedules`, migration `0057_report_schedules.sql`. Apply it before deploying this code.

## Turning on the automatic sends (one-time, in Lovable)

The job is `POST /api/public/cron/report-schedules`. It checks every active schedule and sends the due ones.

1. In Lovable, add a scheduled job (cron) that calls `https://tadqeeq.app/api/public/cron/report-schedules` with
   method `POST`, **hourly** (`0 * * * *`). Hourly keeps "after upload" sends within about an hour.
2. Lovable sends `Authorization: Bearer <LOVABLE_CRON_SECRET>`; the route checks it with
   `authenticateCronRequest` and answers 401 without it.
3. The response is `{ "checked": n, "sent": n, "failed": n }`. A failing schedule records `last_error`, which the
   page shows; the others still send.

Until the cron is set up, schedules can still be sent by hand with **إرسال الآن**.

## Safety

- Each email has an idempotency key (schedule, run date or period, recipient), so a retried run does not send twice.
- The job reads only `id, label, platform, period dates, created_at, summary` of non-superseded periods.
- Nothing here recalculates audit results; figures come from `lib/report-trends` over the stored summaries, with the
  dashboard's platform-cost definition (`lib/reporting-metrics`).
