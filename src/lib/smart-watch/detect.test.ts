import { describe, expect, test } from "bun:test";

import type { BranchRow } from "../analysis/types";
import type { StoredPeriod } from "../periods";
import { branchKey, detectAnomalies, earlierPeriods, median } from "./detect";

function branch(name: string, sales: number, charges: Partial<BranchRow> = {}): BranchRow {
  const commission = charges.commission ?? sales * 0.16;
  return {
    branch: name,
    branchId: name.toLowerCase(),
    netSales: sales,
    grossSales: sales * 1.15,
    commission,
    bankFeeSuccess: sales * 0.02,
    rdfCampaigns: sales * 0.01,
    compensation: 0,
    totalCharges: commission + sales * 0.03,
    ...charges,
  } as BranchRow;
}

let counter = 0;
function period(start: string, end: string, branches: BranchRow[], platform: StoredPeriod["platform"] = "hungerstation"): StoredPeriod {
  counter += 1;
  return {
    id: "p" + counter,
    label: start,
    platform,
    period_start: start,
    period_end: end,
    created_at: end + "T12:00:00Z",
    engine_version: "test",
    format_ids: [],
    summary: {} as StoredPeriod["summary"],
    branches,
    daily: [],
    invoice: {} as StoredPeriod["invoice"],
  };
}

const steady = (start: string, end: string, malqaCommission = 0.16) =>
  period(start, end, [
    branch("Malqa", 40_000, { commission: 40_000 * malqaCommission }),
    branch("Olaya", 30_000),
    branch("Yasmin", 25_000),
  ]);

