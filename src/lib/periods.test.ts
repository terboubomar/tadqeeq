import { describe, expect, test } from "bun:test";

import {
  DuplicatePeriodError,
  samePeriodRange,
  workflowPatchForRpc,
  type StoredPeriod,
} from "./periods";

function period(
  platform: StoredPeriod["platform"],
  start: string | null,
  end: string | null,
) {
  return {
    platform,
    period_start: start,
    period_end: end,
  } as Pick<StoredPeriod, "platform" | "period_start" | "period_end">;
}

describe("period duplicate identity", () => {
  test("matches only the same platform and exact date range", () => {
    const existing = period("hungerstation", "2026-08-01", "2026-08-31");

    expect(
      samePeriodRange(existing, {
        platform: "hungerstation",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
      }),
    ).toBe(true);

    expect(
      samePeriodRange(existing, {
        platform: "keeta",
        periodStart: "2026-08-01",
        periodEnd: "2026-08-31",
      }),
    ).toBe(false);

    expect(
      samePeriodRange(existing, {
        platform: "hungerstation",
        periodStart: "2026-09-01",
        periodEnd: "2026-09-30",
      }),
    ).toBe(false);
  });

  test("does not claim duplicate identity when the audit range is incomplete", () => {
    expect(
      samePeriodRange(period("jahez", null, null), {
        platform: "jahez",
        periodStart: null,
        periodEnd: null,
      }),
    ).toBe(false);
  });

  test("duplicate error carries the existing period reference for the open action", () => {
    const error = new DuplicatePeriodError({
      existingPeriodId: "period-existing",
      platform: "keeta",
      periodStart: "2026-08-01",
      periodEnd: "2026-08-31",
    });

    expect(error.message).toBe("هذه الفترة محفوظة مسبقاً");
    expect(error.existingPeriodId).toBe("period-existing");
    expect(error.platform).toBe("keeta");
  });
});


describe("exception workflow atomic update contract", () => {
  test("client sends only mutable workflow fields to the RPC", () => {
    const patch = workflowPatchForRpc({
      status: "reviewing",
      note: "راجع المستند",
      recoveredAmount: 125,
      updatedAt: "client-authored-time",
      history: [
        {
          at: "client-authored-time",
          status: "closed",
        },
      ],
    });

    expect(patch).toEqual({
      status: "reviewing",
      note: "راجع المستند",
      recoveredAmount: 125,
    });
  });

  test("migration locks the row and appends history on the targeted exception path", async () => {
    const sql = await Bun.file(
      "drizzle/migrations/0007_exception_workflow_rpc.sql",
    ).text();

    const selectAt = sql.indexOf("SELECT *");
    const lockAt = sql.indexOf("FOR UPDATE");
    const updateAt = sql.indexOf("UPDATE public.periods");

    expect(sql).toContain("SECURITY INVOKER");
    expect(sql).not.toContain("SECURITY DEFINER");
    expect(selectAt).toBeGreaterThan(-1);
    expect(lockAt).toBeGreaterThan(selectAt);
    expect(updateAt).toBeGreaterThan(lockAt);
    expect(sql).toContain("ARRAY['exceptionWorkflow', p_exception_id]");
    expect(sql).toContain("v_history || jsonb_build_array(v_event)");
    expect(sql).toContain("clock_timestamp()");
    expect(sql).toContain("patch_key.key NOT IN ('status', 'note', 'recoveredAmount')");
  });
});
