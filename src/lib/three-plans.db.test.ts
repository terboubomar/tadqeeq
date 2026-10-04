import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";

import { applyMigration, asUser, createMigratedDatabase } from "../test-support/database";

/** Migration 0038: three plans, and monthly orders counted from the latest month of current data. */
const OWNER = "00000000-0000-4000-8000-0000000003c1";

let db: PGlite;
let ws: string;

async function addPeriod(orders: number, periodStart: string | null, superseded = false) {
  await db.query(
    "insert into public.periods (workspace_id, user_id, platform, label, period_start, summary, superseded_at) values ($1, $2, 'keeta', $3, $4, $5, $6)",
    [ws, OWNER, `p-${orders}`, periodStart, JSON.stringify({ orders }), superseded ? new Date().toISOString() : null],
  );
}

async function plan() {
  const { rows, error } = await asUser<{ plan: Record<string, unknown> }>(db, OWNER, "select public.my_workspace_plan($1) as plan", [ws]);
  expect(error).toBeNull();
  return rows[0]!.plan;
}

beforeAll(async () => {
  db = await createMigratedDatabase({ before: "0038_three_plans_monthly_orders" });
  // A client already on a plan that 0038 hides keeps it.
  await db.query("insert into auth.users (id, email) values ($1, 'owner3@example.com')", [OWNER]);
  ws = (await db.query<{ id: string }>("select id from public.workspaces where owner_user_id = $1", [OWNER])).rows[0]!.id;
  await db.query(
    "insert into public.subscriptions (workspace_id, plan_id, price, cycle, status) select $1, id, 999, 'monthly', 'active' from public.subscription_plans where code = 'scale'",
    [ws],
  );
  await applyMigration(db, "0038_three_plans_monthly_orders");
  await applyMigration(db, "0038_three_plans_monthly_orders");
});

afterAll(async () => {
  await db.close();
});

describe("three plans", () => {
  test("shows البداية, النمو and الشاملة, and hides the others", async () => {
    const { rows } = await db.query<{ code: string; name: string; price: string; price_yearly: string; order_limit: number | null; features: string[]; highlighted: boolean }>(
      "select code, name, price, price_yearly, order_limit, features, highlighted from public.subscription_plans where code is not null and active order by sort_order",
    );
    expect(rows.map((r) => [r.code, r.name, Number(r.price), Number(r.price_yearly), r.order_limit, r.highlighted])).toEqual([
      ["start", "البداية", 299, 2990, 15000, false],
      ["growth", "النمو", 499, 4990, 45000, false],
      ["unlimited", "الشاملة", 799, 7990, null, true],
    ]);
    expect(rows[2]!.features).toEqual(["invoice_audit", "exceptions", "contracts", "compensation", "ai"]);
    const hidden = await db.query<{ count: number }>("select count(*)::int as count from public.subscription_plans where code in ('scale','groups','enterprise') and not active");
    expect(hidden.rows[0]!.count).toBe(3);
  });

  test("a client on a hidden plan keeps it", async () => {
    expect((await plan())["plan_name"]).toBe("التوسع");
  });
});

describe("monthly orders", () => {
  test("adds up every platform in the latest month of data, ignoring replaced periods", async () => {
    expect((await plan())["monthly_orders"]).toBe(0);
    await addPeriod(5000, "2026-08-01");
    await addPeriod(6000, "2026-09-01");
    await addPeriod(3000, "2026-09-08");
    await addPeriod(9000, "2026-09-01", true);
    const result = await plan();
    expect(result["monthly_orders"]).toBe(9000);
    expect(result["orders_this_month"]).toBe(9000);
    expect(result["orders_month"]).toBe("2026-09-01");
  });

  test("a period without dates counts in the month it was uploaded", async () => {
    await addPeriod(700, null);
    const month = (await db.query<{ m: string }>("select to_char(date_trunc('month', now() at time zone 'Asia/Riyadh'), 'YYYY-MM-DD') as m")).rows[0]!.m;
    const result = await plan();
    expect(result["orders_month"]).toBe(month);
    expect(result["monthly_orders"]).toBe(700);
  });
});
