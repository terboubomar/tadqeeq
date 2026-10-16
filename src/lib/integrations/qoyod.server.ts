import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { logEvent } from "../observability";
import { requireWorkspacePermission } from "../server-auth.server";
import { missingAccountCodes, qoyodJournalEntry, type QoyodAccount, type SendableEntry } from "./qoyod";
import { openSecret, sealSecret } from "./secret-box.server";

/**
 * Qoyod (https://apidoc.qoyod.com): the workspace pastes its API key once (General Settings in Qoyod); the key is
 * checked against Qoyod, sealed and kept server-side. Entries are posted to POST /2.0/journal_entries, each at most
 * once per period and branch (accounting_sync_entries, migration 0061).
 */
const QOYOD_API = "https://api.qoyod.com/2.0";
const TIMEOUT_MS = 20_000;
const MANAGE = "contracts.manage" as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the generated types predate migration 0061
const db = () => supabaseAdmin as unknown as { from: (table: string) => any };

const TABLES_MISSING = "الربط المباشر يحتاج تحديث قاعدة البيانات (الترحيل 0061).";
function tableError(error: { code?: string; message: string }): Error {
  if (error.code === "42P01" || error.code === "PGRST205" || /accounting_(connections|sync_entries)/.test(error.message)) {
    return new Error(TABLES_MISSING);
  }
  return new Error(error.message);
}

async function qoyod<T>(apiKey: string, path: string, init: { method?: "GET" | "POST"; body?: unknown } = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(QOYOD_API + path, {
      method: init.method ?? "GET",
      headers: { "API-KEY": apiKey, Accept: "application/json", ...(init.body ? { "Content-Type": "application/json" } : {}) },
      body: init.body ? JSON.stringify(init.body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new Error("تعذّر الوصول إلى قيود. حاول بعد قليل.");
  }
  if (response.status === 401 || response.status === 403) throw new Error("مفتاح قيود غير صالح أو أُلغي. أنشئ مفتاحاً جديداً واربط من جديد.");
  if (response.status === 429) throw new Error("قيود طلبت التمهّل. حاول بعد دقيقة.");
  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 200);
    throw new Error(`رفض قيود الطلب (${response.status})${detail ? ": " + detail : ""}`);
  }
  return (await response.json()) as T;
}

/** Every account in the Qoyod chart, following pages until one adds nothing new. */
async function qoyodAccounts(apiKey: string): Promise<QoyodAccount[]> {
  const byId = new Map<number, QoyodAccount>();
  for (let page = 1; page <= 20; page++) {
    const data = await qoyod<{ accounts?: Array<{ id: number; code: string | null }> }>(apiKey, `/accounts?page=${page}`);
    const before = byId.size;
    for (const account of data.accounts ?? []) {
      if (typeof account.id === "number" && account.code) byId.set(account.id, { id: account.id, code: String(account.code) });
    }
    if (byId.size === before) break;
  }
  return [...byId.values()];
}

async function storedKey(workspaceId: string): Promise<string> {
  const { data, error } = await db()
    .from("accounting_connections")
    .select("secret_ciphertext")
    .eq("workspace_id", workspaceId)
    .eq("provider", "qoyod")
    .maybeSingle();
  if (error) throw tableError(error);
  if (!data) throw new Error("قيود غير مربوط. اربطه من صفحة التكاملات.");
  return openSecret(data.secret_ciphertext as string);
}

export interface IntegrationStatus {
  qoyod: { hint: string; connectedAt: string } | null;
}

export async function getIntegrationStatusOnServer(): Promise<IntegrationStatus> {
  const { workspaceId } = await requireWorkspacePermission("reports.read");
  const { data, error } = await db()
    .from("accounting_connections")
    .select("provider,secret_hint,connected_at")
    .eq("workspace_id", workspaceId);
  if (error) {
    // Before the migration runs nothing is connected.
    if (tableError(error).message === TABLES_MISSING) return { qoyod: null };
    throw tableError(error);
  }
  const qoyodRow = ((data ?? []) as Array<{ provider: string; secret_hint: string; connected_at: string }>).find((row) => row.provider === "qoyod");
  return { qoyod: qoyodRow ? { hint: qoyodRow.secret_hint, connectedAt: qoyodRow.connected_at } : null };
}

