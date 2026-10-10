import { beforeEach, describe, expect, mock, test } from "bun:test";

/** The scheduled job with the database and email service replaced by in-memory fakes. */
type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};
const updates: { id: unknown; patch: Row }[] = [];
const sent: { to: string; key?: string }[] = [];
let failFor: string | null = null;

function query(table: string) {
  const filters: [string, unknown][] = [];
  const api = {
    select: () => api,
    eq: (column: string, value: unknown) => {
      filters.push([column, value]);
      return api;
    },
    is: () => api,
    order: () => api,
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    update: (patch: Row) => ({
      eq: async (_: string, id: unknown) => {
        updates.push({ id, patch });
        return { error: null };
      },
    }),
    then: (resolve: (value: { data: Row[]; error: null }) => unknown) => resolve({ data: rows(), error: null }),
  };
  const rows = () => (tables[table] ?? []).filter((row) => filters.every(([column, value]) => row[column] === value));
  return api;
}

mock.module("@/integrations/supabase/client.server", () => ({ supabaseAdmin: { from: query } }));
mock.module("./email-templates/send-email", () => ({
  sendTemplateEmail: async (_template: string, to: string, options: { idempotencyKey?: string }) => {
    if (to === failFor) throw new Error("mail service down");
    sent.push({ to, key: options.idempotencyKey });
    return { sent: true };
  },
}));
mock.module("./server-auth.server", () => ({ requireWorkspacePermission: async () => ({}) }));

const { runDueReportSchedules } = await import("./report-schedules.server");

const schedule = (over: Row): Row => ({
  id: "s",
  workspace_id: "w1",
  name: "Monthly",
  frequency: "monthly",
  day_of_month: 3,
  weekday: null,
  recipients: ["cfo@example.com"],
  active: true,
  last_sent_at: null,
  last_period_id: null,
  last_error: null,
  created_at: "2026-09-01T00:00:00Z",
  ...over,
});

beforeEach(() => {
  updates.length = 0;
  sent.length = 0;
  failFor = null;
  tables["workspaces"] = [{ id: "w1", name: "مطاعم المذاق" }];
  tables["periods"] = [
    { id: "p1", workspace_id: "w1", label: "HS Aug", platform: "hungerstation", period_end: "2026-08-31", created_at: "2026-09-02T00:00:00Z", summary: { grossSales: 1000, orders: 10, totalCharges: 200, commission: 150, commissionPct: 0.15 } },
    { id: "p2", workspace_id: "w1", label: "HS Sep", platform: "hungerstation", period_end: "2026-09-30", created_at: "2026-10-02T00:00:00Z", summary: { grossSales: 1200, orders: 12, totalCharges: 260, commission: 180, commissionPct: 0.15 } },
  ];
});

describe("runDueReportSchedules", () => {
  test("sends due schedules to each recipient and records the send", async () => {
    tables["report_schedules"] = [
      schedule({ id: "due", recipients: ["cfo@example.com", "ops@example.com"] }),
      schedule({ id: "not-yet", day_of_month: 20 }),
      schedule({ id: "paused", active: false }),
    ];
    const result = await runDueReportSchedules(new Date("2026-10-05T06:00:00Z"));
    expect(result).toEqual({ checked: 2, sent: 2, failed: 0 });
    expect(sent.map((s) => s.to)).toEqual(["cfo@example.com", "ops@example.com"]);
    expect(sent[0]!.key).toBe("report-due-2026-10-05-cfo@example.com");
    expect(updates).toEqual([{ id: "due", patch: { last_sent_at: "2026-10-05T06:00:00.000Z", last_period_id: "p2", last_error: null } }]);
  });

  test("on upload sends once for the newest period", async () => {
    tables["report_schedules"] = [schedule({ id: "up", frequency: "on_upload", day_of_month: null })];
    await runDueReportSchedules(new Date("2026-10-05T06:00:00Z"));
    expect(sent).toHaveLength(1);
    expect(sent[0]!.key).toBe("report-up-period-p2-cfo@example.com");
    tables["report_schedules"] = [schedule({ id: "up", frequency: "on_upload", day_of_month: null, last_period_id: "p2" })];
    sent.length = 0;
    await runDueReportSchedules(new Date("2026-10-05T07:00:00Z"));
    expect(sent).toHaveLength(0);
  });

  test("a failing schedule records its error and the others still send", async () => {
    tables["report_schedules"] = [schedule({ id: "bad", recipients: ["down@example.com"] }), schedule({ id: "good" })];
    failFor = "down@example.com";
    const result = await runDueReportSchedules(new Date("2026-10-05T06:00:00Z"));
    expect(result).toEqual({ checked: 2, sent: 1, failed: 1 });
    expect(updates.find((u) => u.id === "bad")?.patch).toEqual({ last_error: "mail service down" });
    expect(updates.find((u) => u.id === "good")?.patch["last_error"]).toBeNull();
  });
});
