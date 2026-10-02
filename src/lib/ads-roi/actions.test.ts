import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildAdsRoiActions } from "./actions";
import { analyzeAdsRoi } from "./analysis";
import { readCsvText } from "./read-file";
import { parseHsAdsReport } from "./reports";

const report = parseHsAdsReport(readCsvText(readFileSync(join(import.meta.dir, "fixtures/hungerstation-ads.csv"), "utf8")).rows);
const result = analyzeAdsRoi({
  report,
  settings: { ALPHA: { commissionRate: 0.15, foodCostRate: 0.3 }, BETA: { commissionRate: 0.18, foodCostRate: 0.3 } },
});

test("losing campaigns come first, biggest loss first, then budget shifts, then bids", () => {
  const actions = buildAdsRoiActions(result);
  const kinds = actions.map((action) => action.kind);
  expect(kinds.slice(0, 5)).toEqual(["stop", "stop", "stop", "stop", "stop"]);
  const losses = actions.filter((a) => a.kind === "stop").map((a) => (a.kind === "stop" ? a.campaign.profit : 0));
  expect(losses).toEqual([...losses].sort((a, b) => a - b));
  expect(kinds.indexOf("shift")).toBeGreaterThan(kinds.lastIndexOf("stop"));
  expect(kinds.lastIndexOf("shift")).toBeLessThan(kinds.indexOf("lower_bid"));
});

test("a campaign is never told two things", () => {
  const actions = buildAdsRoiActions(result);
  const keys = actions.flatMap((a) => (a.kind === "shift" ? [a.shift.weak.key] : [a.campaign.key]));
  expect(new Set(keys).size).toBe(keys.length);
});
