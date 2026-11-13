import { normalizeOrderLookupKey } from "../compensation-evidence";
import type { ServerUserAuth } from "../server-auth.server";
import { jahezClaimsFromAdjustments, jahezClaimText } from "./jahez-claims";
import type { OperationAdjustment } from "./types";

export interface JahezAutoCasesResult {
  created: number;
  existing: number;
  failed: number;
  /** The uploader cannot manage compensation cases (or the plan has no «استرداد»), so none were opened. */
  noPermission: boolean;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type LooseDb = { from: (table: string) => any };

/**
 * Opens a draft «استرداد» case for each order with Jahez deductions in an uploaded adjustments file, through the
 * app's own save (dispute text, duplicate rule, branch access). Orders that already have a case are skipped; the
 * order's Telegram evidence is attached when there is one. A failure on one order does not stop the upload.
 */
export async function openJahezCasesFromAdjustments(
  adjustments: readonly OperationAdjustment[],
  context: Pick<ServerUserAuth, "client" | "workspaceId" | "permissions" | "accessToken">,
): Promise<JahezAutoCasesResult> {
  const claims = jahezClaimsFromAdjustments(adjustments);
  const result: JahezAutoCasesResult = { created: 0, existing: 0, failed: 0, noPermission: false };
  if (!claims.length) return result;
  if (!context.permissions.includes("compensation.manage")) return { ...result, noPermission: true };

  const db = context.client as unknown as LooseDb;
  const orderIds = claims.map((claim) => claim.orderId);
  const [{ data: cases, error: casesError }, { data: evidence, error: evidenceError }] = await Promise.all([
    db
      .from("compensation_cases")
      .select("order_number")
      .eq("workspace_id", context.workspaceId)
      .eq("platform", "jahez")
      .in("order_number", orderIds),
    db
      .from("telegram_order_evidence")
      .select("id,order_lookup_key,captured_at")
      .eq("workspace_id", context.workspaceId)
      .in("order_lookup_key", orderIds.map(normalizeOrderLookupKey))
      .order("captured_at", { ascending: false }),
  ]);
  if (casesError || evidenceError) return { ...result, failed: claims.length };

  const caseOrders = new Set(((cases ?? []) as Array<{ order_number: string }>).map((row) => row.order_number.trim()));
  const evidenceByKey = new Map<string, string>();
  for (const row of (evidence ?? []) as Array<{ id: string; order_lookup_key: string }>) {
    if (!evidenceByKey.has(row.order_lookup_key)) evidenceByKey.set(row.order_lookup_key, row.id);
  }

  const { saveCompensationCaseOnServer } = await import("../compensation-evidence.server");
  for (const claim of claims) {
    if (caseOrders.has(claim.orderId)) {
      result.existing += 1;
      continue;
    }
    const text = jahezClaimText(claim);
    try {
      await saveCompensationCaseOnServer(
        {
          platform: "jahez",
          orderNumber: claim.orderId,
          branchName: claim.branchName,
          compensationAmount: claim.amount,
          compensationReason: text.reason,
          employeeExplanation: text.explanation,
          evidenceId: evidenceByKey.get(normalizeOrderLookupKey(claim.orderId)) ?? null,
          status: "draft",
        },
        context.accessToken,
      );
      result.created += 1;
    } catch {
      result.failed += 1;
    }
  }
  return result;
}
