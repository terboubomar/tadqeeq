import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { sendTemplateEmail } from "./email-templates/send-email";
import type { StoredPeriod } from "./periods";
import {
  buildReportDigest,
  describeTiming,
  isScheduleDue,
  MAX_RECIPIENTS,
  parseRecipients,
  riyadhToday,
  type ReportSchedule,
  type ScheduleFrequency,
} from "./report-schedules";
import { SITE_URL } from "./seo";
import { requireWorkspacePermission } from "./server-auth.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the generated types predate migration 0057
type LooseClient = { from: (table: string) => any };

const TABLE = "report_schedules";
const TABLE_MISSING = "جدولة التقارير تحتاج تحديث قاعدة البيانات (migration 0057).";
/** Only the summary is needed for the email; the full period rows stay in the database. */
const PERIOD_COLUMNS = "id,label,platform,period_start,period_end,created_at,summary";

type Row = Record<string, unknown>;

function tableError(error: { code?: string; message: string }): Error {
  if (error.code === "42P01" || (/report_schedules/.test(error.message) && /does not exist|schema cache/i.test(error.message))) {
    return new Error(TABLE_MISSING);
  }
  return new Error(error.message);
}

function fromRow(r: Row): ReportSchedule {
  return {
    id: String(r["id"]),
    workspaceId: String(r["workspace_id"]),
    name: String(r["name"]),
    frequency: r["frequency"] as ScheduleFrequency,
    dayOfMonth: r["day_of_month"] == null ? null : Number(r["day_of_month"]),
    weekday: r["weekday"] == null ? null : Number(r["weekday"]),
    recipients: Array.isArray(r["recipients"]) ? (r["recipients"] as string[]) : [],
    active: Boolean(r["active"]),
    lastSentAt: (r["last_sent_at"] as string | null) ?? null,
    lastPeriodId: (r["last_period_id"] as string | null) ?? null,
    lastError: (r["last_error"] as string | null) ?? null,
    createdAt: String(r["created_at"]),
  };
}

export interface SaveReportScheduleInput {
  id?: string;
  name: string;
  frequency: ScheduleFrequency;
  dayOfMonth: number | null;
  weekday: number | null;
  recipients: string;
  active: boolean;
}

export async function listReportSchedulesOnServer(): Promise<{ schedules: ReportSchedule[]; canManage: boolean }> {
  const { client, workspaceId, permissions } = await requireWorkspacePermission("reports.read");
  const { data, error } = await (client as unknown as LooseClient)
    .from(TABLE)
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true });
  if (error) throw tableError(error);
  return { schedules: ((data ?? []) as Row[]).map(fromRow), canManage: permissions.includes("users.manage") };
}

export async function saveReportScheduleOnServer(input: SaveReportScheduleInput): Promise<ReportSchedule> {
  // Recipients can be outside the workspace, so only owners and admins may set them.
  const { client, workspaceId, actorUserId } = await requireWorkspacePermission("users.manage");
  const { valid, invalid } = parseRecipients(input.recipients);
  if (invalid.length) throw new Error(`عناوين بريد غير صحيحة: ${invalid.join("، ")}`);
  if (!valid.length) throw new Error("أضف عنوان بريد واحداً على الأقل.");
  if (valid.length > MAX_RECIPIENTS) throw new Error(`الحد الأقصى ${MAX_RECIPIENTS} عناوين لكل جدولة.`);
  const name = input.name.trim().slice(0, 120);
  if (!name) throw new Error("اكتب اسماً للجدولة.");
  const row = {
    name,
    frequency: input.frequency,
    day_of_month: input.frequency === "monthly" ? Math.min(28, Math.max(1, input.dayOfMonth ?? 1)) : null,
    weekday: input.frequency === "weekly" ? Math.min(6, Math.max(0, input.weekday ?? 0)) : null,
    recipients: valid,
    active: input.active,
    updated_at: new Date().toISOString(),
  };
  const table = (client as unknown as LooseClient).from(TABLE);
  const { data, error } = input.id
    ? await table.update(row).eq("id", input.id).eq("workspace_id", workspaceId).select("*").single()
    : await table.insert({ ...row, workspace_id: workspaceId, created_by: actorUserId }).select("*").single();
  if (error) throw tableError(error);
  return fromRow(data as Row);
}

export async function deleteReportScheduleOnServer(id: string): Promise<void> {
  const { client, workspaceId } = await requireWorkspacePermission("users.manage");
  const { error } = await (client as unknown as LooseClient).from(TABLE).delete().eq("id", id).eq("workspace_id", workspaceId);
  if (error) throw tableError(error);
}