export async function connectQoyodOnServer(apiKey: string): Promise<IntegrationStatus> {
  const { workspaceId, actorUserId } = await requireWorkspacePermission(MANAGE);
  const key = apiKey.trim();
  if (key.length < 8) throw new Error("ألصق مفتاح API كاملاً من إعدادات قيود.");
  await qoyodAccounts(key); // proves the key works before anything is saved
  const { error } = await db()
    .from("accounting_connections")
    .upsert(
      {
        workspace_id: workspaceId,
        provider: "qoyod",
        secret_ciphertext: sealSecret(key),
        secret_hint: key.slice(-4),
        connected_by: actorUserId,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,provider" },
    );
  if (error) throw tableError(error);
  logEvent("integration_connected", { provider: "qoyod", workspace_id: workspaceId, actor_user_id: actorUserId });
  return getIntegrationStatusOnServer();
}

export async function disconnectQoyodOnServer(): Promise<IntegrationStatus> {
  const { workspaceId, actorUserId } = await requireWorkspacePermission(MANAGE);
  const { error } = await db().from("accounting_connections").delete().eq("workspace_id", workspaceId).eq("provider", "qoyod");
  if (error) throw tableError(error);
  logEvent("integration_disconnected", { provider: "qoyod", workspace_id: workspaceId, actor_user_id: actorUserId });
  return { qoyod: null };
}

export interface SendResult {
  sent: number;
  /** Already sent before for this period and branch. */
  skipped: number;
  failed: Array<{ key: string; message: string }>;
}

export async function sendJournalsToQoyodOnServer(periodKey: string, entries: SendableEntry[]): Promise<SendResult> {
  const { workspaceId, actorUserId } = await requireWorkspacePermission(MANAGE);
  const apiKey = await storedKey(workspaceId);

  const { data: sentRows, error } = await db()
    .from("accounting_sync_entries")
    .select("entry_key")
    .eq("workspace_id", workspaceId)
    .eq("provider", "qoyod")
    .eq("period_key", periodKey);
  if (error) throw tableError(error);
  const alreadySent = new Set(((sentRows ?? []) as Array<{ entry_key: string }>).map((row) => row.entry_key));
  const pending = entries.filter((entry) => !alreadySent.has(entry.key));
  const result: SendResult = { sent: 0, skipped: entries.length - pending.length, failed: [] };
  if (!pending.length) return result;

  const accounts = await qoyodAccounts(apiKey);
  const missing = missingAccountCodes(pending, accounts);
  if (missing.length) {
    throw new Error(`هذه الحسابات بلا رمز مطابق في قيود: ${missing.slice(0, 6).join("، ")}. صحّح الرموز من «حساباتي» ثم أرسل.`);
  }

  for (const entry of pending) {
    try {
      const payload = qoyodJournalEntry(entry, accounts);
      const created = await qoyod<{ id?: number }>(apiKey, "/journal_entries", { method: "POST", body: { journal_entry: payload } });
      const total = payload.debit_amounts.reduce((sum, line) => sum + line.amount, 0);
      const { error: logError } = await db().from("accounting_sync_entries").insert({
        workspace_id: workspaceId,
        provider: "qoyod",
        period_key: periodKey,
        entry_key: entry.key,
        reference: entry.reference,
        external_id: String(created.id ?? "unknown"),
        total: Math.round(total * 100) / 100,
        sent_by: actorUserId,
      });
      if (logError) throw tableError(logError);
      result.sent += 1;
    } catch (cause) {
      result.failed.push({ key: entry.key, message: cause instanceof Error ? cause.message : String(cause) });
      // A key or connection problem fails every entry the same way: stop instead of repeating it.
      if (cause instanceof Error && /مفتاح قيود|تعذّر الوصول|التمهّل|الترحيل/.test(cause.message)) break;
    }
  }
  logEvent("integration_journals_sent", { provider: "qoyod", workspace_id: workspaceId, sent: result.sent, skipped: result.skipped, failed: result.failed.length });
  return result;
}
