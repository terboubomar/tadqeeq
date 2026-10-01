/** Turns a branch save error into a clear message; duplicates name the platform ID that clashed. */
export function branchSaveErrorMessage(
  error: { code?: string; message?: string; details?: string },
  row: { hungerstation_id: string | null; keeta_id: string | null; jahez_id: string | null },
): string {
  if (error.code === "23505") {
    const msg = `${error.message ?? ""} ${error.details ?? ""}`;
    if (msg.includes("keeta")) return `معرّف كيتا ${row.keeta_id} مستخدم مسبقاً لفرع آخر.`;
    if (msg.includes("_hs_")) return `معرّف هنقرستيشن ${row.hungerstation_id} مستخدم مسبقاً لفرع آخر.`;
    if (msg.includes("jahez")) return `معرّف جاهز ${row.jahez_id} مستخدم مسبقاً لفرع آخر.`;
    return "يوجد فرع بنفس الاسم.";
  }
  return error.message ?? "تعذّر حفظ الفرع.";
}
