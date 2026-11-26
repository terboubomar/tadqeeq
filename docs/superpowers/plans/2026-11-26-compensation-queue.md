# «استرداد» queue-first overview Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the «استرداد» overview into a setup checklist (empty workspace) or a headline + stage strip + action queue, with a supervisor strip for owners/admins, reports below.

**Architecture:** A pure helper builds the queue from the cases the page already loads; the page renders it and keeps the existing overview figures as a reports section. No server or data change.

**Tech Stack:** TanStack Start, React, Tailwind tokens, lucide-react, bun test.

**Spec:** `docs/superpowers/specs/2026-11-26-compensation-queue-design.md`

## Global Constraints
- Local only: no commit, push or merge (user's instruction overrides the plan template's commit steps).
- No accounting-engine files, no server/data changes, no new libraries; Tadqeeq tokens, fonts, RTL.
- Supervisor = `can("users.manage")`.

## Review Focus
- A case with an unknown status string: ignored by every count, never crashes.
- Cases with amount 0 or negative: counted, sorted after positive amounts, money shows 0.
- Workspace with Telegram not readable (`telegram.read` false): checklist step 1 shows as not checkable, not as done.
- 100+ queued rows: queue shows the first 8 and a link to the full cases list.
- Status history missing timestamps: "this week" counts skip that case.

---

### Task 1: Queue helper

**Files:**
- Create: `src/lib/compensation-queue.ts`
- Test: `src/lib/compensation-queue.test.ts`

**Interfaces:**
- Consumes: `OverviewCase`, `caseFollowUp`, `statusEnteredAt`, `caseRecoveredAmount` from `src/lib/compensation-overview.ts`.
- Produces:
  - `type QueueKind = "send" | "missing_evidence" | "follow_up" | "rejected"`
  - `interface QueueRow { id: string; orderNumber: string; platform: string; branchName: string | null; amount: number; kind: QueueKind; label: string }`
  - `interface CompensationQueue { waitingAmount: number; waitingCount: number; stages: { draft: number; ready: number; sent: number; recovered: number }; rows: QueueRow[]; supervisor: { late: number; missingEvidence: number; sentThisWeek: number; recoveredThisWeek: number; recoveredThisWeekAmount: number } }`
  - `buildCompensationQueue(cases: Array<OverviewCase & { evidenceId?: string | null }>, now?: Date): CompensationQueue`

- [ ] **Step 1: Write failing tests** `waiting excludes recovered/rejected/closed`, `stages count submitted+accepted as sent`, `rows: ready by amount desc, then drafts without evidence, then follow-ups oldest first, then rejected`, `supervisor counts late follow-ups, missing evidence and this week's sent/recovered`, `unknown status and missing history are ignored`.
- [ ] **Step 2:** `bun test src/lib/compensation-queue.test.ts` → FAIL (module missing).
- [ ] **Step 3:** Implement `buildCompensationQueue`. Waiting = draft, ready, submitted, accepted. A ready case is a `send` row (label from `caseFollowUp` when late, else «جاهزة للإرسال»); a draft without `evidenceId` is `missing_evidence` («بلا دليل»); submitted/accepted with a `caseFollowUp` are `follow_up`; rejected are `rejected`.
- [ ] **Step 4:** Tests pass.

### Task 2: Page

**Files:**
- Modify: `src/routes/compensation/index.tsx`

**Interfaces:**
- Consumes: `buildCompensationQueue`, existing `buildCompensationOverview`, `useCompensationCases`, `useTelegramConnections`, `useWorkspaceAccess`.

- [ ] **Step 1:** Empty workspace (0 cases): setup checklist — «اربط قروب فرع على Telegram» (done when `linkedBranches > 0`), «ارفع ملف طلبات الشهر» (link to /import), «أول دليل من فرع» (link to /compensation/evidence) — one primary button for the first unfinished step.
- [ ] **Step 2:** With cases: supervisor strip (only `can("users.manage")`), headline `waitingAmount`/`waitingCount`, stage strip linking to `/compensation/cases?status=…`, queue (first 8 rows, one action link each, «كل الحالات» link), then «التقارير»: existing range/platform filters, KPIs, monthly chart, by platform, top branches.
- [ ] **Step 3:** Typecheck, lint, tests, build; screenshots at desktop and phone with an empty workspace and with sample cases.
