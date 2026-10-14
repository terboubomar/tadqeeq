import type { RegistryBranch } from "./branch-registry";
import { displayBranchName } from "./reporting-metrics";

/**
 * Cross-platform branch matching. The same restaurant branch is named differently on each platform
 * («PAST - Al Jamiyin» on HungerStation, «Past - Al-Jami'in (🔥Free Delivery 🔥)» on Keeta), so an upload can add
 * it to the branch registry twice. These helpers compare names with emoji, promo text, punctuation and common words
 * (the brand) removed, and suggest pairs for a person to confirm. Nothing is merged automatically.
 */
export type BranchPlatform = "hungerstation" | "keeta" | "jahez";
export const BRANCH_PLATFORMS: BranchPlatform[] = ["hungerstation", "keeta", "jahez"];

const ID_KEY: Record<BranchPlatform, "hungerstation_id" | "keeta_id" | "jahez_id"> = {
  hungerstation: "hungerstation_id",
  keeta: "keeta_id",
  jahez: "jahez_id",
};

/** The platforms a registry row is linked to. */
export function linkedPlatforms(row: RegistryBranch): BranchPlatform[] {
  return BRANCH_PLATFORMS.filter((platform) => Boolean(row[ID_KEY[platform]]));
}

/** Lower-case words of a branch name, without emoji, promo text, diacritics or punctuation. */
export function nameTokens(name: string): string[] {
  return displayBranchName(name)
    .toLocaleLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ًͯ-ٰٟ]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/['’`ʼ]/g, "")
    .replace(/\bal-/g, "al ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

/** Words that appear in most of the workspace's branch names (the brand, «فرع»): they say nothing about which branch. */
export function commonTokens(names: string[]): Set<string> {
  const counts = new Map<string, number>();
  for (const name of names) for (const token of new Set(nameTokens(name))) counts.set(token, (counts.get(token) ?? 0) + 1);
  const threshold = Math.max(2, Math.ceil(names.length * 0.4));
  return new Set([...counts].filter(([, count]) => count >= threshold).map(([token]) => token));
}

function bigrams(text: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < text.length - 1; i++) out.push(text.slice(i, i + 2));
  return out;
}

/** Sørensen–Dice similarity of two strings' letter pairs, 0 to 1. */
export function dice(a: string, b: string): number {
  if (a === b) return a ? 1 : 0;
  const left = bigrams(a);
  const right = bigrams(b);
  if (!left.length || !right.length) return 0;
  const pool = new Map<string, number>();
  for (const pair of left) pool.set(pair, (pool.get(pair) ?? 0) + 1);
  let shared = 0;
  for (const pair of right) {
    const left = pool.get(pair) ?? 0;
    if (left > 0) {
      shared++;
      pool.set(pair, left - 1);
    }
  }
  return (2 * shared) / (left.length + right.length);
}

/**
 * How alike two branch names are, 0 to 1: letter-pair similarity of the distinctive words, or, when every distinctive
 * word of the shorter name is found (closely) in the longer one, a near-certain match («Al Malqa» in «Past Al Malqa
 * Riyadh»).
 */
export function nameSimilarity(a: string, b: string, common: Set<string> = new Set()): number {
  const left = nameTokens(a).filter((token) => !common.has(token));
  const right = nameTokens(b).filter((token) => !common.has(token));
  if (!left.length || !right.length) return 0;
  const whole = dice(left.join(""), right.join(""));
  const [short, long] = left.length <= right.length ? [left, right] : [right, left];
  const contained = short.every((token) => long.some((other) => other === token || dice(token, other) >= 0.75));
  return contained ? Math.max(whole, 0.9) : whole;
}

export interface MergeSuggestion {
  /** The row folded away. */
  source: RegistryBranch;
  /** The row kept. */
  target: RegistryBranch;
  score: number;
}

const MIN_SCORE = 0.72;

/**
 * Pairs of registry rows that are probably the same branch on different platforms: no platform in common, names
 * alike. Each row appears in at most one suggestion (its best). The row linked to more platforms (or the older
 * name, alphabetically first, on a tie) is kept.
 */
export function suggestMerges(registry: RegistryBranch[]): MergeSuggestion[] {
  const common = commonTokens(registry.map((row) => row.name));
  const candidates: MergeSuggestion[] = [];
  for (let i = 0; i < registry.length; i++) {
    for (let j = i + 1; j < registry.length; j++) {
      const a = registry[i]!;
      const b = registry[j]!;
      const pa = linkedPlatforms(a);
      const pb = linkedPlatforms(b);
      if (!pa.length || !pb.length || pa.some((platform) => pb.includes(platform))) continue;
      const score = nameSimilarity(a.name, b.name, common);
      if (score < MIN_SCORE) continue;
      const keepA = pa.length > pb.length || (pa.length === pb.length && a.name.localeCompare(b.name) <= 0);
      candidates.push({ source: keepA ? b : a, target: keepA ? a : b, score });
    }
  }
  candidates.sort((left, right) => right.score - left.score);
  const used = new Set<string>();
  const out: MergeSuggestion[] = [];
  for (const candidate of candidates) {
    if (used.has(candidate.source.id) || used.has(candidate.target.id)) continue;
    used.add(candidate.source.id);
    used.add(candidate.target.id);
    out.push(candidate);
  }
  return out;
}

/**
 * Rows still waiting for review: linked to one platform only while the workspace has branches on other platforms
 * (so the same branch may exist there under another name), and not already in a suggestion.
 */
export function unmatchedBranches(registry: RegistryBranch[], suggestions: MergeSuggestion[]): RegistryBranch[] {
  const inUse = new Set(registry.flatMap(linkedPlatforms));
  if (inUse.size < 2) return [];
  const suggested = new Set(suggestions.flatMap((s) => [s.source.id, s.target.id]));
  return registry.filter((row) => {
    const platforms = linkedPlatforms(row);
    return platforms.length === 1 && !suggested.has(row.id) && [...inUse].some((platform) => !platforms.includes(platform));
  });
}

/** Rows a given row could be merged into: no platform in common with it. */
export function mergeCandidates(row: RegistryBranch, registry: RegistryBranch[]): RegistryBranch[] {
  const mine = linkedPlatforms(row);
  return registry.filter((other) => other.id !== row.id && !linkedPlatforms(other).some((platform) => mine.includes(platform)));
}
