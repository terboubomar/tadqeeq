
import type { Json } from "@/integrations/supabase/types";

import type { JahezCompensationTransaction } from "./analysis/types";
import {
  buildCompensationDisputeDraft,
  caseWriteErrorMessage,
  normalizeOrderLookupKey,
  telegramMessageUrl,
  type CompensationPlatform,
} from "./compensation-evidence";
import {
  advanceCaseWorkflow,
  CASE_STATUS_LABELS,
  PLATFORM_LABELS,
  readCaseWorkflow,
} from "./compensation-overview";
import type { StoredPeriod } from "./periods";
import { TELEGRAM_CONNECTION_CODE_TTL_MINUTES } from "./limits";
import { logEvent } from "./observability";
import { getPublicOrigin, requirePublicOrigin } from "./public-origin.server";
import { assertBranchAccess, requireWorkspacePermission, type ServerUserClient } from "./server-auth.server";

const CONNECTION_CODE_TTL_MINUTES = TELEGRAM_CONNECTION_CODE_TTL_MINUTES;
const CONNECTION_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
// Workspace columns are introduced by migration 0026 before generated Supabase
// types are refreshed. Keep the temporary escape hatch isolated here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const dynamicDb = (client: ServerUserClient) => client as any;


export interface TelegramBranchConnection {
  id: string;
  branchId: string;
  branchKey: string;
  branchName: string;
  chatId: number | null;
  chatTitle: string | null;
  connectedAt: string | null;
  lastMessageAt: string | null;
  active: boolean;
  codeExpiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TelegramIntegrationStatus {
  configured: boolean;
  botUsername: string | null;
  webhookUrl: string | null;
  expectedWebhookUrl: string | null;
  webhookActive: boolean;
  error: string | null;
}

export interface CompensationEvidenceRecord {
  id: string;
  branchId: string;
  branchChatId: string;
  branchName: string;
  orderNumber: string;
  capturedAt: string;
  senderName: string | null;
  mediaType: string;
  durationSeconds: number | null;
  fileSizeBytes: number | null;
  /** A small preview can be fetched from Telegram on demand (video thumbnail or the photo itself). */
  hasPreview: boolean;
  telegramUrl: string | null;
}

export interface JahezCompensationMatchRecord {
  periodId: string;
  periodLabel: string;
  periodStart: string | null;
  periodEnd: string | null;
  branch: string;
  orderId: string;
  transactionType: string;
  reason: string;
  creationDate: string;
  amount: number;
  match: string;
  matchedBranch: string | null;
  matchedPeriodLabel: string | null;
  duplicateCandidate: boolean;
  branchMismatch: boolean;
}

export interface CompensationEvidenceSearchResult {
  evidence: CompensationEvidenceRecord[];
  jahezMatches: JahezCompensationMatchRecord[];
}

export interface CompensationCaseRecord {
  id: string;
  periodId: string | null;
  evidenceId: string | null;
  platform: CompensationPlatform;
  orderNumber: string;
  branchName: string | null;
  compensationAmount: number;
  compensationReason: string;
  employeeExplanation: string;
  auditContext: Json;
  draftAr: string;
  draftEn: string;
  status: string;
  aggregatorCaseReference: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SaveCompensationCaseInput {
  id?: string;
  periodId?: string | null;
  evidenceId?: string | null;
  platform: CompensationPlatform;
  orderNumber: string;
  branchName?: string | null;
  compensationAmount: number;
  compensationReason: string;
  employeeExplanation: string;
  status?: "draft" | "ready" | "submitted" | "accepted" | "rejected" | "recovered" | "closed";
  aggregatorCaseReference?: string | null;
  /** Amount the platform actually paid back when marking the case recovered. */
  recoveredAmount?: number | null;
  /** Free note stored with the status change (e.g. the platform's rejection reason). */
  statusNote?: string | null;
}

function normalizeBranchKey(value: string): string {
  return value.trim().normalize("NFKC").replace(/\s+/g, " ").toLocaleLowerCase();
}

function randomConnectionCode(): string {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (value) => CONNECTION_ALPHABET[value % CONNECTION_ALPHABET.length]).join("");
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
}

function requiredTelegramEnv(name: "TELEGRAM_BOT_TOKEN" | "TELEGRAM_WEBHOOK_SECRET"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("إعداد Telegram غير مكتمل على الخادم.");
  return value;
}

/** Status screens show "not configured" instead of failing when the origin is missing or invalid. */
function optionalPublicOrigin(): string | null {
  try {
    return getPublicOrigin();
  } catch {
    return null;
  }
}

async function telegramApi<T>(
  method: string,
  payload?: Record<string, unknown>,
): Promise<T> {
  const token = requiredTelegramEnv("TELEGRAM_BOT_TOKEN");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload ?? {}),
  });

  const body = (await response.json()) as {
    ok?: boolean;
    result?: T;
    description?: string;
  };

  if (!response.ok || !body.ok || body.result === undefined) {
    throw new Error(body.description || "تعذّر الاتصال بـ Telegram.");
  }
  return body.result;
}

