import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";

import { applyMigration, asUser, createMigratedDatabase } from "../test-support/database";

/** Migration 0037: order-based plans, add-ons on subscriptions, and my_workspace_plan's usage fields. */
const OWNER = "00000000-0000-4000-8000-0000000003a1";
const OTHER = "00000000-0000-4000-8000-0000000003b1";

let db: PGlite;
let ws: string;

beforeAll(async () => {
  db = await createMigratedDatabase({ before: "0037_order_based_plans" });
  // An older plan that already existed before the migration must keep working.
  await db.query("insert into public.subscription_plans (name, price, cycle, features, upload_limit) values ('قديمة', 500, 'monthly', '[\"invoice_audit\"]', 10)");
  await applyMigration(db, "0037_order_based_plans");
  // Re-running is safe and does not duplicate the plans.
  await applyMigration(db, "0037_order_based_plans");

  for (const [id, email] of [[OWNER, "owner@example.com"], [OTHER, "other@example.com"]] as const) {
    await db.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  }
  ws = (await db.query<{ id: string }>("select id from public.workspaces where owner_user_id = $1", [OWNER])).rows[0]!.id;
  for (const orders of [1200, 800]) {
    await db.query("insert into public.periods (workspace_id, user_id, platform, label, summary) values ($1, $2, 'keeta', 'p', $3)", [ws, OWNER, JSON.stringify({ orders })]);
  }
  // A period from last month is not counted.
  await db.query(
    "insert into public.periods (workspace_id, user_id, platform, label, summary, created_at) values ($1, $2, 'keeta', 'old', $3, now() - interval '40 days')",
    [ws, OWNER, JSON.stringify({ orders: 5000 })],
  );
});

afterAll(async () => {
  await db.close();
});

describe("order-based plans", () => {
  test("inserts the five plans once, with prices, limits and core features", async () => {
    const { rows } = await db.query<{ code: string; price: string; price_yearly: string | null; order_limit: number | null; custom_price: boolean; upload_limit: number | null; features: string[] }>(
      "select code, price, price_yearly, order_limit, custom_price, upload_limit, features from public.subscription_plans where code is not null order by sort_order",
    );
    expect(rows.map((r) => [r.code, Number(r.price), r.price_yearly === null ? null : Number(r.price_yearly), r.order_limit, r.custom_price])).toEqual([
      ["start", 299, 2990, 3000, false],
      ["growth", 599, 5990, 10000, false],
      ["scale", 999, 9990, 30000, false],
      ["groups", 1690, 16900, 75000, false],
      ["enterprise", 0, null, null, true],
    ]);
    for (const row of rows) {
      expect(row.upload_limit).toBeNull();
      expect(row.features).toEqual(["invoice_audit", "exceptions", "contracts"]);
    }
    const old = await db.query<{ count: number }>("select count(*)::int as count from public.subscription_plans where name = 'قديمة'");
    expect(old.rows[0]!.count).toBe(1);
  });

  test("anyone can read the active plans with their new fields", async () => {
    const { rows, error } = await asUser<{ code: string; order_limit: number | null }>(db, null, "select code, order_limit from public.subscription_plans where code = 'growth'");
    expect(error).toBeNull();
    expect(rows).toEqual([{ code: "growth", order_limit: 10000 }]);
  });

  test("my_workspace_plan returns the plan, its add-ons, order limit and this month's orders", async () => {
    await db.query(
      "insert into public.subscriptions (workspace_id, plan_id, price, cycle, status, addons) select $1, id, 599, 'monthly', 'active', '[\"compensation_ai\"]' from public.subscription_plans where code = 'growth'",
      [ws],
    );
    const { rows, error } = await asUser<{ plan: Record<string, unknown> }>(db, OWNER, "select public.my_workspace_plan($1) as plan", [ws]);
    expect(error).toBeNull();
    const plan = rows[0]!.plan;
    expect(plan["plan_name"]).toBe("النمو");
    expect(plan["order_limit"]).toBe(10000);
    expect(plan["orders_this_month"]).toBe(2000);
    expect(plan["uploads_this_month"]).toBe(2);
    expect(plan["upload_limit"]).toBeNull();
    expect(plan["addons"]).toEqual(["compensation_ai"]);
  });

  test("another company's member gets nothing", async () => {
    const { rows } = await asUser<{ plan: unknown }>(db, OTHER, "select public.my_workspace_plan($1) as plan", [ws]);
    expect(rows[0]!.plan).toBeNull();
  });
});
