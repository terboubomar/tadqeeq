import { normalizeFormatHeader } from "../analysis/formats/types";
import type { Platform } from "../analysis/types";
import type { SheetSource } from "../analysis/xlsx-stream";
import { FINGERPRINTS, isDate, isMoney, nameScore, sourceRows } from "./match";

/**
 * New and vanished money columns, learned per workspace.
 *
 * The engines read a fixed set of columns; a fee the platform adds under a new name, or an
 * optional column it renames, would otherwise be counted as zero without anyone noticing.
 * Each upload's columns are compared with the columns seen in the workspace's earlier files
 * of the same platform: a new column carrying amounts, or a column that used to carry amounts
 * and is gone, is reported. Nothing here changes audit figures.
 */

export interface ColumnProfile {
  name: string;
  /** Most non-empty values are amounts. */
  money: boolean;
  /** At least one non-zero amount. */
  nonZero: boolean;
  /** Sum of the amounts (money columns only). */
  total: number;
}

export interface SourceProfile {
  source: string;
  columns: ColumnProfile[];
}

export interface ColumnChange {
  kind: "added" | "removed";
  source: string;
  column: string;
  /** Sum of the new column's amounts in this file. */
  total?: number;
  /** For an added column: the vanished column it most likely replaces. */
  replaces?: string;
}

/** The columns remembered for one platform source; `nonZero` once any file had amounts in it. */
export interface ColumnSnapshot {
  source: string;
  columns: Array<{ name: string; money: boolean; nonZero: boolean }>;
}

const MAX_ROWS = 100_000;
const MONEY_SHARE = 0.9;
const RENAME_SIMILARITY = 0.45;

function amount(value: unknown): number {
  if (typeof value === "number") return value;
  const text = String(value).trim().replace(/[,\s]/g, "").replace(/^\((.*)\)$/, "-$1").replace(/(SAR|ر\.س)$/i, "");
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function profileColumns(platform: Platform, file: ArrayBuffer, sheets?: SheetSource): SourceProfile[] {
  const profiles: SourceProfile[] = [];
  for (const fingerprint of FINGERPRINTS[platform]) {
    const table = sourceRows(platform, fingerprint.source, file, MAX_ROWS, sheets);
    if (!table) continue;
    // Tallied row by row (rows are read lazily), in row order so totals add up exactly as before.
    const tally = table.headers.map(() => ({ present: 0, amounts: 0, nonZero: false, sum: 0 }));
    for (const row of table.rows) {
      for (let index = 0; index < tally.length; index++) {
        const value = row[index];
        if (value === null || value === undefined || String(value).trim() === "") continue;
        const column = tally[index]!;
        column.present += 1;
        if (!isMoney(value) || isDate(value)) continue;
        column.amounts += 1;
        const parsed = amount(value);
        if (parsed !== 0) column.nonZero = true;
        column.sum += parsed;
      }
    }
    const columns = table.headers
      .map((name, index): ColumnProfile | null => {
        if (!name) return null;
        const { present, amounts, nonZero, sum } = tally[index]!;
        const money = present > 0 && amounts / present >= MONEY_SHARE;
        return {
          name,
          money,
          nonZero: money && nonZero,
          total: money ? Math.round(sum * 100) / 100 : 0,
        };
      })
      .filter((column): column is ColumnProfile => column !== null);
    profiles.push({ source: fingerprint.source, columns });
  }
  return profiles;
}

/** Changes against the remembered columns; empty when there is nothing remembered yet. */
export function diffColumns(snapshots: ColumnSnapshot[], profiles: SourceProfile[]): ColumnChange[] {
  const changes: ColumnChange[] = [];
  for (const profile of profiles) {
    const snapshot = snapshots.find((candidate) => candidate.source === profile.source);
    if (!snapshot || snapshot.columns.length === 0) continue;
    const known = new Set(snapshot.columns.map((column) => normalizeFormatHeader(column.name)));
    const present = new Set(profile.columns.map((column) => normalizeFormatHeader(column.name)));

    const removed = snapshot.columns
      .filter((column) => column.money && column.nonZero && !present.has(normalizeFormatHeader(column.name)))
      .map((column) => column.name);
    const added = profile.columns.filter((column) => column.money && column.nonZero && !known.has(normalizeFormatHeader(column.name)));

    const paired = new Set<string>();
    for (const column of added) {
      const best = removed
        .filter((name) => !paired.has(name))
        .map((name) => ({ name, score: nameScore(column.name, name) }))
        .sort((a, b) => b.score - a.score)[0];
      const replaces = best && best.score >= RENAME_SIMILARITY ? best.name : undefined;
      if (replaces) paired.add(replaces);
      changes.push({ kind: "added", source: profile.source, column: column.name, total: column.total, ...(replaces ? { replaces } : {}) });
    }
    for (const name of removed) {
      if (!paired.has(name)) changes.push({ kind: "removed", source: profile.source, column: name });
    }
  }
  return changes;
}

/**
 * Remembered columns after this file: this file's columns, plus earlier ones that never had
 * amounts (a column that had amounts and is gone is reported once by diffColumns, then forgotten).
 */
export function mergeSnapshots(snapshots: ColumnSnapshot[], profiles: SourceProfile[]): ColumnSnapshot[] {
  return profiles.map((profile) => {
    const previous = (snapshots.find((candidate) => candidate.source === profile.source)?.columns ?? []).filter(
      (column) => !(column.money && column.nonZero),
    );
    const before = new Map(
      (snapshots.find((candidate) => candidate.source === profile.source)?.columns ?? []).map((column) => [normalizeFormatHeader(column.name), column]),
    );
    const byName = new Map(previous.map((column) => [normalizeFormatHeader(column.name), { ...column }]));
    for (const column of profile.columns) {
      const key = normalizeFormatHeader(column.name);
      const current = before.get(key);
      byName.set(key, {
        name: column.name,
        money: column.money || (current?.money ?? false),
        nonZero: column.nonZero || (current?.nonZero ?? false),
      });
    }
    return { source: profile.source, columns: [...byName.values()].slice(0, 400) };
  });
}
