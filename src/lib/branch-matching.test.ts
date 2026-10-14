import { describe, expect, test } from "bun:test";

import type { RegistryBranch } from "./branch-registry";
import { commonTokens, mergeCandidates, nameSimilarity, nameTokens, suggestMerges, unmatchedBranches } from "./branch-matching";

const row = (id: string, name: string, ids: Partial<Pick<RegistryBranch, "hungerstation_id" | "keeta_id" | "jahez_id">>): RegistryBranch => ({
  id,
  name,
  hungerstation_id: null,
  keeta_id: null,
  jahez_id: null,
  ...ids,
});

/** Names from the September 2026 audits (gap analysis, Gap 5). */
const registry: RegistryBranch[] = [
  row("hs-jam", "PAST - Al Jamiyin", { hungerstation_id: "HS1" }),
  row("hs-uhud", "PAST - Uhud", { hungerstation_id: "HS2" }),
  row("hs-zahra", "PAST - Az Zahra", { hungerstation_id: "HS3" }),
  row("k-jam", "Past - Al-Jami'in", { keeta_id: "K1" }),
  row("k-uhud", "Past - Dammam Uhud (🔥Free Delivery 🏍️🏍️)", { keeta_id: "K2" }),
  row("k-jubail", "Past Al-Jubail (🔥Free Delivery 🔥)", { keeta_id: "K3" }),
  row("j-malqa", "Al Malqa", { jahez_id: "J1" }),
  row("k-malqa", "Past Al Malqa Riyadh (🔥Free Delivery 🔥)", { keeta_id: "K4" }),
];

describe("nameTokens", () => {
  test("drops emoji, promo text and punctuation", () => {
    expect(nameTokens("Past - Dammam Uhud (🔥Free Delivery 🏍️🏍️)")).toEqual(["past", "dammam", "uhud"]);
    expect(nameTokens("Past - Al-Jami'in")).toEqual(["past", "al", "jamiin"]);
  });
});

describe("nameSimilarity", () => {
  const common = commonTokens(registry.map((r) => r.name));
  test("the brand word is common to most names and ignored", () => {
    expect(common.has("past")).toBe(true);
  });
  test("spelling variants of the same branch score high", () => {
    expect(nameSimilarity("PAST - Al Jamiyin", "Past - Al-Jami'in", common)).toBeGreaterThanOrEqual(0.72);
    expect(nameSimilarity("PAST - Uhud", "Past - Dammam Uhud (🔥Free Delivery 🏍️🏍️)", common)).toBeGreaterThanOrEqual(0.72);
    expect(nameSimilarity("Al Malqa", "Past Al Malqa Riyadh (🔥Free Delivery 🔥)", common)).toBeGreaterThanOrEqual(0.72);
  });
  test("different branches score low", () => {
    expect(nameSimilarity("PAST - Az Zahra", "Past Al-Jubail (🔥Free Delivery 🔥)", common)).toBeLessThan(0.72);
  });
});

describe("suggestMerges", () => {
  const suggestions = suggestMerges(registry);
  const pairs = suggestions.map((s) => [s.source.id, s.target.id].sort().join("+"));

  test("pairs each branch with its counterpart on another platform", () => {
    expect(pairs).toContain(["hs-jam", "k-jam"].sort().join("+"));
    expect(pairs).toContain(["hs-uhud", "k-uhud"].sort().join("+"));
    expect(pairs).toContain(["j-malqa", "k-malqa"].sort().join("+"));
  });

  test("never pairs two branches on the same platform, and uses each branch once", () => {
    const ids = suggestions.flatMap((s) => [s.source.id, s.target.id]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of suggestions) expect(s.source.id.split("-")[0]).not.toBe(s.target.id.split("-")[0]);
  });

  test("branches with no counterpart wait for review", () => {
    expect(unmatchedBranches(registry, suggestions).map((r) => r.id).sort()).toEqual(["hs-zahra", "k-jubail"]);
  });

  test("a single-platform workspace has nothing to review", () => {
    expect(unmatchedBranches([registry[0]!, registry[1]!], [])).toEqual([]);
  });
});

describe("mergeCandidates", () => {
  test("only rows without the same platform", () => {
    expect(mergeCandidates(registry[0]!, registry).every((r) => !r.hungerstation_id)).toBe(true);
  });
});
