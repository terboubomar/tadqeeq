import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";

import { isPlanFeature, type PublicPlan } from "./plans";

const num = (value: unknown): number | null => (typeof value === "number" ? value : typeof value === "string" && value !== "" && Number.isFinite(Number(value)) ? Number(value) : null);

/** Active plans as the public pricing shows them (also read by /pricing.md and /llms-full.txt). */
export async function loadPublicPlans(): Promise<PublicPlan[]> {
  const url = process.env["SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return [];
  const sb = createClient(url, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data } = await sb
    .from("subscription_plans")
    // All columns: order-based fields exist only once migration 0037 has run.
    .select("*")
    .eq("active", true)
    .order("sort_order");
  return ((data ?? []) as Array<Record<string, unknown>>).map((r) => ({
    id: String(r["id"]),
    name: String(r["name"]),
    price: Number(r["price"]),
    cycle: r["cycle"] === "yearly" ? "yearly" : "monthly",
    features: Array.isArray(r["features"]) ? r["features"].filter(isPlanFeature) : [],
    uploadLimit: typeof r["upload_limit"] === "number" ? r["upload_limit"] : null,
    description: (r["description"] as string | null) ?? null,
    highlighted: r["highlighted"] === true,
    code: typeof r["code"] === "string" ? r["code"] : null,
    orderLimit: num(r["order_limit"]),
    priceYearly: num(r["price_yearly"]),
    customPrice: r["custom_price"] === true,
    workspaceLimit: num(r["workspace_limit"]),
  }));
}

export const listPublicPlans = createServerFn({ method: "GET" }).handler(loadPublicPlans);
