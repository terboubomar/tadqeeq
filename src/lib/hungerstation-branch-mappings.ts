import { supabase } from "@/integrations/supabase/client";

export interface HungerStationBranchMappingInput {
  hsBranchId: string;
  invoiceBranchName: string;
}

export async function listHungerStationBranchMappings(): Promise<
  Record<string, string>
> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const userId = auth.user?.id;
  if (!userId) {
    throw new Error("الجلسة منتهية؛ تعذّر قراءة ربط فروع هنقرستيشن.");
  }

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

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const userId = auth.user?.id;
  if (!userId) {
    throw new Error("الجلسة منتهية؛ تعذّر حفظ ربط فروع هنقرستيشن.");
  }

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
  const { error } = await supabase
    .from("hungerstation_branch_mappings")
    .upsert(
      cleaned.map((mapping) => ({
        user_id: userId,
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
