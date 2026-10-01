import { supabase } from "@/integrations/supabase/client";
import { branchSaveErrorMessage } from "./branch-registry-errors";
import { getMyWorkspaceContext } from "./workspace-access.functions";

export interface RegistryBranch {
  id: string;
  name: string;
  hungerstation_id: string | null;
  keeta_id: string | null;
  jahez_id: string | null;
}

export type BranchInput = Omit<RegistryBranch, "id"> & { id?: string };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = () => (supabase as any).from("branch_registry");

export async function listBranchRegistry(): Promise<RegistryBranch[]> {
  const { data, error } = await table()
    .select("id,name,hungerstation_id,keeta_id,jahez_id")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as RegistryBranch[];
}

const clean = (v: string | null) => (v && v.trim() ? v.trim() : null);

export async function saveRegistryBranch(input: BranchInput): Promise<void> {
  const workspace = await getMyWorkspaceContext({ data: {} });
  if (!workspace.permissions.includes("branches.manage")) {
    throw new Error("ليس لديك صلاحية لتعديل الفروع.");
  }
  const row = {
    user_id: workspace.dataOwnerUserId,
    workspace_id: workspace.workspaceId,
    name: input.name.trim(),
    hungerstation_id: clean(input.hungerstation_id),
    keeta_id: clean(input.keeta_id),
    jahez_id: clean(input.jahez_id),
    updated_at: new Date().toISOString(),
  };
  if (!row.name) throw new Error("اسم الفرع مطلوب.");
  const { error } = input.id
    ? await table().update(row).eq("id", input.id)
    : await table().insert(row);
  if (error) throw new Error(branchSaveErrorMessage(error, row));
}


export async function deleteRegistryBranch(id: string): Promise<void> {
  const workspace = await getMyWorkspaceContext({ data: {} });
  if (!workspace.permissions.includes("branches.manage")) {
    throw new Error("ليس لديك صلاحية لحذف الفروع.");
  }
  const { error } = await table().delete().eq("id", id);
  if (error) throw new Error(error.message);
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
