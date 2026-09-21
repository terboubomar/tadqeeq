import { afterEach, beforeEach, describe, expect, test } from "bun:test";

import {
  reserveAiUsage,
  runWithAiUsageReservation,
  type AiUsageContext,
} from "./usage.server";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_LIMIT = process.env["TADQEEQ_AI_MAX_REQUESTS_PER_HOUR"];

function context(): AiUsageContext {
  return {
    accessToken: "test-access-token",
    userId: "11111111-1111-1111-1111-111111111111",
    feature: "analyst_chat",
    expectedModel: "gpt-5.6-terra",
    promptVersion: "test-v1",
    periodId: "22222222-2222-2222-2222-222222222222",
    exceptionId: null,
    supabaseUrl: "https://example.supabase.co",
    supabaseKey: "publishable-test-key",
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AI usage reservations", () => {
  beforeEach(() => {
    process.env["TADQEEQ_AI_MAX_REQUESTS_PER_HOUR"] = "30";
  });

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH;
    if (ORIGINAL_LIMIT === undefined) {
      delete process.env["TADQEEQ_AI_MAX_REQUESTS_PER_HOUR"];
    } else {
      process.env["TADQEEQ_AI_MAX_REQUESTS_PER_HOUR"] = ORIGINAL_LIMIT;
    }
  });

  test("reserves before the operation and finalizes a successful call", async () => {
    const requests: Array<{ url: string; method: string; body: unknown }> = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      requests.push({ url, method, body });

      if (url.endsWith("/rest/v1/rpc/reserve_ai_call")) {
        return jsonResponse("33333333-3333-3333-3333-333333333333");
      }

      return jsonResponse([
        { id: "33333333-3333-3333-3333-333333333333" },
      ]);
    }) as typeof fetch;

    const result = await runWithAiUsageReservation(context(), async () => {
      expect(requests).toHaveLength(1);
      return { model: "gpt-5.6-terra", value: "ok" };
    });

    expect(result.value).toBe("ok");
    expect(requests).toHaveLength(2);
    expect(requests[0]?.method).toBe("POST");
    expect(requests[0]?.body).toMatchObject({
      p_feature: "analyst_chat",
      p_limit: 30,
    });
    expect(requests[1]?.method).toBe("PATCH");
    expect(requests[1]?.body).toEqual({
      status: "succeeded",
      model: "gpt-5.6-terra",
    });
  });

  test("marks the reserved call failed when the paid operation throws", async () => {
    const patches: unknown[] = [];

    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/rest/v1/rpc/reserve_ai_call")) {
        return jsonResponse("44444444-4444-4444-4444-444444444444");
      }

      patches.push(init?.body ? JSON.parse(String(init.body)) : null);
      return jsonResponse([
        { id: "44444444-4444-4444-4444-444444444444" },
      ]);
    }) as typeof fetch;

    await expect(
      runWithAiUsageReservation(context(), async () => {
        throw new Error("gateway charged then failed");
      }),
    ).rejects.toThrow("gateway charged then failed");

    expect(patches).toEqual([{ status: "failed" }]);
  });

  test("maps an atomic reservation rejection to the shared hourly-limit error", async () => {
    globalThis.fetch = (async () =>
      jsonResponse(
        {
          code: "P0001",
          message: "AI_RATE_LIMIT_EXCEEDED",
        },
        400,
      )) as typeof fetch;

    await expect(reserveAiUsage(context())).rejects.toThrow(
      "تم الوصول إلى حد استخدام Tadqeeq AI لهذه الساعة.",
    );
  });

  test("50 parallel reservations allow only the 30 slots granted by the RPC", async () => {
    let granted = 0;

    globalThis.fetch = (async () => {
      if (granted >= 30) {
        return jsonResponse(
          {
            code: "P0001",
            message: "AI_RATE_LIMIT_EXCEEDED",
          },
          400,
        );
      }

      granted += 1;
      return jsonResponse(
        "55555555-5555-5555-5555-" + String(granted).padStart(12, "0"),
      );
    }) as typeof fetch;

    const results = await Promise.allSettled(
      Array.from({ length: 50 }, () => reserveAiUsage(context())),
    );

    expect(results.filter((item) => item.status === "fulfilled")).toHaveLength(30);
    expect(results.filter((item) => item.status === "rejected")).toHaveLength(20);
  });

  test("migration serializes count and insert across all features", async () => {
    const sql = await Bun.file(
      "drizzle/migrations/0006_ai_usage_reservations.sql",
    ).text();

    const lockAt = sql.indexOf("pg_advisory_xact_lock");
    const countAt = sql.indexOf("SELECT COUNT(*)");
    const insertAt = sql.indexOf("INSERT INTO public.ai_usage");

    expect(lockAt).toBeGreaterThan(-1);
    expect(countAt).toBeGreaterThan(lockAt);
    expect(insertAt).toBeGreaterThan(countAt);
    expect(sql).not.toContain("feature = p_feature");
    expect(sql).toContain("status IN ('reserved', 'succeeded', 'failed')");
  });
});
