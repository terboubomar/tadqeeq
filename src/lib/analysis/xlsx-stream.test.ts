import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import * as XLSX from "xlsx";

import { analyzeFixture, FIXTURE_DIRS } from "./fixtures/load";
import { analyzeKeeta, analyzeKeetaSheets } from "./keeta";
import { readXlsxSheets } from "./xlsx-stream";

function sheetjs(file: ArrayBuffer): Record<string, unknown[][]> {
  const wb = XLSX.read(file, { type: "array" });
  return Object.fromEntries(
    wb.SheetNames.map((name) => [name, XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name]!, { header: 1, defval: null, raw: true })]),
  );
}

async function streamed(file: ArrayBuffer): Promise<Record<string, unknown[][]>> {
  const source = await readXlsxSheets(file);
  expect(source).not.toBeNull();
  return Object.fromEntries(source!.names.map((name) => [name, source!.matrix(name)!]));
}

// ---- a minimal stored (uncompressed) zip writer, to hand-craft sheet XML that SheetJS cannot write

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zip(files: Record<string, string>): ArrayBuffer {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = enc.encode(name);
    const data = enc.encode(content);
    const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(4, 20, true);
    local.setUint32(14, crc, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, data.length, true);
    local.setUint16(26, nameBytes.length, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, data);
    const cd = new DataView(new ArrayBuffer(46));
    cd.setUint32(0, 0x02014b50, true);
    cd.setUint16(4, 20, true);
    cd.setUint16(6, 20, true);
    cd.setUint32(16, crc, true);
    cd.setUint32(20, data.length, true);
    cd.setUint32(24, data.length, true);
    cd.setUint16(28, nameBytes.length, true);
    cd.setUint32(42, offset, true);
    central.push(new Uint8Array(cd.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const cdSize = central.reduce((n, p) => n + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, cdSize, true);
  end.setUint32(16, offset, true);
  const all = [...parts, ...central, new Uint8Array(end.buffer)];
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of all) {
    out.set(p, at);
    at += p.length;
  }
  return out.buffer;
}

function workbookXml(sheets: Record<string, string>, sharedStrings?: string): ArrayBuffer {
  const names = Object.keys(sheets);
  const files: Record<string, string> = {
    "[Content_Types].xml":
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("") +
      (sharedStrings ? '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>' : "") +
      "</Types>",
    "_rels/.rels":
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    "xl/workbook.xml":
      '<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      names.map((n, i) => `<sheet name="${n}" r:id="rId${i + 3}" sheetId="${i + 1}"/>`).join("") +
      "</sheets></workbook>",
    "xl/_rels/workbook.xml.rels":
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      (sharedStrings ? '<Relationship Id="rId1" Target="sharedStrings.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings"/>' : "") +
      names.map((_, i) => `<Relationship Id="rId${i + 3}" Target="worksheets/sheet${i + 1}.xml" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet"/>`).join("") +
      "</Relationships>",
  };
  if (sharedStrings) files["xl/sharedStrings.xml"] = sharedStrings;
  names.forEach((name, i) => {
    files[`xl/worksheets/sheet${i + 1}.xml`] =
      '<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' + sheets[name] + "</worksheet>";
  });
  return zip(files);
}

describe("low-memory xlsx reader", () => {
  test("matches SheetJS on the Keeta and HungerStation fixtures", async () => {
    const keeta = JSON.parse(readFileSync(FIXTURE_DIRS.keeta + "/source.json", "utf8")) as { sheetName: string; headers: string[]; rows: unknown[][] };
    const wb = XLSX.utils.book_new();
    const blank = Array(keeta.headers.length).fill(null);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([blank, blank, keeta.headers, ...keeta.rows]), keeta.sheetName);
    for (const bookSST of [false, true]) {
      const file = XLSX.write(wb, { type: "array", bookType: "xlsx", bookSST }) as ArrayBuffer;
      expect(await streamed(file)).toEqual(sheetjs(file));
    }

    const hs = JSON.parse(readFileSync(FIXTURE_DIRS.hungerstation + "/source.json", "utf8")) as { sheetName: string; rows: Array<Record<string, unknown>> };
    const hsBook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(hsBook, XLSX.utils.json_to_sheet(hs.rows), hs.sheetName);
    const hsFile = XLSX.write(hsBook, { type: "array", bookType: "xlsx", bookSST: true }) as ArrayBuffer;
    expect(await streamed(hsFile)).toEqual(sheetjs(hsFile));
  });

  test("matches SheetJS on every cell type, escapes, gaps and blank rows", async () => {
    const sheet =
      '<dimension ref="A1:F7"/><sheetData>' +
      '<row r="1"><c r="A1" t="inlineStr"><is><t>Brand &amp; Name</t></is></c><c r="B1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><r><t>Rich </t></r><r><rPr><b/></rPr><t>Text</t></r></is></c></row>' +
      '<row r="2"><c r="A2"><v>1.5</v></c><c r="B2"><v>-17.25</v></c><c r="C2" t="b"><v>1</v></c><c r="D2" t="b"><v>0</v></c><c r="E2" t="e"><v>#N/A</v></c><c r="F2" t="str"><v>a &lt;b&gt; _x000D_ c</v></c></row>' +
      '<row r="4"><c r="C4"><f>SUM(A2:B2)</f><v>-15.75</v></c><c r="D4" s="1"/><c r="E4" t="inlineStr"><is><t xml:space="preserve">  spaced  </t></is></c></row>' +
      "<row r=\"5\" spans=\"1:6\"><c r='B5' t='inlineStr'><is><t>single quotes &#x41;&#66;</t></is></c><c t=\"inlineStr\"><is><t>no ref</t></is></c></row>" +
      '<row r="7"><c r="F7"><v>42</v></c></row>' +
      "</sheetData>";
    const shared =
      '<?xml version="1.0" encoding="UTF-8"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="2" uniqueCount="2">' +
      "<si><t>Store name</t></si><si><r><t>Pay</t></r><r><t>able</t></r><rPh><t>x</t></rPh></si></sst>";
    const noDimension = '<sheetData><row r="2"><c r="B2" t="inlineStr"><is><t>only cell</t></is></c></row></sheetData>';
    const singleCell = '<dimension ref="A1"/><sheetData><row r="1"><c r="A1"><v>1</v></c><c r="C1"><v>3</v></c></row><row r="3"><c r="B3"><v>2</v></c></row></sheetData>';
    const empty = '<dimension ref="A1"/><sheetData/>';
    const file = workbookXml({ Main: sheet, "No dimension": noDimension, Single: singleCell, Empty: empty }, shared);
    const reference = sheetjs(file);
    expect(reference["Main"]!.length).toBe(7);
    expect(await streamed(file)).toEqual(reference);
  });

  test("returns null (use SheetJS) for content it does not reproduce", async () => {
    const dated = workbookXml({ D: '<dimension ref="A1"/><sheetData><row r="1"><c r="A1" t="d"><v>2026-09-01</v></c></row></sheetData>' });
    expect(await readXlsxSheets(dated)).toBeNull();
    const formula = workbookXml({ F: '<dimension ref="A1"/><sheetData><row r="1"><c r="A1"><f>1+1</f></c></row></sheetData>' });
    expect(await readXlsxSheets(formula)).toBeNull();
    expect(await readXlsxSheets(new TextEncoder().encode("not a zip at all, just text").buffer as ArrayBuffer)).toBeNull();
  });

  test("the Keeta engine gives the same audit from streamed sheets", async () => {
    const keeta = JSON.parse(readFileSync(FIXTURE_DIRS.keeta + "/source.json", "utf8")) as { sheetName: string; headers: string[]; rows: unknown[][] };
    const wb = XLSX.utils.book_new();
    const blank = Array(keeta.headers.length).fill(null);
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([blank, blank, keeta.headers, ...keeta.rows]), keeta.sheetName);
    const file = XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
    const fromStream = analyzeKeetaSheets((await readXlsxSheets(file))!);
    expect(fromStream).toEqual(analyzeKeeta(file));
    expect(fromStream).toEqual(await analyzeFixture("keeta"));
  });
});
