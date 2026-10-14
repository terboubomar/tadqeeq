import { supabase } from "@/integrations/supabase/client";

import type { ClassificationRule } from "./exception-recovery";
import type { ExceptionAttachment } from "./exceptions";
import { EXCEPTION_DOCUMENT_MAX_BYTES } from "./limits";

const BUCKET = "exception-documents";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rules = () => (supabase as any).from("exception_classification_rules");

function missingTable(message: string) {
  return /exception_classification_rules|does not exist|schema cache/i.test(message);
}

/** The workspace's classification rules (migration 0059); empty when the table is not there yet. */
export async function listClassificationRules(): Promise<ClassificationRule[]> {
  const { data, error } = await rules()
    .select("id,platform,match_text,classification,commissionable,claimable,note")
    .order("created_at");
  if (error) {
    if (missingTable(String(error.message))) return [];
    throw new Error(error.message);
  }
  return (data ?? []) as ClassificationRule[];
}

export async function addClassificationRule(rule: Omit<ClassificationRule, "id">): Promise<void> {
  const { error } = await rules().insert(rule);
  if (!error) return;
  if (missingTable(String(error.message))) throw new Error("قواعد التصنيف تحتاج تحديث قاعدة البيانات (الترحيل 0059).");
  throw new Error(error.message.includes("row-level security") ? "إضافة القواعد تحتاج صلاحية إدارة الاستثناءات." : error.message);
}

export async function deleteClassificationRule(id: string): Promise<void> {
  const { error } = await rules().delete().eq("id", id);
  if (error) throw new Error(error.message);
}

const safeName = (name: string) => name.replace(/[^\p{L}\p{N}._-]+/gu, "-").slice(-80) || "document";

/** Uploads a document for an exception under <workspace>/<period>/<exception>/ and returns its attachment record. */
export async function uploadExceptionDocument(
  workspaceId: string,
  periodId: string,
  exceptionId: string,
  file: File,
): Promise<ExceptionAttachment> {
  if (file.size > EXCEPTION_DOCUMENT_MAX_BYTES) throw new Error("حجم المستند أكبر من 20 ميجابايت.");
  const folder = exceptionId.replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 80) || "exception";
  const path = `${workspaceId}/${periodId}/${folder}/${Date.now()}-${safeName(file.name)}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false, contentType: file.type || undefined });
  if (error) {
    if (/bucket not found/i.test(error.message)) throw new Error("إرفاق المستندات يحتاج تحديث قاعدة البيانات (الترحيل 0059).");
    throw new Error(error.message);
  }
  return { path, name: file.name, uploadedAt: new Date().toISOString() };
}

/** A short-lived link to open an attached document. */
export async function exceptionDocumentUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 300);
  if (error || !data?.signedUrl) throw new Error(error?.message ?? "تعذّر فتح المستند.");
  return data.signedUrl;
}
