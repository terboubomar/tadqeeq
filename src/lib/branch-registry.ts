import { supabase } from "@/integrations/supabase/client";

export interface RegistryBranch {
  id: string;
  name: string;
  hungerstation_id: string | null;
  keeta_id: string | null;
  jahez_id: string | null;\n  ninja_id: string | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from("branch_registry");

export async function listBranchRegistry(): Promise<RegistryBranch[]> {
  const { data, error } = await table()
    .select("id,name,hungerstation_id,keeta_id,jahez_id,ninja_id")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as RegistryBranch[];
}

const norm = (v: unknown) => String(v ?? "").trim().toLocaleLowerCase();

/** Returns the unified branch name for a platform row, matching by ID first then by name. */
export function resolveBranchName(
  registry: RegistryBranch[],
  platform: "hungerstation" | "keeta" | "jahez" | "ninja",
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