interface SendContext {
  schedule: ReportSchedule;
  workspaceName: string;
  periods: StoredPeriod[];
  /** Set for on-upload sends: the period that triggered it. */
  newPeriod: StoredPeriod | null;
  /** Part of each email's idempotency key, so a retried run does not send twice. */
  runKey: string;
}

/** Sends one schedule's email to each recipient; returns how many went out. */
async function sendSchedule({ schedule, workspaceName, periods, newPeriod, runKey }: SendContext): Promise<number> {
  const digest = buildReportDigest(periods, newPeriod);
  if (!digest) throw new Error("لا توجد فترات تدقيق محفوظة لإرسال ملخص عنها.");
  let sent = 0;
  for (const recipient of schedule.recipients) {
    const result = await sendTemplateEmail("report-summary", recipient, {
      templateData: {
        workspaceName,
        scheduleName: schedule.name,
        timing: describeTiming(schedule),
        digest,
        reportsUrl: `${SITE_URL}/trends`,
        manageUrl: `${SITE_URL}/report-schedules`,
      },
      idempotencyKey: `report-${schedule.id}-${runKey}-${recipient}`,
    });
    if (result.sent) sent += 1;
  }
  return sent;
}

/** "Send now" from the schedules page: the current summary to the schedule's recipients, without changing its timing. */
export async function sendReportScheduleNowOnServer(id: string): Promise<{ sent: number }> {
  const { client, workspaceId, workspaceName } = await requireWorkspacePermission("users.manage");
  const loose = client as unknown as LooseClient;
  const { data: row, error } = await loose.from(TABLE).select("*").eq("id", id).eq("workspace_id", workspaceId).maybeSingle();
  if (error) throw tableError(error);
  if (!row) throw new Error("الجدولة غير موجودة.");
  const { data: periods, error: periodsError } = await loose
    .from("periods")
    .select(PERIOD_COLUMNS)
    .eq("workspace_id", workspaceId)
    .is("superseded_at", null);
  if (periodsError) throw new Error(periodsError.message);
  const sent = await sendSchedule({
    schedule: fromRow(row as Row),
    workspaceName,
    periods: (periods ?? []) as StoredPeriod[],
    newPeriod: null,
    runKey: `manual-${Date.now()}`,
  });
  return { sent };
}

/**
 * The scheduled job: sends every active schedule that is due now (see isScheduleDue) and records the result.
 * Runs with the service role, called by the cron route; one failing schedule does not stop the others.
 */
export async function runDueReportSchedules(now: Date = new Date()): Promise<{ checked: number; sent: number; failed: number }> {
  const db = supabaseAdmin as unknown as LooseClient;
  const { data, error } = await db.from(TABLE).select("*").eq("active", true);
  if (error) throw tableError(error);
  const schedules = ((data ?? []) as Row[]).map(fromRow);
  const today = riyadhToday(now);
  let sent = 0;
  let failed = 0;

  const workspaceIds = [...new Set(schedules.map((s) => s.workspaceId))];
  for (const workspaceId of workspaceIds) {
    const [{ data: periods }, { data: workspace }] = await Promise.all([
      db.from("periods").select(PERIOD_COLUMNS).eq("workspace_id", workspaceId).is("superseded_at", null),
      db.from("workspaces").select("name").eq("id", workspaceId).maybeSingle(),
    ]);
    const list = (periods ?? []) as StoredPeriod[];
    const latest = [...list].sort((a, b) => b.created_at.localeCompare(a.created_at))[0] ?? null;
    for (const schedule of schedules.filter((s) => s.workspaceId === workspaceId)) {
      if (!isScheduleDue(schedule, now, latest)) continue;
      const onUpload = schedule.frequency === "on_upload";
      try {
        sent += await sendSchedule({
          schedule,
          workspaceName: String((workspace as Row | null)?.["name"] ?? "تدقيق"),
          periods: list,
          newPeriod: onUpload ? latest : null,
          runKey: onUpload ? `period-${latest?.id}` : today.date,
        });
        await db
          .from(TABLE)
          .update({ last_sent_at: now.toISOString(), last_period_id: latest?.id ?? schedule.lastPeriodId, last_error: null })
          .eq("id", schedule.id);
      } catch (cause) {
        failed += 1;
        const message = (cause instanceof Error ? cause.message : String(cause)).slice(0, 500);
        await db.from(TABLE).update({ last_error: message }).eq("id", schedule.id);
      }
    }
  }
  return { checked: schedules.length, sent, failed };
}
