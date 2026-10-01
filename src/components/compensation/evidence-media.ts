import { supabase } from "@/integrations/supabase/client";

export type EvidenceMediaVariant = "full" | "thumb";

export interface EvidenceMediaFile {
  blob: Blob;
  filename: string;
  kind: "image" | "video";
}

function filenameFrom(disposition: string | null, fallback: string): string {
  const match = disposition?.match(/filename="([^"]+)"/);
  return match?.[1] ?? fallback;
}

/**
 * Fetches evidence from Telegram through Tadqeeq's server, in memory only. The browser never
 * gets a Telegram URL and nothing is stored by Tadqeeq; the bytes live in this tab until the
 * caller revokes the object URL (or the user saves the file).
 */
export async function fetchEvidenceMedia(
  evidenceId: string,
  variant: EvidenceMediaVariant = "full",
): Promise<EvidenceMediaFile> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("الجلسة منتهية، سجّل الدخول مرة أخرى.");

  const response = await fetch(
    `/api/compensation/evidence/${encodeURIComponent(evidenceId)}/media?variant=${variant}`,
    { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" },
  );
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "تعذّر جلب الدليل من Telegram.");
  }
  const blob = await response.blob();
  return {
    blob,
    filename: filenameFrom(response.headers.get("content-disposition"), `evidence-${evidenceId}`),
    kind: blob.type.startsWith("video/") ? "video" : "image",
  };
}

/** Saves the file to the user's computer, then releases it from memory. */
export function saveEvidenceFile(file: EvidenceMediaFile): void {
  const url = URL.createObjectURL(file.blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = file.filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
