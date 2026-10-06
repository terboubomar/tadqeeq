import type { BranchRow } from "./analysis/types";
import type { RegistryBranch } from "./branch-registry";

type Platform = "hungerstation" | "keeta" | "jahez";
export type RegistryIdKey = "hungerstation_id" | "keeta_id" | "jahez_id";

export interface RegistrySyncPlan {
  inserts: Array<{ name: string } & Partial<Record<RegistryIdKey, string>>>;
  updates: Array<{ id: string } & Partial<Record<RegistryIdKey, string>>>;
}

const norm = (value: string | null | undefined) => (value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase();

/**
 * Which branches an upload adds to the workspace's branch list (used for team branch access and unified
 * names). A branch already known by its platform id is left alone; a branch known by name only gets the
 * platform id; anything else is added. Nothing is renamed or removed, and invoice-only rows are ignored.
 */
export function planRegistrySync(existing: RegistryBranch[], platform: Platform, branches: BranchRow[]): RegistrySyncPlan {
  const key: RegistryIdKey = `${platform}_id`;
  const known = [...existing];
  const plan: RegistrySyncPlan = { inserts: [], updates: [] };

  for (const branch of branches) {
    const name = branch.branch?.trim().replace(/\s+/g, " ");
    if (!name || !(branch.orders > 0)) continue;
    const platformId = (branch.branchId ?? "").trim() || name;

    if (known.some((row) => norm(row[key]) === norm(platformId))) continue;

    const byName = known.find((row) => norm(row.name) === norm(name));
    if (byName) {
      // Same name already linked to another id on this platform: leave it for the team to sort out.
      if (byName[key]) continue;
      plan.updates.push({ id: byName.id, [key]: platformId });
      byName[key] = platformId;
      continue;
    }

    plan.inserts.push({ name, [key]: platformId });
    known.push({ id: `new:${known.length}`, name, hungerstation_id: null, keeta_id: null, jahez_id: null, [key]: platformId });
  }
  return plan;
}
