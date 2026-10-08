/**
 * File name for a storage key. Supabase Storage accepts only ASCII keys, so letters outside
 * A–Z (Arabic names such as «اليز غلوب.xlsx») are dropped; the real name is kept in original_name.
 * The extension is preserved, and a name with no ASCII left becomes "source-file".
 */
export function safeStorageFileName(name: string): string {
  const ascii = (text: string) =>
    text
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "");

  const normalized = name.normalize("NFKC");
  const dot = normalized.lastIndexOf(".");
  const rawExtension = dot > 0 ? ascii(normalized.slice(dot + 1)) : "";
  const extension = /^[A-Za-z0-9]{1,10}$/.test(rawExtension) ? "." + rawExtension.toLowerCase() : "";
  const base = ascii(extension ? normalized.slice(0, dot) : normalized) || "source-file";

  return base.slice(0, 120 - extension.length) + extension;
}

export async function sha256Hex(data: Blob): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    await data.arrayBuffer(),
  );

  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}
