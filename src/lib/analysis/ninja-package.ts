import {
  MAX_UPLOAD_SIZE_BYTES,
  NINJA_ZIP_MAX_ENTRIES,
  NINJA_ZIP_NINJA_ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES_BYTES,
} from "../limits";

export interface NinjaPackageFiles {
  summaryFiles: File[];
  invoiceFiles: File[];
}

function u16(view: DataView, offset: number): number {
  return view.getUint16(offset, true);
}

function u32(view: DataView, offset: number): number {
  return view.getUint32(offset, true);
}

function safeEntryName(raw: string): string {
  const normalized = raw.replace(/\\/g, "/").replace(/^\/+/, "");
  if (!normalized || normalized.includes("../") || normalized.startsWith("../")) {
    throw new Error("يحتوي ZIP على مسار ملف غير آمن.");
  }
  return normalized;
}

function arrayBuffer(data: Uint8Array): ArrayBuffer {
  return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("فك ZIP غير مدعوم في بيئة الخادم الحالية.");
  }
  const stream = new Blob([arrayBuffer(data)]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function classifyPdf(files: File[]): NinjaPackageFiles {
  const summaryFiles: File[] = [];
  const invoiceFiles: File[] = [];

  for (const file of files) {
    const lower = file.name.toLowerCase();
    if (!lower.endsWith(".pdf")) continue;
    if (/(?:^|[_\-\s])summary\.pdf$/i.test(lower)) summaryFiles.push(file);
    else invoiceFiles.push(file);
  }

  return { summaryFiles, invoiceFiles };
}

/** Classifies ordinary PDFs selected from a folder or file picker. Non-PDF files are ignored. */
export function classifyNinjaPackageFiles(files: File[]): NinjaPackageFiles {
  return classifyPdf(files);
}

/**
 * Minimal ZIP reader for Ninja packages.
 * Supports stored and deflate entries, rejects encrypted/ZIP64 entries and zip-bomb sized payloads.
 * Only PDF entries are materialized.
 */
export async function extractNinjaZip(file: File): Promise<NinjaPackageFiles> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder("utf-8");
  const pdfs: File[] = [];
  let offset = 0;
  let entries = 0;
  let totalUncompressed = 0;

  while (offset + 4 <= bytes.length) {
    const signature = u32(view, offset);

    if (signature === 0x04034b50) {
      if (offset + 30 > bytes.length) throw new Error("ملف ZIP غير مكتمل.");
      entries += 1;
      if (entries > NINJA_ZIP_MAX_ENTRIES) throw new Error("يحتوي ZIP على عدد ملفات أكبر من الحد المسموح.");

      const flags = u16(view, offset + 6);
      const method = u16(view, offset + 8);
      const compressedSize = u32(view, offset + 18);
      const uncompressedSize = u32(view, offset + 22);
      const nameLength = u16(view, offset + 26);
      const extraLength = u16(view, offset + 28);

      if (flags & 0x0001) throw new Error("ملفات ZIP المشفرة غير مدعومة.");
      if (flags & 0x0008) {
        throw new Error("صيغة ZIP ذات Data Descriptor غير مدعومة. أعد ضغط المجلد بصيغة ZIP عادية.");
      }
      if (compressedSize === 0xffffffff || uncompressedSize === 0xffffffff) {
        throw new Error("ZIP64 غير مدعوم حالياً.");
      }
      if (method !== 0 && method !== 8) {
        throw new Error("يحتوي ZIP على طريقة ضغط غير مدعومة.");
      }

      const nameStart = offset + 30;
      const dataStart = nameStart + nameLength + extraLength;
      const dataEnd = dataStart + compressedSize;
      if (dataEnd > bytes.length) throw new Error("ملف ZIP تالف أو غير مكتمل.");

      const name = safeEntryName(decoder.decode(bytes.slice(nameStart, nameStart + nameLength)));
      const isDirectory = name.endsWith("/");

      if (!isDirectory) {
        if (uncompressedSize > MAX_UPLOAD_SIZE_BYTES) {
          throw new Error("أحد ملفات ZIP يتجاوز الحد المسموح لكل PDF.");
        }
        totalUncompressed += uncompressedSize;
        if (totalUncompressed > NINJA_ZIP_MAX_TOTAL_UNCOMPRESSED_BYTES) {
          throw new Error("الحجم الإجمالي بعد فك ZIP يتجاوز الحد المسموح.");
        }

        if (name.toLowerCase().endsWith(".pdf")) {
          const compressed = bytes.slice(dataStart, dataEnd);
          const output = method === 0 ? compressed : await inflateRaw(compressed);
          if (output.byteLength !== uncompressedSize) {
            throw new Error("حجم ملف داخل ZIP لا يطابق بيانات الأرشيف.");
          }
          pdfs.push(new File([arrayBuffer(output)], name, { type: "application/pdf" }));
        }
      }

      offset = dataEnd;
      continue;
    }

    // Central directory or end-of-central-directory: local entries are complete.
    if (signature === 0x02014b50 || signature === 0x06054b50) break;

    throw new Error("تعذّر قراءة بنية ZIP.");
  }

  if (!pdfs.length) throw new Error("لا يحتوي ZIP على ملفات PDF خاصة بـ Ninja.");
  return classifyPdf(pdfs);
}
