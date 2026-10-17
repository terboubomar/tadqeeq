import { supabaseAdmin } from "@/integrations/supabase/client.server";

import { logEvent } from "../observability";
import { requireWorkspacePermission } from "../server-auth.server";
import { missingAccountCodes, round2, type AccountingProvider, type SendableEntry, type SentJournal } from "./sendable";
import { daftraAdapter } from "./daftra.server";
import { odooAdapter } from "./odoo.server";
import { quickBooksAdapter } from "./quickbooks.server";
import { SyncStop, type Connection, type ProviderAdapter } from "./http.server";
import { qoyodAdapter } from "./qoyod.server";
import { zohoAdapter } from "./zoho.server";
import { openSecret, sealSecret } from "./secret-box.server";

/**
 * Direct connections to accounting systems (migrations 0061-0065). The workspace pastes an API key (and, for Daftra,
 * its site) or signs in (Zoho Books); the credentials are checked against the system, sealed and kept server-side. Entries are posted once per period
 * and branch (accounting_sync_entries).
 */
export type { AccountingProvider, SentJournal };

const ADAPTERS: Record<AccountingProvider, ProviderAdapter> = { qoyod: qoyodAdapter, daftra: daftraAdapter, zoho: zohoAdapter, odoo: odooAdapter, quickbooks: quickBooksAdapter };
const MANAGE = "contracts.manage" as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the generated types predate migrations 0061-0065
const db = () => supabaseAdmin as unknown as { from: (table: string) => any };

const TABLES_MISSING = "الربط المباشر يحتاج تحديث قاعدة البيانات (الترحيل 0061 إلى 0065).";
function tableError(error: { code?: string; message: string }): Error {
  if (
    error.code === "42P01" ||
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.code === "PGRST205" ||
    error.code === "23514" ||
    /accounting_(connections|sync_entries)/.test(error.message)
  ) {
    return new SyncStop(TABLES_MISSING);
  }
  return new Error(error.message);
}

async function readConnection(workspaceId: string, provider: AccountingProvider, name: string): Promise<Connection> {
  const { data, error } = await db()
    .from("accounting_connections")
    .select(provider === "qoyod" ? "secret_ciphertext" : "secret_ciphertext,site")
    .eq("workspace_id", workspaceId)
    .eq("provider", provider)
    .maybeSingle();
  if (error) throw tableError(error);
  if (!data) throw new Error(`${name} غير مربوط. اربطه من صفحة التكاملات.`);
  return {
    apiKey: openSecret(data.secret_ciphertext as string),
    site: (data.site as string | undefined) ?? null,
    saveSecret: async (secret) => {
      const { error: saveError } = await db()
        .from("accounting_connections")
        .update({ secret_ciphertext: sealSecret(secret) })
        .eq("workspace_id", workspaceId)
        .eq("provider", provider);
      if (saveError) throw new SyncStop(`تعذّر حفظ صلاحية ${name} الجديدة. حاول مرة أخرى.`);
    },
  };
}

export interface ConnectionStatus {
  hint: string;
  connectedAt: string;
  site: string | null;
}

export interface IntegrationStatus {
  qoyod: ConnectionStatus | null;
  daftra: ConnectionStatus | null;
  zoho: ConnectionStatus | null;
  odoo: ConnectionStatus | null;
  quickbooks: ConnectionStatus | null;
}

interface ConnectionRow {
  provider: string;
  secret_hint: string;
  connected_at: string;
  site?: string | null;
}

export async function getIntegrationStatusOnServer(): Promise<IntegrationStatus> {
  const { workspaceId } = await requireWorkspacePermission("reports.read");
  let result = await db().from("accounting_connections").select("provider,secret_hint,connected_at,site").eq("workspace_id", workspaceId);
  // Before 0062 there is no site column; Qoyod still works.
  if (result.error && tableError(result.error).message === TABLES_MISSING) {
    result = await db().from("accounting_connections").select("provider,secret_hint,connected_at").eq("workspace_id", workspaceId);
  }
  if (result.error) {
    // Before 0061 nothing is connected.
    if (tableError(result.error).message === TABLES_MISSING) return { qoyod: null, daftra: null, zoho: null, odoo: null, quickbooks: null };
    throw tableError(result.error);
  }
  const rows = (result.data ?? []) as ConnectionRow[];
  const status = (provider: AccountingProvider): ConnectionStatus | null => {
    const row = rows.find((candidate) => candidate.provider === provider);
    return row ? { hint: row.secret_hint, connectedAt: row.connected_at, site: row.site ?? null } : null;
  };
  return { qoyod: status("qoyod"), daftra: status("daftra"), zoho: status("zoho"), odoo: status("odoo"), quickbooks: status("quickbooks") };
}

/**
 * Checks pasted credentials against the system, then saves them. `secret` is what the adapter reads back (the key, or
 * a JSON of the key and its companions for Odoo); `hint` is the key's last characters.
 */
export async function connectOnServer(provider: AccountingProvider, secret: string, hint: string, site: string | null): Promise<IntegrationStatus> {
  const adapter = ADAPTERS[provider];
  const { workspaceId, actorUserId } = await requireWorkspacePermission(MANAGE);
  await adapter.accounts({ apiKey: secret, site }); // proves the credentials work before anything is saved
  return storeConnection({ workspaceId, actorUserId, provider, secret, hint, site });
}

