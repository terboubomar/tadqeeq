# «استرداد» overview: queue first, supervisor strip on top (local design, not shipped)

## Intent
The person who opens «استرداد» every day is an employee the owner supervises. They need to know what to do next;
the owner needs to see that nothing is late or forgotten, then that money is coming back. Every live account has
0 cases today, so the empty first screen is the most-seen screen.

## Goals
- Empty workspace: a 3-step setup checklist (link a branch Telegram group, upload an orders file, first evidence)
  with one button for the next step, instead of zero KPIs and empty charts.
- With cases: one headline (amount waiting to be recovered, case count), a clickable stage strip
  (مسودة ▸ جاهزة ▸ مرسلة ▸ مسترَدة with counts), then one prioritised queue: each row one primary action.
- Supervisor strip (users who can manage users: owner/admin) above the queue: late (follow-ups) and missing
  evidence first, then this week's sent/recovered.
- Monthly chart, by-platform and top branches move below the queue as «التقارير».

## Non-goals / anti-goals
- No change to data, server functions, permissions, statuses or amounts; no accounting-engine files.
- No new libraries. Tadqeeq tokens, fonts, RTL. Other «استرداد» pages unchanged.
- Not shipped: no commit, push or merge; screenshots only.

## Approaches
1. Rework the overview page in place, reusing buildCompensationOverview and the cases query (picked: smallest,
   reuses tested data).
2. Merge every «استرداد» page into one screen (bigger, risks the cases/evidence flows).
3. Separate supervisor and employee pages (more navigation for the owner).

## Decisions
- Supervisor = can("users.manage"); everyone else sees the employee view.
- Queue order: ready to send (highest amount first), then follow-ups (oldest first), then rejected.
- Row actions link to the existing cases page/side panel (?status=, case id) rather than new mutations.
- Missing evidence = open case (draft/ready) with no evidenceId; counted in a small pure helper with tests.
- "This week" = cases whose status history entered submitted / recovered in the last 7 days.

## Left to the builder
Exact spacing, copy polish, icons from the existing lucide set.
