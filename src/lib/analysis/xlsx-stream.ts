/**
 * Low-memory XLSX reader for large platform exports.
 *
 * SheetJS builds the whole workbook in memory (a cell object per cell plus the full sheet XML as one
 * string); a 6 MB Keeta export whose Order Summary sheet is 70 MB of XML needs well over 1 GB, far
 * above a Cloudflare Worker's 128 MB. This reader unzips each sheet as a stream and keeps only the
 * cell values, producing exactly what the engines read today:
 * `XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, raw: true })`.
 *
 * It follows SheetJS's parsing rules (shared and inline strings, rich text, XML escapes, `_xHHHH_`
 * codes, booleans, errors, the `<dimension>` range, blank rows). Anything it cannot reproduce
 * exactly (a date-typed cell, a formula without a cached value, CDATA, an unsupported compression
 * method) makes it return null, and callers fall back to SheetJS.
 */

export type SheetMatrix = unknown[][];

export interface SheetSource {
  /** Sheet names in workbook order. */
  names: string[];
  /** The sheet's rows as `sheet_to_json(header: 1, defval: null, raw: true)` returns them. */
  matrix(name: string): SheetMatrix | undefined;
}

class Unsupported extends Error {}

// ---------------------------------------------------------------- zip

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  dataOffset: number;
}

function readZipEntries(bytes: Uint8Array): Map<string, ZipEntry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 22 - 65_535); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Unsupported("not a zip");
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  if (offset === 0xffffffff) throw new Unsupported("zip64");
  const decoder = new TextDecoder();
  const entries = new Map<string, ZipEntry>();
  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Unsupported("bad central directory");
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const name = decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength));
    if (view.getUint32(localOffset, true) !== 0x04034b50) throw new Unsupported("bad local header");
    const localName = view.getUint16(localOffset + 26, true);
    const localExtra = view.getUint16(localOffset + 28, true);
    entries.set(name.replace(/\\/g, "/").replace(/^\//, ""), {
      name,
      method,
      compressedSize,
      dataOffset: localOffset + 30 + localName + localExtra,
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function entryStream(bytes: Uint8Array, entry: ZipEntry): ReadableStream<Uint8Array> {
  const data = bytes.subarray(entry.dataOffset, entry.dataOffset + entry.compressedSize);
  const source = new ReadableStream<Uint8Array>({
    start(controller) {
      // Feed in slices so the inflater never needs the whole entry at once.
      for (let i = 0; i < data.length; i += 1 << 16) controller.enqueue(data.subarray(i, i + (1 << 16)));
      controller.close();
    },
  });
  if (entry.method === 0) return source;
  if (entry.method !== 8) throw new Unsupported("compression method " + entry.method);
  return source.pipeThrough(new DecompressionStream("deflate-raw") as unknown as TransformStream<Uint8Array, Uint8Array>);
}

async function* textChunks(stream: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  const decoder = new TextDecoder("utf-8");
  const reader = stream.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value, { stream: true });
    if (text) yield text;
  }
  const tail = decoder.decode();
  if (tail) yield tail;
}

async function entryText(bytes: Uint8Array, entry: ZipEntry | undefined): Promise<string> {
  if (!entry) return "";
  let out = "";
  for await (const chunk of textChunks(entryStream(bytes, entry))) out += chunk;
  return out;
}

// ---------------------------------------------------------------- SheetJS-equivalent text rules

