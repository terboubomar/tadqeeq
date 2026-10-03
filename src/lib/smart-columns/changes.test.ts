import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import * as XLSX from "xlsx";

import { FIXTURE_DIRS } from "../analysis/fixtures/load";
import { diffColumns, mergeSnapshots, profileColumns } from "./changes";

type Edit = { rename?: Record<string, string>; drop?: string[]; add?: { name: string; value: number } };

function keetaFile(edit: Edit = {}): ArrayBuffer {
  const source = JSON.parse(readFileSync(FIXTURE_DIRS.keeta + "/source.json", "utf8")) as { sheetName: string; headers: string[]; rows: unknown[][] };
  const keep = source.headers.map((header) => !(edit.drop ?? []).includes(header));
  const headers = source.headers.filter((_, i) => keep[i]).map((header) => edit.rename?.[header] ?? header);
  const rows = source.rows.map((row) => row.filter((_, i) => keep[i]));
  if (edit.add) {
    headers.push(edit.add.name);
    rows.forEach((row) => row.push(edit.add!.value));
  }
  const workbook = XLSX.utils.book_new();
  const blank = Array(headers.length).fill(null);
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([blank, blank, headers, ...rows]), source.sheetName);
  return XLSX.write(workbook, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

const baseline = () => mergeSnapshots([], profileColumns("keeta", keetaFile()));

describe("new and vanished money columns", () => {
  test("columns are profiled as money with their totals", () => {
    const [orders] = profileColumns("keeta", keetaFile());
    const bank = orders!.columns.find((column) => column.name === "Bank fee (VAT included)")!;
    expect(bank).toMatchObject({ money: true, nonZero: true });
    expect(bank.total).toBeLessThan(0);
    expect(orders!.columns.find((column) => column.name === "Brand Name")!.money).toBe(false);
  });

  test("the first file of a platform is only remembered, never flagged", () => {
    expect(diffColumns([], profileColumns("keeta", keetaFile()))).toEqual([]);
  });

  test("the same columns again report nothing", () => {
    expect(diffColumns(baseline(), profileColumns("keeta", keetaFile()))).toEqual([]);
  });

  test("a new fee column with amounts is reported with its total", () => {
    const changes = diffColumns(baseline(), profileColumns("keeta", keetaFile({ add: { name: "Packaging fee (VAT included)", value: -3 } })));
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ kind: "added", source: "Order Summary", column: "Packaging fee (VAT included)" });
    expect(changes[0]!.total).toBeLessThan(0);
  });

  test("a new column of zeros or text is not reported", () => {
    expect(diffColumns(baseline(), profileColumns("keeta", keetaFile({ add: { name: "Tips", value: 0 } })))).toEqual([]);
  });

  test("a renamed optional fee column is reported as a replacement", () => {
    const changes = diffColumns(
      baseline(),
      profileColumns("keeta", keetaFile({ rename: { "Photography Service Fee(VAT included)": "Photography fee (incl. VAT)" } })),
    );
    expect(changes).toEqual([
      expect.objectContaining({ kind: "added", column: "Photography fee (incl. VAT)", replaces: "Photography Service Fee(VAT included)" }),
    ]);
  });

  test("a vanished fee column is reported once, then forgotten", () => {
    const dropped = profileColumns("keeta", keetaFile({ drop: ["Product campaign expenses by merchant (VAT included)"] }));
    expect(diffColumns(baseline(), dropped)).toEqual([
      { kind: "removed", source: "Order Summary", column: "Product campaign expenses by merchant (VAT included)" },
    ]);
    const after = mergeSnapshots(baseline(), dropped);
    expect(diffColumns(after, dropped)).toEqual([]);
  });

  test("Jahez order details are profiled too", () => {
    const text = readFileSync(FIXTURE_DIRS.jahez + "/source.csv", "utf8");
    const file = new TextEncoder().encode(text).buffer as ArrayBuffer;
    const sources = profileColumns("jahez", file).map((profile) => profile.source);
    expect(sources).toEqual(["Jahez Summary", "Jahez Order Details"]);
  });
});
