import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { requireWorkspacePermission } from "./server-auth.server";

export const PERIOD_RENAMED_EVENT = "period.renamed";

export interface PeriodRename {
  from: string;
  to: string;
  by: string;
  at: string;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = () => supabaseAdmin as any;

/**
 * Renames a saved period and records who changed it, from what to what. Only the name changes: the period's
 * figures, dates and files stay as they are. Members cannot write periods through the database API (migration
 * 0042), so the server writes with the service role after checking periods.reanalyze in this workspace.
 */
export async function renamePeriodOnServer(periodId: string, name: string): Promise<{ label: string }> {
  const auth = await requireWorkspacePermission("periods.reanalyze");
  const label = name.trim();
  if (label.length < 1 || label.length > 120) throw new Error("اسم الفترة يجب أن يكون بين حرف و120 حرفاً.");

  const { data: period, error } = await db()
    .from("periods")
    .select("id,label,lineage_id,platform,period_start,period_end")
    .eq("id", periodId)
    .eq("workspace_id", auth.workspaceId)
    .is("superseded_at", null)
    .maybeSingle();
  if (error) throw new Error("تعذّر قراءة الفترة.");
  if (!period) throw new Error("الفترة غير موجودة أو استُبدلت بإصدار أحدث. حدّث الصفحة.");
  if (period.label === label) return { label };

  const { error: updateError } = await db().from("periods").update({ label }).eq("id", periodId).eq("workspace_id", auth.workspaceId);
  if (updateError) throw new Error("تعذّر تغيير اسم الفترة.");

  const { error: auditError } = await db().from("workspace_audit_events").insert({
    workspace_id: auth.workspaceId,
    actor_user_id: auth.actorUserId,
    event_type: PERIOD_RENAMED_EVENT,
    entity_type: "period",
    // The lineage keeps the history across re-analysis, which saves the period under a new id with the same name.
    entity_id: period.lineage_id ?? period.id,
    metadata: { periodId, from: period.label, to: label, platform: period.platform, periodStart: period.period_start, periodEnd: period.period_end },
  });
  if (auditError) {
    // No rename without its record: put the old name back.
    await db().from("periods").update({ label: period.label }).eq("id", periodId).eq("workspace_id", auth.workspaceId);
    throw new Error("تعذّر تسجيل تغيير الاسم، فلم يُغيَّر. حاول مرة أخرى.");
  }
  return { label };
}

/** The period's earlier names, newest first. */
export async function listPeriodRenamesOnServer(periodId: string): Promise<PeriodRename[]> {
  const auth = await requireWorkspacePermission("periods.read");
  const { data: period, error } = await db()
    .from("periods")
    .select("id,lineage_id")
    .eq("id", periodId)
    .eq("workspace_id", auth.workspaceId)
    .maybeSingle();
  if (error) throw new Error("تعذّر قراءة سجل الاسم.");
  if (!period) return [];

  const { data: events, error: eventsError } = await db()
    .from("workspace_audit_events")
    .select("actor_user_id,metadata,created_at")
    .eq("workspace_id", auth.workspaceId)
    .eq("event_type", PERIOD_RENAMED_EVENT)
    .eq("entity_type", "period")
    .eq("entity_id", period.lineage_id ?? period.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (eventsError) throw new Error("تعذّر قراءة سجل الاسم.");
  const rows = (events ?? []) as Array<{ actor_user_id: string; metadata: Record<string, unknown> | null; created_at: string }>;

  const actorIds = [...new Set(rows.map((row) => row.actor_user_id))];
  const names = new Map<string, string>();
  if (actorIds.length) {
    const { data: profiles } = await db().from("profiles").select("id,full_name,email").in("id", actorIds);
    for (const profile of (profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
      names.set(profile.id, profile.full_name?.trim() || profile.email || "");
    }
  }

  return rows.map((row) => ({
    from: String(row.metadata?.["from"] ?? ""),
    to: String(row.metadata?.["to"] ?? ""),
    by: names.get(row.actor_user_id) || "عضو في الفريق",
    at: row.created_at,
  }));
}
