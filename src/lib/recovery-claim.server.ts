import type { RecoveryDocumentRecord } from "./recovery-claim";
import { requireServerUser } from "./server-auth.server";
import { safeStorageFileName, sha256Hex } from "./source-file-utils";
import { MAX_UPLOAD_SIZE_BYTES } from "./upload-validation";

const RECOVERY_DOCUMENT_BUCKET = "recovery-files";
const RECOVERY_DOCUMENT_EXTENSIONS = new Set([
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "csv",
  "png",
  "jpg",
  "jpeg",
]);

function fileExtension(name: string): string {
  const parts = name.trim().toLowerCase().split(".");
  return parts.length > 1 ? parts.at(-1) ?? "" : "";
}

async function assertOwnedPeriod(
  client: Awaited<ReturnType<typeof requireServerUser>>["client"],
  userId: string,
  periodId: string,
) {
  const { data, error } = await client
    .from("periods")
    .select("id")
    .eq("id", periodId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("تعذّر العثور على فترة التدقيق.");
}

export async function listRecoveryDocumentsOnServer(): Promise<
  RecoveryDocumentRecord[]
> {
  const { client, userId } = await requireServerUser();
  const { data, error } = await client
    .from("recovery_documents")
    .select("id, period_id, exception_id, original_name, sha256, size_bytes, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  return (data ?? []).map((row) => ({
    id: row.id,
    periodId: row.period_id,
    exceptionId: row.exception_id,
    originalName: row.original_name,
    sha256: row.sha256,
    sizeBytes: row.size_bytes,
    createdAt: row.created_at,
  }));
}

export async function uploadRecoveryDocumentOnServer(
  formData: FormData,
): Promise<{ documentId: string; sha256: string }> {
  const { client, userId } = await requireServerUser();
  const periodId = String(formData.get("periodId") ?? "").trim();
  const exceptionId = String(formData.get("exceptionId") ?? "").trim();
  const file = formData.get("file");

  if (!periodId || !exceptionId) {
    throw new Error("بيانات حالة الاسترداد غير مكتملة.");
  }
  if (!(file instanceof File)) {
    throw new Error("اختر مستنداً صالحاً للرفع.");
  }
  if (file.size <= 0 || file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error("حجم المستند غير صالح أو يتجاوز 25 MB.");
  }
  if (!RECOVERY_DOCUMENT_EXTENSIONS.has(fileExtension(file.name))) {
    throw new Error(
      "صيغة المستند غير مدعومة. استخدم PDF أو Word أو Excel أو CSV أو صورة.",
    );
  }

  await assertOwnedPeriod(client, userId, periodId);
  const sha256 = await sha256Hex(file);

  const { data: existing, error: duplicateError } = await client
    .from("recovery_documents")
    .select("id")
    .eq("user_id", userId)
    .eq("period_id", periodId)
    .eq("exception_id", exceptionId)
    .eq("sha256", sha256)
    .limit(1)
    .maybeSingle();

  if (duplicateError) throw new Error(duplicateError.message);
  if (existing) throw new Error("هذا المستند مرفوع مسبقاً لهذه الحالة.");

  const documentId = crypto.randomUUID();
  const storagePath = [
    userId,
    periodId,
    exceptionId,
    `${documentId}-${safeStorageFileName(file.name)}`,
  ].join("/");

  const { error: uploadError } = await client.storage
    .from(RECOVERY_DOCUMENT_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    throw new Error("تعذّر حفظ مستند المطالبة في التخزين الخاص.");
  }

  const { error: metadataError } = await client.from("recovery_documents").insert({
    id: documentId,
    user_id: userId,
    period_id: periodId,
    exception_id: exceptionId,
    original_name: file.name.trim(),
    sha256,
    size_bytes: file.size,
    storage_path: storagePath,
  });

  if (metadataError) {
    const { error: cleanupError } = await client.storage
      .from(RECOVERY_DOCUMENT_BUCKET)
      .remove([storagePath]);

    if (cleanupError) {
      console.error("Failed to clean up orphan recovery document", {
        documentId,
        storagePath,
        cleanupError: cleanupError.message,
      });
    }
    throw new Error(metadataError.message);
  }

  return { documentId, sha256 };
}
