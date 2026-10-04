export type SniffedFile = { mime: "application/pdf" | "image/png" | "image/jpeg" | "image/webp"; ext: "pdf" | "png" | "jpg" | "webp" };

const startsWith = (bytes: Uint8Array, signature: number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((value, index) => bytes[offset + index] === value);

/**
 * The real type of an uploaded document or image, read from its first bytes, so a file is never stored or
 * served with the type the browser claimed. Only PDF, PNG, JPEG and WEBP are recognised; anything else
 * (HTML, SVG, scripts) returns null and must be refused.
 */
export function sniffFile(bytes: Uint8Array): SniffedFile | null {
  if (startsWith(bytes, [0x25, 0x50, 0x44, 0x46, 0x2d])) return { mime: "application/pdf", ext: "pdf" }; // %PDF-
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mime: "image/png", ext: "png" };
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return { mime: "image/jpeg", ext: "jpg" };
  if (startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return { mime: "image/webp", ext: "webp" };
  return null;
}

/** Decodes a base64 data URL ("data:<type>;base64,<data>") to bytes; null when it is not one. */
export function dataUrlBytes(dataUrl: string): Uint8Array | null {
  const match = dataUrl.match(/^data:[\w/+.-]+;base64,([A-Za-z0-9+/=\s]+)$/);
  return match ? Uint8Array.from(Buffer.from(match[1] ?? "", "base64")) : null;
}