/** Seals and saves (or replaces) a workspace's connection, once its credentials have been checked. */
export async function storeConnection(input: {
  workspaceId: string;
  actorUserId: string;
  provider: AccountingProvider;
  secret: string;
  hint: string;
  site: string | null;
}): Promise<IntegrationStatus> {
  const { error } = await db()
    .from("accounting_connections")
    .upsert(
      {
        workspace_id: input.workspaceId,
        provider: input.provider,
        secret_ciphertext: sealSecret(input.secret),
        secret_hint: input.hint,
        ...(input.site ? { site: input.site } : {}),
        connected_by: input.actorUserId,
        connected_at: new Date().toISOString(),
      },
      { onConflict: "workspace_id,provider" },
    );
  if (error) throw tableError(error);
  logEvent("integration_connected", { provider: input.provider, workspace_id: input.workspaceId, actor_user_id: input.actorUserId });
  return getIntegrationStatusOnServer();
}

export async function disconnectOnServer(provider: AccountingProvider): Promise<IntegrationStatus> {
  const { workspaceId, actorUserId } = await requireWorkspacePermission(MANAGE);
  const { error } = await db().from("accounting_connections").delete().eq("workspace_id", workspaceId).eq("provider", provider);
  if (error) throw tableError(error);
  logEvent("integration_disconnected", { provider, workspace_id: workspaceId, actor_user_id: actorUserId });
  return getIntegrationStatusOnServer();
}

/** What this period has already sent, newest first, with who sent it. */
export async function getSentJournalsOnServer(periodKey: string): Promise<SentJournal[]> {
  const { workspaceId } = await requireWorkspacePermission("reports.read");
  const { data, error } = await db()
    .from("accounting_sync_entries")
    .select("provider,entry_key,reference,external_id,total,sent_at,sent_by")
    .eq("workspace_id", workspaceId)
    .eq("period_key", periodKey)
    .order("sent_at", { ascending: false });
  if (error) {
    // Before migration 0061 nothing has been sent.
    if (tableError(error).message === TABLES_MISSING) return [];
    throw tableError(error);
  }
  const rows = (data ?? []) as Array<{
    provider: AccountingProvider;
    entry_key: string;
    reference: string;
    external_id: string;
    total: number | string;
    sent_at: string;
    sent_by: string | null;
  }>;
  const senderIds = [...new Set(rows.map((row) => row.sent_by).filter((id): id is string => Boolean(id)))];
  const names = new Map<string, string>();
  if (senderIds.length) {
    const { data: profiles } = await db().from("profiles").select("id,full_name,email").in("id", senderIds);
    for (const profile of (profiles ?? []) as Array<{ id: string; full_name: string | null; email: string | null }>) {
      names.set(profile.id, profile.full_name?.trim() || profile.email || "");
    }
  }
  return rows.map((row) => ({
    provider: row.provider,
    entryKey: row.entry_key,
    reference: row.reference,
    externalId: row.external_id,
    total: Number(row.total),
    sentAt: row.sent_at,
    sentBy: (row.sent_by && names.get(row.sent_by)) || null,
  }));
}

export interface SendResult {
  sent: number;
  /** Already sent before for this period and branch. */
  skipped: number;
  failed: Array<{ key: string; message: string }>;
}

export async function sendJournalsOnServer(provider: AccountingProvider, periodKey: string, received: SendableEntry[]): Promise<SendResult> {
  const adapter = ADAPTERS[provider];
  const entries = adapter.prepare ? adapter.prepare(received) : received;
  const { workspaceId, actorUserId } = await requireWorkspacePermission(MANAGE);
  const connection = await readConnection(workspaceId, provider, adapter.name);

  const { data: sentRows, error } = await db()
    .from("accounting_sync_entries")
    .select("entry_key")
    .eq("workspace_id", workspaceId)
    .eq("provider", provider)
    .eq("period_key", periodKey);
  if (error) throw tableError(error);
  const alreadySent = new Set(((sentRows ?? []) as Array<{ entry_key: string }>).map((row) => row.entry_key));
  const pending = entries.filter((entry) => !alreadySent.has(entry.key));
  const result: SendResult = { sent: 0, skipped: entries.length - pending.length, failed: [] };
  if (!pending.length) return result;

  const accounts = await adapter.accounts(connection);
  const missing = missingAccountCodes(pending, accounts);
  if (missing.length) {
    throw new Error(`هذه الحسابات بلا رمز مطابق في ${adapter.name}: ${missing.slice(0, 6).join("، ")}. صحّح الرموز من «حساباتي» ثم أرسل.`);
  }
  await adapter.precheck?.(connection, pending);

  for (const entry of pending) {
    try {
      const posted = await adapter.post(connection, entry, accounts);
      const { error: logError } = await db().from("accounting_sync_entries").insert({
        workspace_id: workspaceId,
        provider,
        period_key: periodKey,
        entry_key: entry.key,
        reference: entry.reference,
        external_id: posted.externalId.slice(0, 80) || "unknown",
        total: round2(posted.total),
        sent_by: actorUserId,
      });
      if (logError) throw tableError(logError);
      result.sent += 1;
    } catch (cause) {
      result.failed.push({ key: entry.key, message: cause instanceof Error ? cause.message : String(cause) });
      if (cause instanceof SyncStop) break;
    }
  }
  logEvent("integration_journals_sent", { provider, workspace_id: workspaceId, sent: result.sent, skipped: result.skipped, failed: result.failed.length });
  return result;
}
