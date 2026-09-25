import { supabase } from "@/integrations/supabase/client";
import { getMyWorkspaceContext } from "./workspace-access.functions";

export interface HungerStationBranchMappingInput {
  hsBranchId: string;
  invoiceBranchName: string;
}

export async function listHungerStationBranchMappings(): Promise<
  Record<string, string>
> {
  const workspace = await getMyWorkspaceContext({ data: {} });
  const userId = workspace.dataOwnerUserId;

  const { data, error } = await supabase
    .from("hungerstation_branch_mappings")
    .select("hs_branch_id, invoice_branch_name")
    .eq("user_id", userId);

  if (error) throw new Error(error.message);

  return Object.fromEntries(
    (data ?? [])
      .map((row) => [
        row.hs_branch_id.trim(),
        row.invoice_branch_name.trim(),
      ] as const)
      .filter(([branchId, invoiceName]) => branchId && invoiceName),
  );
}

export async function saveHungerStationBranchMappings(
  mappings: HungerStationBranchMappingInput[],
): Promise<void> {
  if (!mappings.length) return;

  const workspace = await getMyWorkspaceContext({ data: {} });
  if (!workspace.permissions.includes("imports.create")) {
    throw new Error("ليس لديك صلاحية لتعديل ربط الفروع.");
  }
  const userId = workspace.dataOwnerUserId;

  const cleaned = mappings.map((mapping) => ({
    hsBranchId: mapping.hsBranchId.trim(),
    invoiceBranchName: mapping.invoiceBranchName.trim(),
  }));

  if (
    cleaned.some(
      (mapping) => !mapping.hsBranchId || !mapping.invoiceBranchName,
    )
  ) {
    throw new Error("ربط فرع هنقرستيشن غير مكتمل.");
  }

  if (new Set(cleaned.map((mapping) => mapping.hsBranchId)).size !== cleaned.length) {
    throw new Error("لا يمكن حفظ أكثر من ربط لنفس HS Branch ID.");
  }

  const normalizedInvoiceNames = cleaned.map((mapping) =>
    mapping.invoiceBranchName.toLocaleLowerCase(),
  );
  if (new Set(normalizedInvoiceNames).size !== cleaned.length) {
    throw new Error("لا يمكن ربط أكثر من فرع بنفس اسم الفرع في الفاتورة.");
  }

  const now = new Date().toISOString();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabase as any;
  const { error } = await db
    .from("hungerstation_branch_mappings")
    .upsert(
      cleaned.map((mapping) => ({
        user_id: userId,
        workspace_id: workspace.workspaceId,
        hs_branch_id: mapping.hsBranchId,
        invoice_branch_name: mapping.invoiceBranchName,
        confirmed_at: now,
        updated_at: now,
      })),
      { onConflict: "user_id,hs_branch_id" },
    );

  if (error) {
    if (error.code === "23505") {
      throw new Error(
        "اسم فرع الفاتورة مرتبط مسبقاً بفرع هنقرستيشن آخر. راجع الربط ثم حاول مرة أخرى.",
      );
    }
    throw new Error(error.message);
  }
}
