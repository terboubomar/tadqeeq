import { supabase } from "@/integrations/supabase/client";

export interface RegistryBranch {
  id: string;
  name: string;
  hungerstation_id: string | null;
  keeta_id: string | null;
  jahez_id: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from("branch_registry");

export async function listBranchRegistry(): Promise<RegistryBranch[]> {
  const { data, error } = await table()
    .select("id,name,hungerstation_id,keeta_id,jahez_id")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as RegistryBranch[];
}

const norm = (v: unknown) => String(v ?? "").trim().toLocaleLowerCase();

/** Returns the unified branch name for a platform row, matching by ID first then by name. */
export function resolveBranchName(
  registry: RegistryBranch[],
  platform: "hungerstation" | "keeta" | "jahez",
  branchId: unknown,
  branchName: unknown,
): string | null {
  const key = `${platform}_id` as const;
  const id = norm(branchId);
  const name = norm(branchName);
  const hit =
    (id && registry.find((b) => norm(b[key]) === id)) ||
    (name && registry.find((b) => norm(b[key]) === name || norm(b.name) === name));
  return hit ? hit.name : null;
}

/**
 * Folds one branch into another (migration 0058): the kept branch takes the other's platform ids, team access,
 * Telegram groups, evidence and cases. Needs branches.manage.
 */
export async function mergeBranches(sourceId: string, targetId: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any).rpc("merge_branches", { p_source: sourceId, p_target: targetId });
  if (!error) return;
  const message = String(error.message ?? "");
  if (message.includes("same platform")) throw new Error("الفرعان مرتبطان بمعرّفين مختلفين على المنصة نفسها، فهما فرعان مختلفان.");
  if (message.includes("not allowed")) throw new Error("دمج الفروع يحتاج صلاحية إدارة الفروع.");
  if (message.includes("merge_branches") && message.includes("does not exist")) {
    throw new Error("ميزة دمج الفروع تحتاج تحديث قاعدة البيانات (الترحيل 0058) قبل استخدامها.");
  }
  throw new Error(message || "تعذّر دمج الفرعين.");
}
