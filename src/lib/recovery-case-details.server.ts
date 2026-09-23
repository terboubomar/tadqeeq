import { buildPeriodExceptions } from "./exceptions";
import type { StoredPeriod } from "./periods";
import { requireServerUser } from "./server-auth.server";

export interface RecoveryCaseDetail {
  id: string;
  lineageId: string;
  exceptionId: string;
  sourcePeriodId: string;
  platformCaseReference: string | null;
  approvedClaimAmount: number | null;
  submittedAmount: number | null;
  acceptedAmount: number | null;
  createdAt: string;
  updatedAt: string;
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listRecoveryCaseDetailsOnServer(): Promise<{
  details: RecoveryCaseDetail[];
  events: RecoveryCaseEvent[];
}> {
  const { client, userId } = await requireServerUser();

  const [{ data: detailRows, error: detailError }, { data: eventRows, error: eventError }] =
    await Promise.all([
      client
        .from("recovery_case_details")
        .select(
          "id, lineage_id, exception_id, source_period_id, platform_case_reference, approved_claim_amount, submitted_amount, accepted_amount, created_at, updated_at",
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
    ]);

  if (detailError) throw new Error(detailError.message);
  if (eventError) throw new Error(eventError.message);

  return {
    details: (detailRows ?? []).map(mapDetail),
    events: (eventRows ?? []).map((row) => ({
      id: row.id,
      recoveryCaseId: row.recovery_case_id,
      exceptionId: row.exception_id,
      eventType: row.event_type as "insert" | "update",
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
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id,lineage_id,exception_id" },
    )
    .select(
      "id, lineage_id, exception_id, source_period_id, platform_case_reference, approved_claim_amount, submitted_amount, accepted_amount, created_at, updated_at",
    )
    .single();

  if (error) throw new Error(error.message);
  return mapDetail(data);
}
