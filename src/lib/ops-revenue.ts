/**
 * Monthly recurring revenue movements for the ops overview, rebuilt from the ops audit log.
 *
 * Subscriptions are one row that is edited in place, so the only history is the log: every
 * `subscription.create` / `subscription.update` event carries the status, price and cycle that were saved
 * (and the add-ons from when they started being logged), and `client.delete` ends a client. A client's MRR at
 * a month's end is the sum of its subscriptions' latest saved values then; movements are measured per client,
 * so moving a client to a new subscription row is not counted as churn plus new. Months before the first
 * logged event are incomplete.
 */

/** Statuses that count towards recurring revenue (the same as ARR on the overview). */
const BILLABLE = new Set(["active", "overdue"]);

export interface RevenueEvent {
  workspaceId: string;
  /** The subscription row; older create events did not record it. */
  subscriptionId?: string | null;
  /** ISO time of the log entry. */
  at: string;
  kind: "subscription" | "deleted";
  status?: string;
  price?: number;
  cycle?: string;
  /** Yearly value of the add-ons saved with this event; undefined when the event did not record them. */
  addonsYearly?: number;
}

export interface RevenueMonth {
  /** "YYYY-MM". */
  month: string;
  /** MRR at the month's end. */
  mrr: number;
  newMrr: number;
  expansion: number;
  /** Positive amount lost to downgrades. */
  contraction: number;
  /** Positive amount lost to cancelled, suspended or deleted clients. */
  churned: number;
}

interface SubscriptionState {
  status: string;
  price: number;
  cycle: string;
  addonsYearly: number;
}

function monthlyValue(state: SubscriptionState | undefined): number {
  if (!state || !BILLABLE.has(state.status)) return 0;
  const yearly = state.cycle === "yearly" ? state.price : state.price * 12;
  return (yearly + state.addonsYearly) / 12;
}

/** Subscription states by key; a create logged without its id is kept under the client until its id shows up. */
type States = Map<string, SubscriptionState & { workspaceId: string }>;

function apply(states: States, deleted: Set<string>, event: RevenueEvent) {
  if (event.kind === "deleted") {
    deleted.add(event.workspaceId);
    return;
  }
  deleted.delete(event.workspaceId);
  const pendingKey = `client:${event.workspaceId}`;
  const key = event.subscriptionId ? `sub:${event.subscriptionId}` : pendingKey;
  let previous = states.get(key);
  // The first update that names a subscription takes over a create that was logged without one.
  if (!previous && key !== pendingKey && states.has(pendingKey)) {
    previous = states.get(pendingKey);
    states.delete(pendingKey);
  }
  states.set(key, {
    workspaceId: event.workspaceId,
    status: event.status ?? previous?.status ?? "active",
    price: Number.isFinite(event.price) ? Number(event.price) : previous?.price ?? 0,
    cycle: event.cycle ?? previous?.cycle ?? "monthly",
    // Older events did not record add-ons, and a save without the add-on field keeps the stored ones.
    addonsYearly: event.addonsYearly ?? previous?.addonsYearly ?? 0,
  });
}

/** End of a "YYYY-MM" month as an exclusive bound: the first instant of the next month, UTC. */
function monthEnd(month: string): number {
  const [year, m] = month.split("-").map(Number);
  return Date.UTC(year!, m!, 1);
}

/**
 * Movements for each of `months` (oldest first, "YYYY-MM"). Each client's MRR at the end of a month is compared
 * with its MRR at the end of the month before (or before the first month for the first one).
 */
export function buildRevenueMovements(events: RevenueEvent[], months: string[]): RevenueMonth[] {
  // Compare times, not strings: the database writes "+00:00" offsets, the month bounds use "Z".
  const sorted = events
    .map((event) => ({ event, time: Date.parse(event.at) }))
    .filter((item) => Number.isFinite(item.time))
    .sort((a, b) => a.time - b.time);
  const states: States = new Map();
  const deleted = new Set<string>();
  let cursor = 0;
  const advanceTo = (bound: number) => {
    while (cursor < sorted.length && sorted[cursor]!.time < bound) apply(states, deleted, sorted[cursor++]!.event);
  };
  /** MRR per client at this point (deleted clients count zero). */
  const snapshot = () => {
    const byClient = new Map<string, number>();
    for (const state of states.values()) {
      const value = deleted.has(state.workspaceId) ? 0 : monthlyValue(state);
      byClient.set(state.workspaceId, (byClient.get(state.workspaceId) ?? 0) + value);
    }
    return byClient;
  };

  if (!months.length) return [];
  const [firstYear, firstMonth] = months[0]!.split("-").map(Number);
  advanceTo(Date.UTC(firstYear!, firstMonth! - 1, 1));
  let before = snapshot();

  return months.map((month) => {
    advanceTo(monthEnd(month));
    const after = snapshot();
    const row: RevenueMonth = { month, mrr: 0, newMrr: 0, expansion: 0, contraction: 0, churned: 0 };
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      const was = before.get(id) ?? 0;
      const now = after.get(id) ?? 0;
      row.mrr += now;
      if (was === 0 && now > 0) row.newMrr += now;
      else if (was > 0 && now === 0) row.churned += was;
      else if (now > was) row.expansion += now - was;
      else if (now < was) row.contraction += was - now;
    }
    before = after;
    return row;
  });
}