describe("smart watch", () => {
  test("median handles odd, even and empty lists", () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBe(0);
  });

  test("branch key prefers the platform ID and falls back to a normalised name", () => {
    expect(branchKey({ branch: "Malqa", branchId: "123" })).toBe("id:123");
    expect(branchKey({ branch: "  Al  Malqa ", branchId: "" })).toBe("name:al malqa");
  });

  test("history uses only earlier periods of the same platform", () => {
    const june = steady("2026-06-01", "2026-06-30");
    const july = steady("2026-07-01", "2026-07-31");
    const keetaJune = period("2026-06-01", "2026-06-30", [], "keeta");
    const september = steady("2026-09-01", "2026-09-30");
    const august = steady("2026-08-01", "2026-08-31");
    expect(earlierPeriods(august, [june, july, keetaJune, september, august]).map((p) => p.id)).toEqual([july.id, june.id]);
  });

  test("a commission jump against the branch's own history is flagged with its SAR impact", () => {
    const history = [steady("2026-05-01", "2026-05-31"), steady("2026-06-01", "2026-06-30"), steady("2026-07-01", "2026-07-31")];
    const august = steady("2026-08-01", "2026-08-31", 0.21);
    const report = detectAnomalies(august, [...history, august]);
    expect(report.historyPeriods).toBe(3);
    expect(report.alerts).toHaveLength(1);
    const [alert] = report.alerts;
    expect(alert).toMatchObject({ branch: "Malqa", metric: "commission", basis: "history", samples: 3 });
    expect(alert!.rate).toBeCloseTo(0.21, 6);
    expect(alert!.typical).toBeCloseTo(0.16, 6);
    expect(alert!.impact).toBeCloseTo(2_000, 2);
  });

  test("the total is not repeated when one of its parts is already flagged", () => {
    const history = [steady("2026-06-01", "2026-06-30"), steady("2026-07-01", "2026-07-31")];
    const august = period("2026-08-01", "2026-08-31", [
      branch("Malqa", 40_000, { commission: 40_000 * 0.21, totalCharges: 40_000 * 0.24 }),
      branch("Olaya", 30_000),
    ]);
    const metrics = detectAnomalies(august, [...history, august]).alerts.map((alert) => alert.metric);
    expect(metrics).toEqual(["commission"]);
  });

  test("normal month-to-month noise is not flagged", () => {
    const history = [steady("2026-06-01", "2026-06-30", 0.158), steady("2026-07-01", "2026-07-31", 0.162)];
    const august = steady("2026-08-01", "2026-08-31", 0.165);
    expect(detectAnomalies(august, [...history, august]).alerts).toEqual([]);
  });

  test("without history, a branch far above its sister branches is flagged against peers", () => {
    const august = period("2026-08-01", "2026-08-31", [
      branch("Malqa", 40_000, { compensation: 40_000 * 0.03 }),
      branch("Olaya", 30_000),
      branch("Yasmin", 25_000),
      branch("Narjis", 20_000),
      branch("Rabwa", 22_000),
    ]);
    const report = detectAnomalies(august, [august]);
    expect(report.historyPeriods).toBe(0);
    expect(report.alerts.map((alert) => [alert.branch, alert.metric, alert.basis])).toEqual([["Malqa", "compensation", "peers"]]);
  });

  test("with too few peers and no history nothing is judged", () => {
    const august = period("2026-08-01", "2026-08-31", [branch("Malqa", 40_000, { commission: 40_000 * 0.3 }), branch("Olaya", 30_000)]);
    expect(detectAnomalies(august, [august]).alerts).toEqual([]);
  });

  test("small branches and small SAR differences are ignored", () => {
    const history = [steady("2026-06-01", "2026-06-30"), steady("2026-07-01", "2026-07-31")];
    const tiny = (commission: number) => branch("Kiosk", 400, { commission });
    const withKiosk = (p: StoredPeriod, commission: number) => ({ ...p, branches: [...p.branches, tiny(commission)] });
    const august = withKiosk(steady("2026-08-01", "2026-08-31"), 400 * 0.5);
    expect(detectAnomalies(august, [...history.map((p) => withKiosk(p, 64)), august]).alerts).toEqual([]);
  });

  test("a level marked as expected is muted, but a further jump alerts again", () => {
    const history = [steady("2026-06-01", "2026-06-30"), steady("2026-07-01", "2026-07-31")];
    const accepted = [{ platform: "hungerstation" as const, branchKey: "id:malqa", metric: "commission" as const, acceptedRate: 0.21 }];

    const august = steady("2026-08-01", "2026-08-31", 0.21);
    const mutedReport = detectAnomalies(august, [...history, august], accepted);
    expect(mutedReport.alerts).toEqual([]);
    expect(mutedReport.muted).toBe(1);

    const higher = steady("2026-08-01", "2026-08-31", 0.26);
    expect(detectAnomalies(higher, [...history, higher], accepted).alerts.map((a) => a.metric)).toEqual(["commission"]);

    const keetaOnly = [{ ...accepted[0]!, platform: "keeta" as const }];
    expect(detectAnomalies(august, [...history, august], keetaOnly).alerts).toHaveLength(1);
  });

  test("reads Keeta and Jahez charges from their own fields", () => {
    const keeta = (rate: number) =>
      period("2026-08-01", "2026-08-31", [
        { branch: "Malqa", branchId: "k1", grossSales: 46_000, keetaSalesExVat: 40_000, keetaCommissionExVat: 40_000 * 0.15, commission: 0, keetaBankFeesExVat: 40_000 * rate } as BranchRow,
      ], "keeta");
    const keetaHistory = [keeta(0.025), keeta(0.025)].map((p, i) => ({ ...p, id: "kh" + i, period_start: `2026-0${6 + i}-01`, period_end: `2026-0${6 + i}-30` }));
    const keetaNow = keeta(0.05);
    expect(detectAnomalies(keetaNow, [...keetaHistory, keetaNow]).alerts.map((a) => a.metric)).toEqual(["payment_fees"]);

    const jahez = (offer: number) =>
      period("2026-08-01", "2026-08-31", [
        { branch: "Malqa", branchId: "j1", grossSales: 50_000, jahezCommissionInclVat: 9_000, commission: 0, jahezDeliveryOfferInclVat: offer } as BranchRow,
      ], "jahez");
    const jahezHistory = [jahez(1_000), jahez(1_100)].map((p, i) => ({ ...p, id: "jh" + i, period_start: `2026-0${6 + i}-01`, period_end: `2026-0${6 + i}-30` }));
    const jahezNow = jahez(3_000);
    const [alert] = detectAnomalies(jahezNow, [...jahezHistory, jahezNow]).alerts;
    expect(alert?.metric).toBe("delivery");
    expect(alert!.impact).toBeCloseTo(1_950, 2);
  });
});
