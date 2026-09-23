import { buildPeriodExceptions } from "./exceptions";
import type { StoredPeriod } from "./periods";
import { requireServerUser } from "./server-auth.server";
import { safeStorageFileName, sha256Hex } from "./source-file-utils";
import { MAX_UPLOAD_SIZE_BYTES } from "./upload-validation";

export interface RecoveryCaseDetail {
  id: string;
  lineageId: string;
  exceptionId: string;
  sourcePeriodId: string;
  platformCaseReference: string | null;
  approvedClaimAmount: number | null;
  submittedAmount: number | null;
  acceptedAmount: number | null;
  submittedOn: string | null;
  responseOn: string | null;
  recoveredOn: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface RecoveryCaseDocument {
  id: string;
  recoveryCaseId: string;
  lineageId: string;
  exceptionId: string;
  originalName: string;
  sha256: string;
  sizeBytes: number;
  createdAt: string;
}

export interface RecoveryCaseEvent {
  id: string;
  recoveryCaseId: string;
  exceptionId: string;
  eventType: "insert" | "update";
  createdAt: string;
}

export interface SaveRecoveryCaseDetailInput {
  periodId: string;
  exceptionId: string;
  platformCaseReference?: string | null;
  approvedClaimAmount?: number | null;
  submittedAmount?: number | null;
  acceptedAmount?: number | null;
  submittedOn?: string | null;
  responseOn?: string | null;
  recoveredOn?: string | null;
}

function moneyOrNull(value: number | null | undefined): number | null {
  return value == null ? null : Math.round(value * 100) / 100;
}

function assertNonNegative(value: number | null, label: string): void {
  if (value != null && (!Number.isFinite(value) || value < 0)) {
    throw new Error(label + " يجب أن يكون مبلغاً صالحاً غير سالب.");
  }
}

function mapDetail(row: {
  id: string;
  lineage_id: string;
  exception_id: string;
  source_period_id: string;
  platform_case_reference: string | null;
  approved_claim_amount: number | null;
  submitted_amount: number | null;
  accepted_amount: number | null;
  submitted_on: string | null;
  response_on: string | null;
  recovered_on: string | null;
  created_at: string;
  updated_at: string;
}): RecoveryCaseDetail {
  return {
    id: row.id,
    lineageId: row.lineage_id,
    exceptionId: row.exception_id,
    sourcePeriodId: row.source_period_id,
    platformCaseReference: row.platform_case_reference,
    approvedClaimAmount: row.approved_claim_amount,
    submittedAmount: row.submitted_amount,
    acceptedAmount: row.accepted_amount,
    submittedOn: row.submitted_on,
    responseOn: row.response_on,
    recoveredOn: row.recovered_on,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listRecoveryCaseDetailsOnServer(): Promise<{
  details: RecoveryCaseDetail[];
  events: RecoveryCaseEvent[];
  documents: RecoveryCaseDocument[];
}> {
  const { client, userId } = await requireServerUser();

  const [
    { data: detailRows, error: detailError },
    { data: eventRows, error: eventError },
    { data: documentRows, error: documentError },
  ] = await Promise.all([
      client
        .from("recovery_case_details")
        .select(
          "id, lineage_id, exception_id, source_period_id, platform_case_reference, approved_claim_amount, submitted_amount, accepted_amount, submitted_on, response_on, recovered_on, created_at, updated_at",
        )
        .eq("user_id", userId)
        .order("updated_at", { ascending: false }),
      client
        .from("recovery_case_events")
        .select(
          "id, recovery_case_id, exception_id, event_type, created_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(500),
      client
        .from("recovery_case_documents")
        .select(
          "id, recovery_case_id, lineage_id, exception_id, original_name, sha256, size_bytes, created_at",
        )
        .eq("user_id", userId)
        .order("created_at", { ascending: false }),
    ]);

  if (detailError) throw new Error(detailError.message);
  if (eventError) throw new Error(eventError.message);
  if (documentError) throw new Error(documentError.message);

  return {
    details: (detailRows ?? []).map(mapDetail),
    events: (eventRows ?? []).map((row) => ({
      id: row.id,
      recoveryCaseId: row.recovery_case_id,
      exceptionId: row.exception_id,
      eventType: row.event_type as "insert" | "update",
      createdAt: row.created_at,
    })),
    documents: (documentRows ?? []).map((row) => ({
      id: row.id,
      recoveryCaseId: row.recovery_case_id,
      lineageId: row.lineage_id,
      exceptionId: row.exception_id,
      originalName: row.original_name,
      sha256: row.sha256,
      sizeBytes: row.size_bytes,
      createdAt: row.created_at,
    })),
  };
}

export async function saveRecoveryCaseDetailOnServer(
  input: SaveRecoveryCaseDetailInput,
): Promise<RecoveryCaseDetail> {
  const { client, userId } = await requireServerUser();

  const { data: rawPeriod, error: periodError } = await client
    .from("periods")
    .select("*")
    .eq("id", input.periodId)
    .eq("user_id", userId)
    .maybeSingle();

  if (periodError) throw new Error(periodError.message);
  if (!rawPeriod) throw new Error("تعذّر العثور على فترة التدقيق.");

  const period = rawPeriod as unknown as StoredPeriod;
  const exception = buildPeriodExceptions(period).find(
    (item) => item.id === input.exceptionId,
  );

  if (!exception) {
    throw new Error(
      "تعذّر العثور على الاستثناء في نتيجة التدقيق الحالية لهذه الفترة.",
    );
  }
  if (exception.potentialRecovery <= 0) {
    throw new Error(
      "هذا الاستثناء لا يحتوي على استرداد محتمل مستقل يمكن تحويله إلى مطالبة.",
    );
  }

  const approvedClaimAmount = moneyOrNull(input.approvedClaimAmount);
  const submittedAmount = moneyOrNull(input.submittedAmount);
  const acceptedAmount = moneyOrNull(input.acceptedAmount);
  assertNonNegative(approvedClaimAmount, "المبلغ المعتمد");
  assertNonNegative(submittedAmount, "المبلغ المرسل");
  assertNonNegative(acceptedAmount, "المبلغ المقبول");

  const maxClaim = Math.round(exception.potentialRecovery * 100) / 100;
  if (approvedClaimAmount != null && approvedClaimAmount > maxClaim) {
    throw new Error(
      "المبلغ المعتمد لا يمكن أن يتجاوز الاسترداد المحتمل الذي حسبه Tadqeeq.",
    );
  }
  if (submittedAmount != null) {
    if (approvedClaimAmount == null) {
      throw new Error("اعتمد مبلغ المطالبة قبل تسجيل المبلغ المرسل.");
    }
    if (submittedAmount > approvedClaimAmount) {
      throw new Error("المبلغ المرسل لا يمكن أن يتجاوز المبلغ المعتمد.");
    }
  }
  if (acceptedAmount != null) {
    if (submittedAmount == null) {
      throw new Error("سجّل المبلغ المرسل قبل تسجيل المبلغ المقبول.");
    }
    if (acceptedAmount > submittedAmount) {
      throw new Error("المبلغ المقبول لا يمكن أن يتجاوز المبلغ المرسل.");
    }
  }

  const platformCaseReference =
    input.platformCaseReference?.trim() || null;
  const submittedOn = input.submittedOn ?? null;
  const responseOn = input.responseOn ?? null;
  const recoveredOn = input.recoveredOn ?? null;

  if (responseOn && submittedOn && responseOn < submittedOn) {
    throw new Error("تاريخ الرد لا يمكن أن يسبق تاريخ إرسال المطالبة.");
  }
  if (recoveredOn && responseOn && recoveredOn < responseOn) {
    throw new Error("تاريخ الاسترداد لا يمكن أن يسبق تاريخ رد المنصة.");
  }

  const lineageId = period.lineage_id ?? period.id;

  const { data, error } = await client
    .from("recovery_case_details")
    .upsert(
      {
        user_id: userId,
        lineage_id: lineageId,
        exception_id: exception.id,
        source_period_id: period.id,
        platform_case_reference: platformCaseReference,
        approved_claim_amount: approvedClaimAmount,
        submitted_amount: submittedAmount,
        accepted_amount: acceptedAmount,
        submitted_on: submittedOn,
        response_on: responseOn,
        recovered_on: recoveredOn,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,lineage_id,exception_id" },
    )
    .select(
      "id, lineage_id, exception_id, source_period_id, platform_case_reference, approved_claim_amount, submitted_amount, accepted_amount, submitted_on, response_on, recovered_on, created_at, updated_at",
    )
    .single();

  if (error) throw new Error(error.message);
  return mapDetail(data);
}


const RECOVERY_CASE_BUCKET = "recovery-case-files";
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

function recoveryDocumentExtension(name: string): string {
  const parts = name.trim().toLowerCase().split(".");
  return parts.length > 1 ? parts.at(-1) ?? "" : "";
}

export async function uploadRecoveryCaseDocumentOnServer(
  formData: FormData,
): Promise<{ documentId: string; sha256: string }> {
  const { client, userId } = await requireServerUser();
  const recoveryCaseId = String(formData.get("recoveryCaseId") ?? "").trim();
  const file = formData.get("file");

  if (!recoveryCaseId) {
    throw new Error("احفظ تفاصيل المطالبة قبل رفع المستند.");
  }
  if (!(file instanceof File)) {
    throw new Error("اختر مستنداً صالحاً للرفع.");
  }
  if (file.size <= 0 || file.size > MAX_UPLOAD_SIZE_BYTES) {
    throw new Error("حجم مستند المطالبة غير صالح أو يتجاوز 25 MB.");
  }
  if (!RECOVERY_DOCUMENT_EXTENSIONS.has(recoveryDocumentExtension(file.name))) {
    throw new Error(
      "صيغة المستند غير مدعومة. استخدم PDF أو Word أو Excel أو CSV أو صورة.",
    );
  }

  const { data: detail, error: detailError } = await client
    .from("recovery_case_details")
    .select("id, lineage_id, exception_id")
    .eq("id", recoveryCaseId)
    .eq("user_id", userId)
    .maybeSingle();

  if (detailError) throw new Error(detailError.message);
  if (!detail) throw new Error("تعذّر العثور على تفاصيل المطالبة.");

  const sha256 = await sha256Hex(file);
  const { data: existing, error: duplicateError } = await client
    .from("recovery_case_documents")
    .select("id")
    .eq("user_id", userId)
    .eq("recovery_case_id", recoveryCaseId)
    .eq("sha256", sha256)
    .limit(1)
    .maybeSingle();

  if (duplicateError) throw new Error(duplicateError.message);
  if (existing) throw new Error("هذا المستند مرفوع مسبقاً لهذه المطالبة.");

  const documentId = crypto.randomUUID();
  const storagePath = [
    userId,
    detail.lineage_id,
    detail.exception_id,
    `${documentId}-${safeStorageFileName(file.name)}`,
  ].join("/");

  const { error: uploadError } = await client.storage
    .from(RECOVERY_CASE_BUCKET)
    .upload(storagePath, file, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });

  if (uploadError) {
    throw new Error("تعذّر حفظ مستند المطالبة في التخزين الخاص.");
  }

  const { error: metadataError } = await client
    .from("recovery_case_documents")
    .insert({
      id: documentId,
      user_id: userId,
      recovery_case_id: recoveryCaseId,
      lineage_id: detail.lineage_id,
      exception_id: detail.exception_id,
      original_name: file.name.trim(),
      sha256,
      size_bytes: file.size,
      storage_path: storagePath,
    });

  if (metadataError) {
    const { error: cleanupError } = await client.storage
      .from(RECOVERY_CASE_BUCKET)
      .remove([storagePath]);

    if (cleanupError) {
      console.error("Failed to clean up orphan recovery case document", {
        documentId,
        storagePath,
        cleanupError: cleanupError.message,
      });
    }
    throw new Error(metadataError.message);
  }

  return { documentId, sha256 };
}
