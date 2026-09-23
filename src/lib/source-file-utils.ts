export function safeStorageFileName(name: string): string {
  const cleaned = name
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}._-]+/gu, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "");

  return cleaned.slice(0, 120) || "source-file";
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