function mapConnection(row: {
  id: string;
  branch_id: string;
  branch_key: string;
  branch_name: string;
  telegram_chat_id: number | null;
  telegram_chat_title: string | null;
  connected_at: string | null;
  last_message_at: string | null;
  active: boolean;
  connect_code_expires_at: string | null;
  created_at: string;
  updated_at: string;
}): TelegramBranchConnection {
  return {
    id: row.id,
    branchId: row.branch_id,
    branchKey: row.branch_key,
    branchName: row.branch_name,
    chatId: row.telegram_chat_id,
    chatTitle: row.telegram_chat_title,
    connectedAt: row.connected_at,
    lastMessageAt: row.last_message_at,
    active: row.active,
    codeExpiresAt: row.connect_code_expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCase(row: {
  id: string;
  period_id: string | null;
  evidence_id: string | null;
  platform: string;
  order_number: string;
  branch_name: string | null;
  compensation_amount: number;
  compensation_reason: string;
  employee_explanation: string;
  audit_context: Json;
  draft_ar: string;
  draft_en: string;
  status: string;
  aggregator_case_reference: string | null;
  created_at: string;
  updated_at: string;
}): CompensationCaseRecord {
  return {
    id: row.id,
    periodId: row.period_id,
    evidenceId: row.evidence_id,
    platform: row.platform as CompensationPlatform,
    orderNumber: row.order_number,
    branchName: row.branch_name,
    compensationAmount: row.compensation_amount,
    compensationReason: row.compensation_reason,
    employeeExplanation: row.employee_explanation,
    auditContext: row.audit_context,
    draftAr: row.draft_ar,
    draftEn: row.draft_en,
    status: row.status,
    aggregatorCaseReference: row.aggregator_case_reference,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function listTelegramBranchConnectionsOnServer(): Promise<TelegramBranchConnection[]> {
  const { client, workspaceId } = await requireWorkspacePermission("telegram.read");
  const db = dynamicDb(client);
  const { data, error } = await db
    .from("telegram_branch_chats")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("branch_name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapConnection);
}

export async function listBranchNameOptionsOnServer(): Promise<Array<{ id: string; name: string }>> {
  const { client } = await requireWorkspacePermission("branches.read");
  // Generated Supabase types are refreshed after the workspace migration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = client as any;
  const { data, error } = await db
    .from("branch_registry")
    .select("id,name")
    .eq("active", true)
    .order("name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as Array<{ id: string; name: string }>;
}

export async function createBranchWithTelegramConnectionOnServer(
  name: string,
): Promise<{ connection: TelegramBranchConnection; code: string; branch: { id: string; name: string } }> {
  const context = await requireWorkspacePermission("branches.manage");
  if (!context.permissions.includes("telegram.manage")) {
    throw new Error("ليس لديك صلاحية لربط الفروع بـ Telegram.");
  }
  const branchName = name.trim().replace(/\s+/g, " ");
  if (!branchName) throw new Error("اسم الفرع مطلوب.");
  // Generated Supabase types are refreshed after the workspace migration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = context.client as any;

  const { data: matches, error: lookupError } = await db
    .from("branch_registry")
    .select("id,name,active")
    .eq("workspace_id", context.workspaceId)
    .ilike("name", branchName.replace(/[\\%_]/g, (ch) => "\\" + ch))
    .limit(1);
  if (lookupError) throw new Error(lookupError.message);
  const existing = matches?.[0] as { id: string; name: string; active: boolean } | undefined;

  let branch: { id: string; name: string };
  if (existing) {
    if (!existing.active) {
      const { error } = await db
        .from("branch_registry")
        .update({ active: true, updated_at: new Date().toISOString() })
        .eq("id", existing.id)
        .eq("workspace_id", context.workspaceId);
      if (error) throw new Error(error.message);
    }
    branch = { id: String(existing.id), name: String(existing.name) };
  } else {
    const { data, error } = await db
      .from("branch_registry")
      .insert({
        user_id: context.userId,
        workspace_id: context.workspaceId,
        name: branchName,
        active: true,
        updated_at: new Date().toISOString(),
      })
      .select("id,name")
      .single();
    if (error) {
      if (error.code === "23505") throw new Error("يوجد فرع بنفس الاسم.");
      throw new Error(error.message);
    }
    branch = { id: String(data.id), name: String(data.name) };
  }

  const result = await createTelegramBranchConnectionOnServer(branch.id);
  return { ...result, branch };
}

export async function createTelegramBranchConnectionOnServer(
  branchId: string,
): Promise<{ connection: TelegramBranchConnection; code: string }> {
  const context = await requireWorkspacePermission("telegram.manage");
  assertBranchAccess(context, branchId);
  // Generated Supabase types are refreshed after the workspace migration.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const db = context.client as any;

  const { data: branch, error: branchError } = await db
    .from("branch_registry")
    .select("id,name")
    .eq("id", branchId)
    .eq("workspace_id", context.workspaceId)
    .eq("active", true)
    .maybeSingle();
  if (branchError) throw new Error(branchError.message);
  if (!branch) throw new Error("الفرع غير موجود أو غير متاح لك.");

  const branchName = String(branch.name).trim();
  const branchKey = normalizeBranchKey(branchName);
  const code = randomConnectionCode();
  const codeHash = await sha256Text(code);
  const expiresAt = new Date(Date.now() + CONNECTION_CODE_TTL_MINUTES * 60_000).toISOString();
  const updatedAt = new Date().toISOString();

  const { data: existing, error: lookupError } = await db
    .from("telegram_branch_chats")
    .select("id")
    .eq("workspace_id", context.workspaceId)
    .eq("branch_id", branchId)
    .maybeSingle();
  if (lookupError) throw new Error(lookupError.message);

  const row = {
    user_id: context.userId,
    workspace_id: context.workspaceId,
    branch_id: branchId,
    branch_key: branchKey,
    branch_name: branchName,
    connect_code_hash: codeHash,
    connect_code_expires_at: expiresAt,
    active: true,
    updated_at: updatedAt,
  };

  const mutation = existing
    ? db
        .from("telegram_branch_chats")
        .update(row)
        .eq("id", existing.id)
        .eq("workspace_id", context.workspaceId)
    : db.from("telegram_branch_chats").insert(row);

  const { data, error } = await mutation.select("*").single();
  if (error) throw new Error(error.message);

  return { connection: mapConnection(data), code };
}

export async function setTelegramBranchConnectionActiveOnServer(
  id: string,
  active: boolean,
): Promise<TelegramBranchConnection> {
  const { client, workspaceId } = await requireWorkspacePermission("telegram.manage");
  const db = dynamicDb(client);
  const { data, error } = await db
    .from("telegram_branch_chats")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("تعذّر العثور على ربط الفرع.");
  return mapConnection(data);
}

export async function getTelegramIntegrationStatusOnServer(): Promise<TelegramIntegrationStatus> {
  await requireWorkspacePermission("telegram.read");
  const token = process.env["TELEGRAM_BOT_TOKEN"]?.trim();
  const secret = process.env["TELEGRAM_WEBHOOK_SECRET"]?.trim();
  const origin = optionalPublicOrigin();
  const expectedWebhookUrl = origin ? origin + "/api/public/telegram-webhook" : null;

  if (!token || !secret) {
    return {
      configured: false,
      botUsername: null,
      webhookUrl: null,
      expectedWebhookUrl,
      webhookActive: false,
      error: "أضف TELEGRAM_BOT_TOKEN و TELEGRAM_WEBHOOK_SECRET إلى أسرار الخادم.",
    };
  }

  try {
    const [bot, webhook] = await Promise.all([
      telegramApi<{ username?: string }>("getMe"),
      telegramApi<{ url?: string }>("getWebhookInfo"),
    ]);
    const webhookUrl = webhook.url?.trim() || null;
    return {
      configured: true,
      botUsername: bot.username ?? null,
      webhookUrl,
      expectedWebhookUrl,
      webhookActive: Boolean(expectedWebhookUrl && webhookUrl === expectedWebhookUrl),
      error: null,
    };
  } catch (error) {
    return {
      configured: true,
      botUsername: null,
      webhookUrl: null,
      expectedWebhookUrl,
      webhookActive: false,
      error: error instanceof Error ? error.message : "تعذّر قراءة حالة Telegram.",
    };
  }
}

export async function configureTelegramWebhookOnServer(): Promise<TelegramIntegrationStatus> {
  await requireWorkspacePermission("telegram.manage");
  const secret = requiredTelegramEnv("TELEGRAM_WEBHOOK_SECRET");
  const origin = requirePublicOrigin();

  const webhookUrl = origin + "/api/public/telegram-webhook";
  await telegramApi<boolean>("setWebhook", {
    url: webhookUrl,
    secret_token: secret,
    allowed_updates: ["message"],
    drop_pending_updates: false,
  });

  return getTelegramIntegrationStatusOnServer();
}

async function branchNamesById(
  client: ServerUserClient,
  workspaceId: string,
  ids: string[],
): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data, error } = await client
    .from("telegram_branch_chats")
    .select("id, branch_name")
    .eq("workspace_id", workspaceId)
    .in("id", ids);

  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((row) => [row.id, row.branch_name]));
}

function jahezMatchesForPeriod(
  period: StoredPeriod,
  lookupKey: string,
): JahezCompensationMatchRecord[] {
  const transactions = period.invoice?.jahezCompensation?.transactions ?? [];
  return transactions
    .filter((transaction: JahezCompensationTransaction) =>
      normalizeOrderLookupKey(transaction.orderId).endsWith(lookupKey),
    )
    .map((transaction) => ({
      periodId: period.id,
      periodLabel: period.label,
      periodStart: period.period_start,
      periodEnd: period.period_end,
      branch: transaction.branch,
      orderId: transaction.orderId,
      transactionType: transaction.transactionType,
      reason: transaction.reason,
      creationDate: transaction.creationDate,
      amount: transaction.amount,
      match: transaction.match,
      matchedBranch: transaction.matchedBranch ?? null,
      matchedPeriodLabel: transaction.matchedPeriodLabel ?? null,
      duplicateCandidate: Boolean(transaction.duplicateCandidate),
      branchMismatch: Boolean(transaction.branchMismatch),
    }));
}

export async function searchCompensationEvidenceOnServer(
  orderNumberInput: string,
): Promise<CompensationEvidenceSearchResult> {
  const context = await requireWorkspacePermission("compensation.read");
  const { client, userId, workspaceId } = context;
  const userDb = dynamicDb(client);
  const orderNumber = orderNumberInput.trim();
  const lookupKey = normalizeOrderLookupKey(orderNumber);
  if (lookupKey.length < 3 || lookupKey.length > 120) {
    throw new Error("أدخل رقم طلب صالحاً.");
  }

  const suffixPattern = `%${lookupKey.replace(/[%_]/g, (char) => `\\${char}`)}`;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminDb = supabaseAdmin as any;

  const [{ data: evidenceRows, error: evidenceError }, { data: periodRows, error: periodError }] =
    await Promise.all([
      userDb
        .from("telegram_order_evidence")
        .select("*")
        .eq("workspace_id", workspaceId)
        .like("order_lookup_key", suffixPattern)
        .order("captured_at", { ascending: false })
        .limit(25),
      adminDb
        .from("periods")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq("platform", "jahez")
        .is("superseded_at", null)
        .order("created_at", { ascending: false })
        .limit(120),
    ]);

  if (evidenceError) throw new Error(evidenceError.message);
  if (periodError) throw new Error(periodError.message);

  const branchChatIds: string[] = Array.from(
    new Set<string>(
      (evidenceRows ?? []).map(
        (row: { branch_chat_id: string }) => row.branch_chat_id,
      ),
    ),
  );
  const branches = await branchNamesById(client, workspaceId, branchChatIds);

  const evidence = await Promise.all(
    (evidenceRows ?? []).map(async (row: {
      id: string;
      branch_id: string;
      branch_chat_id: string;
      order_number: string;
      captured_at: string;
      sender_name: string | null;
      media_type: string;
      duration_seconds: number | null;
      file_size_bytes: number | null;
      thumbnail_file_id: string | null;
      telegram_chat_id: number;
      telegram_message_id: number;
    }) => ({
      id: row.id,
      branchId: row.branch_id,
      branchChatId: row.branch_chat_id,
      branchName: branches.get(row.branch_chat_id) ?? "فرع غير معروف",
      orderNumber: row.order_number,
      capturedAt: row.captured_at,
      senderName: row.sender_name,
      mediaType: row.media_type,
      durationSeconds: row.duration_seconds,
      fileSizeBytes: row.file_size_bytes,
      hasPreview:
        Boolean(row.thumbnail_file_id) || row.media_type === "photo" || row.media_type === "image_document",
      telegramUrl: telegramMessageUrl(row.telegram_chat_id, row.telegram_message_id),
    })),
  );

  let allowedBranchNames: Set<string> | null = null;
  if (!context.globalBranchAccess) {
    const { data: branchRows, error: branchError } = await userDb
      .from("branch_registry")
      .select("name")
      .eq("workspace_id", workspaceId)
      .eq("active", true);
    if (branchError) throw new Error(branchError.message);
    allowedBranchNames = new Set(
      (branchRows ?? []).map((row: { name: string }) => normalizeBranchKey(row.name)),
    );
  }

  const jahezMatches = (periodRows ?? [])
    .flatMap((row: StoredPeriod) => jahezMatchesForPeriod(row, lookupKey))
    .filter((match: JahezCompensationMatchRecord) => {
      if (!allowedBranchNames) return true;
      const branch = match.matchedBranch || match.branch;
      return allowedBranchNames.has(normalizeBranchKey(branch));
    })
    .sort((left: JahezCompensationMatchRecord, right: JahezCompensationMatchRecord) =>
      right.creationDate.localeCompare(left.creationDate),
    );

  return { evidence, jahezMatches };
}

async function assertOwnedEvidence(
  client: ServerUserClient,
  workspaceId: string,
  evidenceId: string | null | undefined,
): Promise<{
  id: string;
  captured_at: string;
  sender_name: string | null;
  branch_chat_id: string;
  branch_id: string;
} | null> {
  if (!evidenceId) return null;
  const { data, error } = await dynamicDb(client)
    .from("telegram_order_evidence")
    .select("id, captured_at, sender_name, branch_chat_id, branch_id")
    .eq("id", evidenceId)
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("دليل Telegram المحدد غير موجود.");
  return data;
}

async function assertOwnedPeriod(
  workspaceId: string,
  userId: string,
  periodId: string | null | undefined,
): Promise<StoredPeriod | null> {
  if (!periodId) return null;
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const adminDb = supabaseAdmin as any;
  const { data, error } = await adminDb
    .from("periods")
    .select("*")
    .eq("id", periodId)
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("فترة التدقيق المحددة غير موجودة.");
  return data as StoredPeriod;
}

async function resolveAccessibleBranch(
  client: ServerUserClient,
  workspaceId: string,
  branchName: string | null,
): Promise<{ id: string; name: string } | null> {
  if (!branchName) return null;
  const { data, error } = await dynamicDb(client)
    .from("branch_registry")
    .select("id,name")
    .eq("workspace_id", workspaceId)
    .eq("active", true);
  if (error) throw new Error(error.message);
  const key = normalizeBranchKey(branchName);
  return (
    (data ?? []).find(
      (row: { id: string; name: string }) => normalizeBranchKey(row.name) === key,
    ) ?? null
  );
}

function auditContextFor(
  period: StoredPeriod | null,
  orderNumber: string,
): Json {
  if (!period || period.platform !== "jahez") return {};
  const lookupKey = normalizeOrderLookupKey(orderNumber);
  const transaction = (period.invoice?.jahezCompensation?.transactions ?? []).find(
    (item) => normalizeOrderLookupKey(item.orderId) === lookupKey,
  );
  if (!transaction) return {};

  return {
    source: "jahez_compensation_report",
    periodId: period.id,
    periodLabel: period.label,
    transactionType: transaction.transactionType,
    sourceReason: transaction.reason,
    sourceAmount: transaction.amount,
    sourceBranch: transaction.branch,
    match: transaction.match,
    matchedBranch: transaction.matchedBranch ?? null,
    matchedPeriodLabel: transaction.matchedPeriodLabel ?? null,
    duplicateCandidate: Boolean(transaction.duplicateCandidate),
    branchMismatch: Boolean(transaction.branchMismatch),
  };
}

export async function saveCompensationCaseOnServer(
  input: SaveCompensationCaseInput,
): Promise<CompensationCaseRecord> {
  const context = await requireWorkspacePermission("compensation.manage");
  const { client, userId, workspaceId } = context;
  const db = dynamicDb(client);
  const orderNumber = input.orderNumber.trim();
  if (normalizeOrderLookupKey(orderNumber).length < 3) throw new Error("رقم الطلب غير صالح.");
  if (!Number.isFinite(input.compensationAmount) || input.compensationAmount < 0) {
    throw new Error("مبلغ التعويض يجب أن يكون مبلغاً صالحاً غير سالب.");
  }

  const reason = input.compensationReason.trim();
  const explanation = input.employeeExplanation.trim();
  if (!reason || reason.length > 1000) throw new Error("سبب التعويض مطلوب.");
  if (!explanation || explanation.length > 6000) throw new Error("شرح الموظف مطلوب.");

  const evidence = await assertOwnedEvidence(client, workspaceId, input.evidenceId);
  const period = await assertOwnedPeriod(workspaceId, userId, input.periodId);

  if (period && period.platform !== input.platform) {
    throw new Error("المنصة المختارة لا تطابق منصة فترة التدقيق المحددة.");
  }

  let branchName = input.branchName?.trim() || null;
  let branchId = evidence?.branch_id ?? null;

  if (!branchName && evidence) {
    const branches = await branchNamesById(client, workspaceId, [evidence.branch_chat_id]);
    branchName = branches.get(evidence.branch_chat_id) ?? null;
  }

  if (!branchId) {
    const resolved = await resolveAccessibleBranch(client, workspaceId, branchName);
    branchId = resolved?.id ?? null;
    if (resolved) branchName = resolved.name;
  }

  assertBranchAccess(context, branchId);

  const amount = Math.round(input.compensationAmount * 100) / 100;
  const status = input.status ?? "ready";
  if (input.recoveredAmount != null && (!Number.isFinite(input.recoveredAmount) || input.recoveredAmount < 0)) {
    throw new Error("المبلغ المسترَد يجب أن يكون مبلغاً صالحاً غير سالب.");
  }
  if (input.recoveredAmount != null && input.recoveredAmount > amount + 0.005) {
    throw new Error("المبلغ المسترَد لا يمكن أن يتجاوز مبلغ التعويض المطالَب به.");
  }

  let existing: { status: string; audit_context: Json } | null = null;
  if (input.id) {
    const { data, error } = await db
      .from("compensation_cases")
      .select("status,audit_context")
      .eq("id", input.id)
      .eq("workspace_id", workspaceId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("تعذّر العثور على حالة التعويض.");
    existing = data;
  } else {
    // One claim per order and platform: a second case would double-count the money.
    const { data, error } = await db
      .from("compensation_cases")
      .select("id,status")
      .eq("workspace_id", workspaceId)
      .eq("platform", input.platform)
      .eq("order_number", orderNumber)
      .limit(1);
    if (error) throw new Error(error.message);
    const duplicate = (data ?? [])[0] as { id: string; status: string } | undefined;
    if (duplicate) {
      const label = CASE_STATUS_LABELS[duplicate.status as keyof typeof CASE_STATUS_LABELS] ?? duplicate.status;
      throw new Error(
        `يوجد حالة تعويض لهذا الطلب على ${PLATFORM_LABELS[input.platform]} (الحالة: ${label}). افتحها من صفحة الحالات بدلاً من إنشاء حالة مكررة.`,
      );
    }
  }

  const now = new Date().toISOString();
  const workflow = advanceCaseWorkflow(
    readCaseWorkflow(existing?.audit_context),
    existing?.status ?? null,
    { status, compensationAmount: amount, recoveredAmount: input.recoveredAmount, note: input.statusNote },
    now,
  );
  const baseContext = auditContextFor(period, orderNumber) as Record<string, Json>;
  const auditContext = { ...baseContext, workflow: workflow as unknown as Json } as Json;

  const drafts = buildCompensationDisputeDraft({
    platform: input.platform,
    orderNumber,
    branchName,
    compensationAmount: amount,
    compensationReason: reason,
    employeeExplanation: explanation,
    evidenceCapturedAt: evidence?.captured_at ?? null,
    evidenceSenderName: evidence?.sender_name ?? null,
  });

  const payload = {
    user_id: userId,
    workspace_id: workspaceId,
    branch_id: branchId,
    period_id: input.periodId ?? null,
    evidence_id: input.evidenceId ?? null,
    platform: input.platform,
    order_number: orderNumber,
    branch_name: branchName,
    compensation_amount: amount,
    compensation_reason: reason,
    employee_explanation: explanation,
    audit_context: auditContext,
    draft_ar: drafts.ar,
    draft_en: drafts.en,
    status,
    aggregator_case_reference: input.aggregatorCaseReference?.trim() || null,
    updated_at: now,
  };

  if (input.id) {
    const { data, error } = await db
      .from("compensation_cases")
      .update(payload)
      .eq("id", input.id)
      .eq("workspace_id", workspaceId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(caseWriteErrorMessage(error));
    if (!data) throw new Error("تعذّر العثور على حالة التعويض.");
    const saved = mapCase(data);
    logCaseStatus(saved, existing?.status ?? null, workflow.recoveredAmount, context.actorUserId);
    return saved;
  }

  const { data, error } = await db
    .from("compensation_cases")
    .insert(payload)
    .select("*")
    .single();
  if (error) throw new Error(caseWriteErrorMessage(error));
  const created = mapCase(data);
  logEvent("compensation_case_created", {
    case_id: created.id,
    workspace_id: workspaceId,
    platform: created.platform,
    status: created.status,
    amount: created.compensationAmount,
    has_evidence: Boolean(created.evidenceId),
    actor_user_id: context.actorUserId,
  });
  return created;
}

function logCaseStatus(
  saved: CompensationCaseRecord,
  previousStatus: string | null,
  recoveredAmount: number | null,
  actorUserId: string,
): void {
  if (previousStatus === saved.status) return;
  const fields = { case_id: saved.id, from: previousStatus, to: saved.status, actor_user_id: actorUserId };
  logEvent("compensation_status_changed", fields);
  if (saved.status === "recovered") {
    logEvent("compensation_recovered", {
      ...fields,
      claimed: saved.compensationAmount,
      recovered: recoveredAmount ?? saved.compensationAmount,
    });
  }
}


export async function deleteCompensationCaseOnServer(id: string): Promise<void> {
  const { client, workspaceId } = await requireWorkspacePermission("compensation.manage");
  const { data, error } = await dynamicDb(client)
    .from("compensation_cases")
    .delete()
    .eq("id", id)
    .eq("workspace_id", workspaceId)
    .select("id");
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) {
    throw new Error("تعذّر حذف الحالة. الحذف متاح للمالك والمدير والمدقق فقط.");
  }
}

export async function listCompensationCasesOnServer(limit = 200): Promise<CompensationCaseRecord[]> {
  const { client, workspaceId } = await requireWorkspacePermission("compensation.read");
  const { data, error } = await dynamicDb(client)
    .from("compensation_cases")
    .select("*")
    .eq("workspace_id", workspaceId)
    .order("updated_at", { ascending: false })
    .limit(Math.min(Math.max(Math.trunc(limit), 1), 5000));
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapCase);
}
