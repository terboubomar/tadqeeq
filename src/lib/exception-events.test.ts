import { describe, expect, test } from "bun:test";

describe("P3-T4 immutable exception workflow", () => {
  test("event ledger is append-only for authenticated clients", async () => {
    const sql = await Bun.file(
      "drizzle/migrations/0013_exception_events.sql",
    ).text();

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.exception_events");
    expect(sql).toContain("REVOKE INSERT, UPDATE, DELETE ON public.exception_events FROM authenticated");
    expect(sql).toContain("INSERT INTO public.exception_events");
    expect(sql).toContain("event_source");
    expect(sql).toContain("'legacy'");
    expect(sql).toContain("'rpc'");
  });

  test("period results are immutable to normal authenticated clients", async () => {
    const sql = await Bun.file(
      "drizzle/migrations/0013_exception_events.sql",
    ).text();

    expect(sql).toContain("REVOKE UPDATE ON public.periods FROM authenticated");
    expect(sql).toContain("SECURITY DEFINER");
    expect(sql).toContain("AND user_id = v_user_id");
  });

  test("workflow RPC still materializes current state for compatibility", async () => {
    const sql = await Bun.file(
      "drizzle/migrations/0013_exception_events.sql",
    ).text();

    expect(sql).toContain("'{exceptionWorkflow}'");
    expect(sql).toContain("v_history || jsonb_build_array(v_event)");
    expect(sql).toContain("UPDATE public.periods");
  });
});
