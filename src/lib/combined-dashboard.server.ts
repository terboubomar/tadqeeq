import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { combinedAccess, type CombinedDashboardData, type CombinedPeriod, type ExcludedCompany } from "./combined-dashboard";
import { featuresWithAddons, isPlanAddon, isPlanFeature } from "./plans";
import { requireServerUserAnyStatus } from "./server-auth.server";
import type { WorkspaceRole } from "./workspace-access";

const PERIOD_COLUMNS = "id,workspace_id,label,platform,period_start,period_end,created_at,summary";

/**
 * Saved periods of every company the signed-in user can see in full, for the executive dashboard's combined view.
 * Row-level security only opens the company the user is working in, so the other companies are read with the
 * service role after checking the user's membership, role, plan and account status in each (see combinedAccess).
 */
export async function getCombinedDashboardOnServer(): Promise<CombinedDashboardData> {
  const auth = await requireServerUserAnyStatus();
  const { data: memberships, error } = await auth.client
    .from("workspace_members")
    .select("workspace_id,role,workspaces(id,name)")
    .eq("user_id", auth.actorUserId)
    .eq("status", "active")
    .order("created_at", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = ((memberships ?? []) as Array<Record<string, unknown>>).flatMap((row) => {
    const workspace = row["workspaces"] as { id?: string; name?: string } | null;
    return workspace?.id && workspace.name ? [{ id: workspace.id, name: workspace.name, role: row["role"] as WorkspaceRole }] : [];
  });
  const ids = rows.map((row) => row.id);
  if (!ids.length) return { companies: [], excluded: [], periods: [] };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = supabaseAdmin as any;
  const rpc = auth.client as unknown as { rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown }> };
  const [{ data: onboarding }, plans] = await Promise.all([
    db.from("workspace_onboarding").select("workspace_id,status").in("workspace_id", ids),
    Promise.all(ids.map((id) => rpc.rpc("my_workspace_plan", { p_workspace_id: id }))),
  ]);
  const statusOf = new Map(((onboarding ?? []) as Array<{ workspace_id: string; status: string }>).map((r) => [r.workspace_id, r.status]));

  const companies: CombinedDashboardData["companies"] = [];
  const excluded: ExcludedCompany[] = [];
  rows.forEach((row, index) => {
    const plan = (plans[index]?.data ?? {}) as Record<string, unknown>;
    const rawFeatures = plan["features"];
    const addons = Array.isArray(plan["addons"]) ? plan["addons"].filter(isPlanAddon) : [];
    const access = combinedAccess({
      role: row.role,
      onboardingStatus: statusOf.get(row.id) ?? "active",
      isPlatformAdmin: auth.isPlatformAdmin,
      planFeatures: featuresWithAddons(Array.isArray(rawFeatures) ? rawFeatures.filter(isPlanFeature) : null, addons),
    });
    if (access.included) companies.push({ id: row.id, name: row.name, current: row.id === auth.workspaceId });
    else excluded.push({ name: row.name, reason: access.reason });
  });
  if (!companies.length) return { companies, excluded, periods: [] };

  const { data: periods, error: periodsError } = await db
    .from("periods")
    .select(PERIOD_COLUMNS)
    .in("workspace_id", companies.map((c) => c.id))
    .is("superseded_at", null);
  if (periodsError) throw new Error(periodsError.message);

  return {
    companies,
    excluded,
    periods: ((periods ?? []) as Array<Record<string, unknown>>).map(
      ({ workspace_id, ...rest }) => ({ ...rest, workspaceId: String(workspace_id) }) as CombinedPeriod,
    ),
  };
}