const ENCODINGS: Record<string, string> = { "&quot;": '"', "&apos;": "'", "&gt;": ">", "&lt;": "<", "&amp;": "&" };
const ENC_RE = /&(?:quot|apos|gt|lt|amp|#x?([\da-fA-F]+));/gi;
const CODE_RE = /_x([\da-fA-F]{4})_/gi;

function unescapeXml(text: string): string {
  if (text.includes("<![CDATA[")) throw new Unsupported("CDATA");
  return text
    .replace(ENC_RE, (all, code: string | undefined) => ENCODINGS[all] ?? (String.fromCharCode(parseInt(code ?? "", all.includes("x") ? 16 : 10)) || all))
    .replace(CODE_RE, (_, code: string) => String.fromCharCode(parseInt(code, 16)));
}

const SI_T_RE = /<(?:\w+:)?t[^>]*>([^<]*)<\/(?:\w+:)?t>/g;
const SI_R_RE = /<(?:\w+:)?r>/;
const SI_RPH_RE = /<(?:\w+:)?rPh.*?>([\s\S]*?)<\/(?:\w+:)?rPh>/g;
const TAG_RE = /<[/?]?[a-zA-Z0-9:_-]+(?:\s+[^"\s?<>/]+\s*=\s*(?:"[^"]*"|'[^']*'|[^'">\s]+))*\s*[/?]?>/gm;

/** SheetJS parse_si: the text of a shared or inline string item. */
function stringItem(x: string): string | undefined {
  if (!x) return "";
  if (/^\s*<(?:\w+:)?t[^>]*>/.test(x)) {
    return unescapeXml(x.slice(x.indexOf(">") + 1).split(/<\/(?:\w+:)?t>/)[0] ?? "");
  }
  if (SI_R_RE.test(x)) {
    return unescapeXml((x.replace(SI_RPH_RE, "").match(SI_T_RE) ?? []).join("").replace(TAG_RE, ""));
  }
  return undefined;
}

function sharedStrings(xml: string): Array<string | undefined> {
  const sst = xml.match(/<(?:\w+:)?sst([^>]*)>([\s\S]*)<\/(?:\w+:)?sst>/);
  if (!sst) return [];
  return (sst[2] ?? "")
    .replace(/<(?:\w+:)?(?:si|sstItem)>/g, "")
    .split(/<\/(?:\w+:)?(?:si|sstItem)>/)
    .map((item) => stringItem(item.trim()));
}

function attr(tag: string, name: string): string | undefined {
  const match = tag.match(new RegExp("(?:^|\\s)" + name + "\\s*=\\s*(?:\"([^\"]*)\"|'([^']*)')"));
  return match ? (match[1] ?? match[2]) : undefined;
}

function decodeCol(letters: string): number {
  let index = 0;
  for (let i = 0; i < letters.length; i++) {
    const code = letters.charCodeAt(i) - 64;
    if (code < 1 || code > 26) break;
    index = 26 * index + code;
  }
  return index - 1;
}

function decodeRange(ref: string): { sr: number; sc: number; er: number; ec: number } | null {
  const [a, b = a] = ref.split(":");
  const cell = (s: string) => {
    const m = s.match(/^\$?([A-Za-z]+)\$?(\d+)$/);
    return m ? { c: decodeCol(m[1]!.toUpperCase()), r: parseInt(m[2]!, 10) - 1 } : null;
  };
  const s = cell(a ?? ""), e = cell(b ?? "");
  if (!s || !e) return null;
  return { sr: s.r, sc: s.c, er: e.r, ec: e.c };
}

const V_RE = /<(?:\w+:)?v(?:\s[^>]*)?>([\s\S]*?)<\/(?:\w+:)?v>/;
const F_RE = /<(?:\w+:)?f[\s>/]/;
const IS_RE = /<(?:\w+:)?is>([\S\s]*?)<\/(?:\w+:)?is>/;
const CELL_SPLIT_RE = /<(?:\w+:)?c[ />]/;

interface ParseState {
  rows: Map<number, unknown[]>;
  /** One standalone copy per distinct string, so cells do not pin the large text chunks they were cut from. */
  intern: Map<string, string>;
  strings: Array<string | undefined>;
  tagr: number;
  guess: { sr: number; sc: number; er: number; ec: number };
}

/** One `</row>`-terminated segment, parsed like SheetJS parse_ws_xml_data. */
function parseRowSegment(segment: string, state: ParseState) {
  const x = segment.trim();
  if (!x) return;
  // The first non-self-closing <row ...> tag in the segment.
  const rowTag = x.match(/<(?:\w+:)?row\b(?:[^>]*[^/>])?>/);
  if (!rowTag || rowTag.index === undefined) return;
  const r = attr(rowTag[0].slice(1, -1), "r");
  state.tagr = r != null ? parseInt(r, 10) : state.tagr + 1;
  const rowIndex = state.tagr - 1;
  if (state.guess.sr > rowIndex) state.guess.sr = rowIndex;
  if (state.guess.er < rowIndex) state.guess.er = rowIndex;

  let cells = x.slice(rowTag.index + rowTag[0].length).split(CELL_SPLIT_RE);
  let skip = 0;
  // SheetJS drops leading pieces that start with another tag (they are not cell bodies).
  while (skip < cells.length && cells[skip]!.trim().charAt(0) === "<") skip++;
  cells = cells.slice(skip);
  let tagc = -1;
  let row = state.rows.get(rowIndex);
  for (let i = 0; i < cells.length; i++) {
    let cell = cells[i]!.trim();
    if (!cell) continue;
    cell = "<c " + (cell.slice(0, 1) === "<" ? ">" : "") + cell;
    const close = cell.indexOf(">");
    const tag = cell.slice(0, close + 1);
    const body = cell.slice(close + 1);
    const ref = attr(tag, "r");
    if (ref) tagc = decodeCol(ref.replace(/[^A-Za-z].*$/, "").toUpperCase());
    else tagc += 1;
    const type = attr(tag, "t");
    const vMatch = body.match(V_RE);
    let v: unknown = vMatch && vMatch[1] !== "" ? unescapeXml(vMatch[1]!) : undefined;
    let t = type;
    if (type == null && v === undefined) {
      // A formula without a cached value: SheetJS versions differ here, so leave it to SheetJS.
      if (F_RE.test(body)) throw new Unsupported("formula without a value");
      continue;
    } else t = type || "n";
    switch (t) {
      case "n":
        if (v === "" || v == null) continue;
        v = parseFloat(v as string);
        break;
      case "s":
        if (v === undefined) continue;
        v = state.strings[parseInt(v as string, 10)];
        if (v === undefined) throw new Unsupported("missing shared string");
        break;
      case "str":
        v = v != null ? v : "";
        break;
      case "inlineStr": {
        const is = body.match(IS_RE);
        const text = is ? stringItem(is[1]!) : undefined;
        v = text ?? "";
        break;
      }
      case "b":
        v = v === "1" || v === "true" || v === "TRUE";
        break;
      case "e":
        v = null;
        break;
      default:
        throw new Unsupported("cell type " + t);
    }
    if (typeof v === "string") {
      let canonical = state.intern.get(v);
      if (canonical === undefined) {
        canonical = v.length > 12 ? JSON.parse(JSON.stringify(v)) as string : v;
        state.intern.set(canonical, canonical);
      }
      v = canonical;
    }
    if (state.guess.sc > tagc) state.guess.sc = tagc;
    if (state.guess.ec < tagc) state.guess.ec = tagc;
    if (!row) {
      row = [];
      state.rows.set(rowIndex, row);
    }
    row[tagc] = v;
  }
}

async function readSheet(bytes: Uint8Array, entry: ZipEntry, strings: Array<string | undefined>): Promise<SheetMatrix> {
  const state: ParseState = {
    rows: new Map(),
    intern: new Map(),
    strings,
    tagr: 0,
    guess: { sr: 2_000_000, sc: 2_000_000, er: 0, ec: 0 },
  };
  let carry = "";
  let inData = false;
  let done = false;
  let head = "";
  for await (const chunk of textChunks(entryStream(bytes, entry))) {
    if (done) continue;
    carry += chunk;
    if (!inData) {
      const start = carry.search(/<(?:\w+:)?sheetData[^>]*>/);
      if (start < 0) {
        if (carry.length > 1_000_000) throw new Unsupported("sheetData not found");
        continue;
      }
      const open = carry.slice(start).match(/<(?:\w+:)?sheetData[^>]*>/)![0];
      head = carry.slice(0, start);
      if (open.endsWith("/>")) {
        done = true;
        carry = "";
        continue;
      }
      carry = carry.slice(start + open.length);
      inData = true;
    }
    const end = carry.search(/<\/(?:\w+:)?sheetData>/);
    const usable = end >= 0 ? carry.slice(0, end) : carry;
    const parts = usable.split(/<\/(?:\w+:)?row>/);
    const rest = end >= 0 ? "" : parts.pop() ?? "";
    for (const part of end >= 0 ? parts : parts) parseRowSegment(part, state);
    carry = rest;
    if (end >= 0) {
      done = true;
      carry = "";
    }
  }
  if (!done && carry) parseRowSegment(carry, state);

  let range: { sr: number; sc: number; er: number; ec: number } | null = null;
  const dimIndex = head.search(/<(?:\w*:)?dimension/);
  if (dimIndex > 0) {
    const ref = head.slice(dimIndex, dimIndex + 50).match(/"(\w*:\w*)"/);
    const d = ref ? decodeRange(ref[1]!) : null;
    if (d && d.sr <= d.er && d.sc <= d.ec && d.sr >= 0 && d.sc >= 0) range = d;
  }
  const g = state.guess;
  if (!range && g.ec >= g.sc && g.er >= g.sr) range = g;
  if (!range) return [];

  const matrix: SheetMatrix = [];
  const width = range.ec - range.sc + 1;
  for (let r = range.sr; r <= range.er; r++) {
    const source = state.rows.get(r);
    const out = new Array<unknown>(width);
    for (let c = 0; c < width; c++) {
      const value = source ? source[range.sc + c] : undefined;
      out[c] = value === undefined ? null : value;
    }
    matrix.push(out);
  }
  return matrix;
}

/**
 * Reads the named sheets (all when `wanted` is omitted). Returns null when the file uses
 * something this reader does not reproduce exactly; use SheetJS then.
 */
export async function readXlsxSheets(file: ArrayBuffer, wanted?: (name: string) => boolean): Promise<SheetSource | null> {
  try {
    const bytes = new Uint8Array(file);
    const entries = readZipEntries(bytes);
    const workbook = await entryText(bytes, entries.get("xl/workbook.xml"));
    if (!workbook) return null;
    const rels = await entryText(bytes, entries.get("xl/_rels/workbook.xml.rels"));
    const targets = new Map<string, string>();
    for (const rel of rels.match(/<(?:\w+:)?Relationship\b[^>]*>/g) ?? []) {
      const id = attr(rel, "Id");
      const target = attr(rel, "Target");
      if (id && target) targets.set(id, target);
    }
    const sheets: Array<{ name: string; path: string }> = [];
    for (const tag of workbook.match(/<(?:\w+:)?sheet\b[^>]*>/g) ?? []) {
      const name = attr(tag, "name");
      const rid = attr(tag, "r:id") ?? tag.match(/\s\w+:id\s*=\s*"([^"]*)"/)?.[1];
      const target = rid ? targets.get(rid) : undefined;
      if (name == null || !target) return null;
      const path = target.startsWith("/") ? target.slice(1) : "xl/" + target.replace(/^\.\//, "");
      sheets.push({ name: unescapeXml(name), path: path.replace(/\/[^/]+\/\.\.\//g, "/") });
    }
    const sharedPath = [...entries.keys()].find((key) => /^xl\/sharedStrings\.xml$/i.test(key));
    const strings = sharedPath ? sharedStrings(await entryText(bytes, entries.get(sharedPath))) : [];
    const matrices = new Map<string, SheetMatrix>();
    for (const sheet of sheets) {
      if (wanted && !wanted(sheet.name)) continue;
      const entry = entries.get(sheet.path);
      if (!entry) return null;
      matrices.set(sheet.name, await readSheet(bytes, entry, strings));
    }
    return { names: sheets.map((sheet) => sheet.name), matrix: (name) => matrices.get(name) };
  } catch (error) {
    if (error instanceof Unsupported) return null;
    throw error;
  }
}
