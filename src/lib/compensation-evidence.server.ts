import { getRequestHeader } from "@tanstack/react-start/server";

import type { Json } from "@/integrations/supabase/types";

import type { JahezCompensationTransaction } from "./analysis/types";
import {
  buildCompensationDisputeDraft,
  normalizeOrderLookupKey,
  telegramMessageUrl,
  type CompensationPlatform,
} from "./compensation-evidence";
import type { StoredPeriod } from "./periods";
import { requireServerUser, type ServerUserClient } from "./server-auth.server";

const THUMBNAIL_BUCKET = "telegram-evidence-thumbnails";
const CONNECTION_CODE_TTL_MINUTES = 30;
const CONNECTION_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export interface TelegramBranchConnection {
  id: string;
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
  branchChatId: string;
  branchName: string;
  orderNumber: string;
  capturedAt: string;
  senderName: string | null;
  mediaType: string;
  durationSeconds: number | null;
  fileSizeBytes: number | null;
  thumbnailUrl: string | null;
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

const STABLE_PUBLIC_ORIGIN =
  "https://project--c8c8cb97-1c44-4eef-aea1-bca4bc93f7a1-dev.lovable.app";

function optionalPublicOrigin(): string | null {
  const configured = process.env["TADQEEQ_PUBLIC_URL"]?.trim();
  const origin = configured || getRequestHeader("origin")?.trim() || "";

  try {
    const parsed = new URL(origin);
    // Telegram requires a public HTTPS URL; editor preview hosts are auth-gated.
    if (parsed.protocol !== "https:" || parsed.hostname.startsWith("id-preview--")) {
      return STABLE_PUBLIC_ORIGIN;
    }
    return parsed.origin;
  } catch {
    return STABLE_PUBLIC_ORIGIN;
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
  const { client, userId } = await requireServerUser();
  const { data, error } = await client
    .from("telegram_branch_chats")
    .select("*")
    .eq("user_id", userId)
    .order("branch_name", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []).map(mapConnection);
}

export async function listBranchNameOptionsOnServer(): Promise<string[]> {
  const { client, userId } = await requireServerUser();
  const names = new Set<string>();

  const mappings = await client
    .from("hungerstation_branch_mappings")
    .select("invoice_branch_name")
    .eq("user_id", userId)
    .order("invoice_branch_name", { ascending: true });
  if (mappings.error) throw new Error(mappings.error.message);
  for (const row of mappings.data ?? []) {
    const name = row.invoice_branch_name?.trim();
    if (name) names.add(name);
  }

  const connections = await client
    .from("telegram_branch_chats")
    .select("branch_name")
    .eq("user_id", userId)
    .order("branch_name", { ascending: true });
  if (connections.error) throw new Error(connections.error.message);
  for (const row of connections.data ?? []) {
    const name = row.branch_name?.trim();
    if (name) names.add(name);
  }

  const periods = await client
    .from("periods")
    .select("branches")
    .eq("user_id", userId)
    .is("superseded_at", null);
  if (!periods.error) {
    for (const row of periods.data ?? []) {
      const list = Array.isArray(row.branches) ? row.branches : [];
      for (const b of list as Array<Record<string, unknown>>) {
        const raw = b?.["name"] ?? b?.["branch"] ?? b?.["branchName"];
        const name = typeof raw === "string" ? raw.trim() : "";
        if (name) names.add(name);
      }
    }
  }

  return Array.from(names).sort((a, b) => a.localeCompare(b, "ar"));
}

export async function createTelegramBranchConnectionOnServer(
  branchNameInput: string,
): Promise<{ connection: TelegramBranchConnection; code: string }> {
  const { client, userId } = await requireServerUser();
  const branchName = branchNameInput.trim().replace(/\s+/g, " ");
  if (!branchName || branchName.length > 160) {
    throw new Error("اسم الفرع مطلوب ويجب ألا يتجاوز 160 حرفاً.");
  }

  const branchKey = normalizeBranchKey(branchName);
  const code = randomConnectionCode();
  const codeHash = await sha256Text(code);
  const expiresAt = new Date(Date.now() + CONNECTION_CODE_TTL_MINUTES * 60_000).toISOString();
  const updatedAt = new Date().toISOString();

  const { data: existing, error: lookupError } = await client
    .from("telegram_branch_chats")
    .select("id")
    .eq("user_id", userId)
    .eq("branch_key", branchKey)
    .maybeSingle();

  if (lookupError) throw new Error(lookupError.message);

  const mutation = existing
    ? client
        .from("telegram_branch_chats")
        .update({
          branch_name: branchName,
          connect_code_hash: codeHash,
          connect_code_expires_at: expiresAt,
          active: true,
          updated_at: updatedAt,
        })
        .eq("id", existing.id)
        .eq("user_id", userId)
    : client.from("telegram_branch_chats").insert({
        user_id: userId,
        branch_key: branchKey,
        branch_name: branchName,
        connect_code_hash: codeHash,
        connect_code_expires_at: expiresAt,
        active: true,
        updated_at: updatedAt,
      });

  const { data, error } = await mutation.select("*").single();
  if (error) throw new Error(error.message);

  return { connection: mapConnection(data), code };
}

export async function setTelegramBranchConnectionActiveOnServer(
  id: string,
  active: boolean,
): Promise<TelegramBranchConnection> {
  const { client, userId } = await requireServerUser();
  const { data, error } = await client
    .from("telegram_branch_chats")
    .update({ active, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("user_id", userId)
    .select("*")
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) throw new Error("تعذّر العثور على ربط الفرع.");
  return mapConnection(data);
}

export async function getTelegramIntegrationStatusOnServer(): Promise<TelegramIntegrationStatus> {
  await requireServerUser();
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
  await requireServerUser();
  const secret = requiredTelegramEnv("TELEGRAM_WEBHOOK_SECRET");
  const origin = optionalPublicOrigin();
  if (!origin) {
    throw new Error("تعذّر تحديد رابط Tadqeeq العام. اضبط TADQEEQ_PUBLIC_URL.");
  }

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
  userId: string,
  ids: string[],
): Promise<Map<string, string>> {
  if (!ids.length) return new Map();
  const { data, error } = await client
    .from("telegram_branch_chats")
    .select("id, branch_name")
    .eq("user_id", userId)
    .in("id", ids);

  if (error) throw new Error(error.message);
  return new Map((data ?? []).map((row) => [row.id, row.branch_name]));
}

async function signedThumbnail(
  client: ServerUserClient,
  path: string | null,
): Promise<string | null> {
  if (!path) return null;
  const { data, error } = await client.storage
    .from(THUMBNAIL_BUCKET)
    .createSignedUrl(path, 300);
  if (error) return null;
  return data.signedUrl;
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
  const { client, userId } = await requireServerUser();
  const orderNumber = orderNumberInput.trim();
  const lookupKey = normalizeOrderLookupKey(orderNumber);
  if (lookupKey.length < 3 || lookupKey.length > 120) {
    throw new Error("أدخل رقم طلب صالحاً.");
  }

  const suffixPattern = `%${lookupKey.replace(/[%_]/g, (char) => `\\${char}`)}`;

  const [{ data: evidenceRows, error: evidenceError }, { data: periodRows, error: periodError }] =
    await Promise.all([
      client
        .from("telegram_order_evidence")
        .select("*")
        .eq("user_id", userId)
        .like("order_lookup_key", suffixPattern)
        .order("captured_at", { ascending: false })
        .limit(25),
      client
        .from("periods")
        .select("*")
        .eq("user_id", userId)
        .eq("platform", "jahez")
        .is("superseded_at", null)
        .order("created_at", { ascending: false })
        .limit(120),
    ]);

  if (evidenceError) throw new Error(evidenceError.message);
  if (periodError) throw new Error(periodError.message);

  const branchIds = Array.from(new Set((evidenceRows ?? []).map((row) => row.branch_chat_id)));
  const branches = await branchNamesById(client, userId, branchIds);

  const evidence = await Promise.all(
    (evidenceRows ?? []).map(async (row) => ({
      id: row.id,
      branchChatId: row.branch_chat_id,
      branchName: branches.get(row.branch_chat_id) ?? "فرع غير معروف",
      orderNumber: row.order_number,
      capturedAt: row.captured_at,
      senderName: row.sender_name,
      mediaType: row.media_type,
      durationSeconds: row.duration_seconds,
      fileSizeBytes: row.file_size_bytes,
      thumbnailUrl: await signedThumbnail(client, row.thumbnail_storage_path),
      telegramUrl: telegramMessageUrl(row.telegram_chat_id, row.telegram_message_id),
    })),
  );

  const jahezMatches = (periodRows ?? [])
    .flatMap((row) => jahezMatchesForPeriod(row as unknown as StoredPeriod, lookupKey))
    .sort((left, right) => right.creationDate.localeCompare(left.creationDate));

  return { evidence, jahezMatches };
}

async function assertOwnedEvidence(
  client: ServerUserClient,
  userId: string,
  evidenceId: string | null | undefined,
): Promise<{
  id: string;
  captured_at: string;
  sender_name: string | null;
  branch_chat_id: string;
} | null> {
  if (!evidenceId) return null;
  const { data, error } = await client
    .from("telegram_order_evidence")
    .select("id, captured_at, sender_name, branch_chat_id")
    .eq("id", evidenceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("دليل Telegram المحدد غير موجود.");
  return data;
}

async function assertOwnedPeriod(
  client: ServerUserClient,
  userId: string,
  periodId: string | null | undefined,
): Promise<StoredPeriod | null> {
  if (!periodId) return null;
  const { data, error } = await client
    .from("periods")
    .select("*")
    .eq("id", periodId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("فترة التدقيق المحددة غير موجودة.");
  return data as unknown as StoredPeriod;
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
  const { client, userId } = await requireServerUser();
  const orderNumber = input.orderNumber.trim();
  if (normalizeOrderLookupKey(orderNumber).length < 3) throw new Error("رقم الطلب غير صالح.");
  if (!Number.isFinite(input.compensationAmount) || input.compensationAmount < 0) {
    throw new Error("مبلغ التعويض يجب أن يكون مبلغاً صالحاً غير سالب.");
  }

  const reason = input.compensationReason.trim();
  const explanation = input.employeeExplanation.trim();
  if (!reason || reason.length > 1000) throw new Error("سبب التعويض مطلوب.");
  if (!explanation || explanation.length > 6000) throw new Error("شرح الموظف مطلوب.");

  const evidence = await assertOwnedEvidence(client, userId, input.evidenceId);
  const period = await assertOwnedPeriod(client, userId, input.periodId);

  let branchName = input.branchName?.trim() || null;
  if (!branchName && evidence) {
    const branches = await branchNamesById(client, userId, [evidence.branch_chat_id]);
    branchName = branches.get(evidence.branch_chat_id) ?? null;
  }

  const amount = Math.round(input.compensationAmount * 100) / 100;
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
    period_id: input.periodId ?? null,
    evidence_id: input.evidenceId ?? null,
    platform: input.platform,
    order_number: orderNumber,
    branch_name: branchName,
    compensation_amount: amount,
    compensation_reason: reason,
    employee_explanation: explanation,
    audit_context: auditContextFor(period, orderNumber),
    draft_ar: drafts.ar,
    draft_en: drafts.en,
    status: input.status ?? "ready",
    aggregator_case_reference: input.aggregatorCaseReference?.trim() || null,
    updated_at: new Date().toISOString(),
  };

  if (input.id) {
    const { data, error } = await client
      .from("compensation_cases")
      .update(payload)
      .eq("id", input.id)
      .eq("user_id", userId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) throw new Error("تعذّر العثور على حالة التعويض.");
    return mapCase(data);
  }

  const { data, error } = await client
    .from("compensation_cases")
    .insert({ ...payload, user_id: userId })
    .select("*")
    .single();
  if (error) throw new Error(error.message);
  return mapCase(data);
}

export async function listCompensationCasesOnServer(): Promise<CompensationCaseRecord[]> {
  const { client, userId } = await requireServerUser();
  const { data, error } = await client
    .from("compensation_cases")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(200);
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapCase);
}

export interface EvidenceMediaLinks {
  kind: "image" | "video";
  previewUrl: string;
  downloadUrl: string;
}

export async function getEvidenceMediaOnServer(
  evidenceId: string,
): Promise<EvidenceMediaLinks> {
  const { client, userId } = await requireServerUser();
  const { data: row, error } = await client
    .from("telegram_order_evidence")
    .select("id, order_number, telegram_file_id")
    .eq("id", evidenceId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("الدليل غير موجود.");

  const folder = `${userId}/media`;
  const findStored = async () => {
    const { data } = await client.storage
      .from(THUMBNAIL_BUCKET)
      .list(folder, { search: row.id, limit: 5 });
    return data?.find((item) => item.name.startsWith(row.id)) ?? null;
  };

  let stored = await findStored();
  if (!stored) {
    // Older evidence: fetch the original from Telegram once and archive it.
    const token = process.env["TELEGRAM_BOT_TOKEN"]?.trim();
    if (!token) throw new Error("إعدادات Telegram غير مكتملة.");
    const info = await fetch(`https://api.telegram.org/bot${token}/getFile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file_id: row.telegram_file_id }),
    }).then((r) => r.json() as Promise<{ ok?: boolean; result?: { file_path?: string } }>);
    const filePath = info.result?.file_path;
    if (!info.ok || !filePath) {
      throw new Error("تعذّر جلب الملف من Telegram (الحد الأقصى 20 ميجابايت).");
    }
    const response = await fetch(`https://api.telegram.org/file/bot${token}/${filePath}`);
    if (!response.ok) throw new Error("تعذّر تنزيل الملف من Telegram.");
    const bytes = await response.arrayBuffer();
    const ext = filePath.split(".").pop()?.toLowerCase() || "bin";
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { mimeFromPath } = await import("./telegram-webhook.server");
    const { error: uploadError } = await supabaseAdmin.storage
      .from(THUMBNAIL_BUCKET)
      .upload(`${folder}/${row.id}.${ext}`, bytes, {
        contentType: mimeFromPath(filePath),
        upsert: true,
      });
    if (uploadError) throw new Error("تعذّر حفظ نسخة من الدليل.");
    stored = await findStored();
    if (!stored) throw new Error("تعذّر تجهيز الدليل.");
  }

  const path = `${folder}/${stored.name}`;
  const ext = stored.name.split(".").pop()?.toLowerCase() ?? "";
  const kind = ["mp4", "mov", "webm", "mkv"].includes(ext) ? "video" : "image";
  const [preview, download] = await Promise.all([
    client.storage.from(THUMBNAIL_BUCKET).createSignedUrl(path, 900),
    client.storage
      .from(THUMBNAIL_BUCKET)
      .createSignedUrl(path, 900, { download: `order-${row.order_number}.${ext}` }),
  ]);
  if (preview.error || download.error) throw new Error("تعذّر إنشاء رابط الدليل.");
  return { kind, previewUrl: preview.data.signedUrl, downloadUrl: download.data.signedUrl };
}
