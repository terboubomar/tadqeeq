import { describe, expect, test } from "bun:test";

import {
  classifyNinjaPackageFiles,
  extractNinjaZip,
} from "./ninja-package";

function storedZip(entries: Array<{ name: string; content: string }>): Uint8Array {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  let total = 0;

  for (const entry of entries) {
    const name = encoder.encode(entry.name);
    const data = encoder.encode(entry.content);
    const header = new Uint8Array(30);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0, true);
    view.setUint16(8, 0, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, name.length, true);
    view.setUint16(28, 0, true);
    chunks.push(header, name, data);
    total += header.length + name.length + data.length;
  }

  const end = new Uint8Array(22);
  new DataView(end.buffer).setUint32(0, 0x06054b50, true);
  chunks.push(end);
  total += end.length;

  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

describe("Ninja package ingestion", () => {
  test("classifies folder-selected PDFs and ignores non-PDF files", () => {
    const files = [
      new File(["summary"], "Branch A/SINV260000000000001_summary.pdf", { type: "application/pdf" }),
      new File(["invoice"], "Branch A/SINV260000000000001.pdf", { type: "application/pdf" }),
      new File(["notes"], "Branch A/readme.txt", { type: "text/plain" }),
    ];

    const result = classifyNinjaPackageFiles(files);
    expect(result.summaryFiles.map((file) => file.name)).toEqual([
      "Branch A/SINV260000000000001_summary.pdf",
    ]);
    expect(result.invoiceFiles.map((file) => file.name)).toEqual([
      "Branch A/SINV260000000000001.pdf",
    ]);
  });

  test("extracts PDFs recursively from a ZIP and preserves entry names for matching", async () => {
    const zip = storedZip([
      { name: "R5541/SINV260000000000001_summary.pdf", content: "summary" },
      { name: "R5541/SINV260000000000001.pdf", content: "invoice" },
      { name: "R5548/SINV260000000000002_summary.pdf", content: "summary" },
      { name: "R5548/SINV260000000000002.pdf", content: "invoice" },
      { name: "R5548/readme.txt", content: "ignored" },
    ]);

    const result = await extractNinjaZip(
      new File([zip], "ninja-september.zip", { type: "application/zip" }),
    );

    expect(result.summaryFiles).toHaveLength(2);
    expect(result.invoiceFiles).toHaveLength(2);
    expect(result.summaryFiles[0]?.name).toContain("R5541/");
    expect(result.invoiceFiles[1]?.name).toContain("R5548/");
  });

  test("rejects path traversal entries", async () => {
    const zip = storedZip([
      { name: "../SINV260000000000001_summary.pdf", content: "bad" },
    ]);

    await expect(
      extractNinjaZip(new File([zip], "unsafe.zip", { type: "application/zip" })),
    ).rejects.toThrow("غير آمن");
  });
});
