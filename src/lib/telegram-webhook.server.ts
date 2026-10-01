import { supabaseAdmin } from "@/integrations/supabase/client.server";

import {
  extractOrderNumber,
  normalizeOrderLookupKey,
} from "./compensation-evidence";
import { detectOrderNumberFromImage } from "./ai/order-number-vision.server";
import { ORDER_NUMBER_DETECTION_MAX_BYTES, TELEGRAM_GET_FILE_LIMIT_BYTES } from "./limits";
import { logEvent } from "./observability";

// Generated database types are refreshed after the workspace migration.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const adminDb = () => supabaseAdmin as any;

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
}

interface TelegramChat {
  id: number;
  type: string;
  title?: string;
}

interface TelegramPhotoSize {
  file_id: string;
  file_unique_id: string;
  width?: number;
  height?: number;
  file_size?: number;
}

interface TelegramVideo {
  file_id: string;
  file_unique_id: string;
  duration?: number;
  file_size?: number;
  thumbnail?: TelegramPhotoSize;
}

interface TelegramDocument {
  file_id: string;
  file_unique_id: string;
  file_size?: number;
  mime_type?: string;
  thumbnail?: TelegramPhotoSize;
}

interface TelegramMessage {
  message_id: number;
  date: number;
  chat: TelegramChat;
  from?: TelegramUser;
  text?: string;
  caption?: string;
  photo?: TelegramPhotoSize[];
  video?: TelegramVideo;
  document?: TelegramDocument;
  reply_to_message?: TelegramMessage;
  migrate_to_chat_id?: number;
  migrate_from_chat_id?: number;
}

interface TelegramUpdate {
  update_id?: number;
  message?: TelegramMessage;
}

interface TelegramMedia {
  fileId: string;
  fileUniqueId: string;
  thumbnailFileId: string | null;
  durationSeconds: number | null;
  fileSizeBytes: number | null;
  mediaType: "video" | "video_document" | "photo" | "image_document";
}

function requiredEnv(name: "TELEGRAM_BOT_TOKEN" | "TELEGRAM_WEBHOOK_SECRET"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Telegram server configuration is incomplete.");
  return value;
}

async function sha256Text(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (item) => item.toString(16).padStart(2, "0")).join("");
}

export function mediaFrom(
  message: TelegramMessage | undefined,
): TelegramMedia | null {
  if (!message) return null;

  if (message.photo?.length) {
    const sizes = [...message.photo].sort((a, b) => (b.width ?? 0) - (a.width ?? 0));
    const largest = sizes[0];
    if (largest) {
      const thumbnail = sizes.find((size) => size.file_id !== largest.file_id) ?? null;
      return {
        fileId: largest.file_id,
        fileUniqueId: largest.file_unique_id,
        thumbnailFileId: thumbnail?.file_id ?? null,
        durationSeconds: null,
        fileSizeBytes: largest.file_size ?? null,
        mediaType: "photo",
      };
    }
  }

  if (message.video) {
    return {
      fileId: message.video.file_id,
      fileUniqueId: message.video.file_unique_id,
      thumbnailFileId: message.video.thumbnail?.file_id ?? null,
      durationSeconds: message.video.duration ?? null,
      fileSizeBytes: message.video.file_size ?? null,
      mediaType: "video",
    };
  }

  const mimeType = message.document?.mime_type?.toLowerCase() ?? "";
  if (mimeType.startsWith("video/")) {
    return {
      fileId: message.document!.file_id,
      fileUniqueId: message.document!.file_unique_id,
      thumbnailFileId: message.document!.thumbnail?.file_id ?? null,
      durationSeconds: null,
      fileSizeBytes: message.document!.file_size ?? null,
      mediaType: "video_document",
    };
  }

  if (mimeType.startsWith("image/")) {
    return {
      fileId: message.document!.file_id,
      fileUniqueId: message.document!.file_unique_id,
      thumbnailFileId: message.document!.thumbnail?.file_id ?? null,
      durationSeconds: null,
      fileSizeBytes: message.document!.file_size ?? null,
      mediaType: "image_document",
    };
  }

  return null;
}

function senderName(user: TelegramUser | undefined): string | null {
  if (!user) return null;
  const full = [user.first_name, user.last_name].filter(Boolean).join(" ").trim();
  return full || user.username || null;
}

async function telegramCall<T>(
  method: string,
  payload: Record<string, unknown>,
): Promise<T> {
  const token = requiredEnv("TELEGRAM_BOT_TOKEN");
  const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as {
    ok?: boolean;
    result?: T;
    description?: string;
  };
  if (!response.ok || !body.ok || body.result === undefined) {
    throw new Error(body.description || `Telegram ${method} failed`);
  }
  return body.result;
}

async function sendMessage(chatId: number, text: string, replyTo?: number): Promise<void> {
  try {
    await telegramCall("sendMessage", {
      chat_id: chatId,
      text,
      ...(replyTo ? { reply_parameters: { message_id: replyTo } } : {}),
    });
  } catch (error) {
    console.error("Telegram acknowledgement failed", error);
  }
}

const SUSPENDED_REPLY = "حساب المنشأة في Tadqeeq موقوف مؤقتاً، لذلك لن تُسجَّل الأدلة حتى إعادة تفعيل الحساب.";

/** Suspended workspaces keep their groups linked, but the bot stops recording anything for them. */
async function workspaceSuspended(workspaceId: string | null): Promise<boolean> {
  if (!workspaceId) return false;
  const { data, error } = await adminDb()
    .from("workspace_onboarding")
    .select("status")
    .eq("workspace_id", workspaceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.status === "suspended";
}

async function connectBranch(message: TelegramMessage, code: string): Promise<void> {
  if (!["group", "supergroup"].includes(message.chat.type)) {
    await sendMessage(
      message.chat.id,
      "استخدم أمر الربط داخل قروب Telegram الخاص بالفرع.",
      message.message_id,
    );
    return;
  }

  const codeHash = await sha256Text(code.toUpperCase());
  const { data: connection, error } = await adminDb()
    .from("telegram_branch_chats")
    .select("id, user_id, workspace_id, branch_id, branch_name, connect_code_expires_at")
    .eq("connect_code_hash", codeHash)
    .eq("active", true)
    .gt("connect_code_expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) throw new Error(error.message);
  if (!connection) {
    await sendMessage(
      message.chat.id,
      "رمز الربط غير صالح أو انتهت صلاحيته. أنشئ رمزاً جديداً من Tadqeeq.",
      message.message_id,
    );
    return;
  }
  if (await workspaceSuspended(connection.workspace_id)) {
    await sendMessage(message.chat.id, SUSPENDED_REPLY, message.message_id);
    return;
  }

  const now = new Date().toISOString();
  const { error: updateError } = await supabaseAdmin
    .from("telegram_branch_chats")
    .update({
      telegram_chat_id: message.chat.id,
      telegram_chat_title: message.chat.title?.trim() || null,
      connect_code_hash: null,
      connect_code_expires_at: null,
      connected_at: now,
      last_message_at: now,
      updated_at: now,
    })
    .eq("id", connection.id)
    .eq("user_id", connection.user_id);

  if (updateError) {
    if (updateError.code === "23505") {
      await sendMessage(
        message.chat.id,
        "هذا القروب مربوط بالفعل بفرع آخر في Tadqeeq.",
        message.message_id,
      );
      return;
    }
    throw new Error(updateError.message);
  }

  await sendMessage(
    message.chat.id,
    `✅ تم ربط القروب بفرع ${connection.branch_name}.\n\nأرسل فيديو أو صورة الطلب فقط — سيقرأ Tadqeeq AI رقم الطلب تلقائياً من الفاتورة أو الملصق.`,
    message.message_id,
  );
}

async function downloadTelegramFile(
  fileId: string,
  maxBytes: number,
): Promise<{ bytes: ArrayBuffer; filePath: string } | null> {
  const file = await telegramCall<{ file_path?: string; file_size?: number }>("getFile", {
    file_id: fileId,
  });
  if (!file.file_path) return null;
  if (file.file_size && file.file_size > maxBytes) return null;
  const token = requiredEnv("TELEGRAM_BOT_TOKEN");
  const response = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
  if (!response.ok) return null;
  const bytes = await response.arrayBuffer();
  if (bytes.byteLength <= 0 || bytes.byteLength > maxBytes) return null;
  return { bytes, filePath: file.file_path };
}

export function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp",
    gif: "image/gif", heic: "image/heic", mp4: "video/mp4", mov: "video/quicktime",
    webm: "video/webm", mkv: "video/x-matroska",
  };
  return map[ext] ?? "application/octet-stream";
}

async function detectOrderNumber(media: TelegramMedia): Promise<string | null> {
  const isImage = media.mediaType === "photo" || media.mediaType === "image_document";
  const sourceId = isImage ? media.fileId : media.thumbnailFileId;
  if (!sourceId) return null;
  try {
    const file = await downloadTelegramFile(sourceId, ORDER_NUMBER_DETECTION_MAX_BYTES);
    if (!file) return null;
    let mime = mimeFromPath(file.filePath);
    if (!mime.startsWith("image/") || mime === "image/heic") mime = "image/jpeg";
    return await detectOrderNumberFromImage(file.bytes, mime);
  } catch (error) {
    console.error("AI order number detection failed", error);
    return null;
  }
}

/** Telegram will not let the bot fetch files over 20 MB, so Tadqeeq cannot preview them later. */
export function oversizedEvidenceWarning(fileSizeBytes: number | null | undefined): string {
  if (!fileSizeBytes || fileSizeBytes <= TELEGRAM_GET_FILE_LIMIT_BYTES) return "";
  return "\n\n⚠️ حجم الملف أكبر من 20 ميجابايت، لذلك لن يمكن معاينته أو تنزيله من تدقيق. أرسل نسخة أقصر أو صورة واضحة للفاتورة إن أمكن.";
}

async function storeEvidence(
  incomingMessage: TelegramMessage,
  mediaMessage: TelegramMessage,
  media: TelegramMedia,
  orderText: string | null | undefined,
): Promise<void> {
  const { data: connection, error: connectionError } = await adminDb()
    .from("telegram_branch_chats")
    .select("id, user_id, workspace_id, branch_id, branch_name")
    .eq("telegram_chat_id", incomingMessage.chat.id)
    .eq("active", true)
    .maybeSingle();

  if (connectionError) throw new Error(connectionError.message);
  if (!connection) {
    await sendMessage(
      incomingMessage.chat.id,
      "هذا القروب غير مربوط بـ Tadqeeq. أنشئ رمز ربط من مركز التعويضات ثم استخدم /connect CODE.",
      incomingMessage.message_id,
    );
    return;
  }
  if (await workspaceSuspended(connection.workspace_id)) {
    await sendMessage(incomingMessage.chat.id, SUSPENDED_REPLY, incomingMessage.message_id);
    return;
  }

  let orderNumber = extractOrderNumber(orderText);
  let detectedByAi = false;
  if (!orderNumber) {
    orderNumber = await detectOrderNumber(media);
    detectedByAi = Boolean(orderNumber);
  }
  if (!orderNumber) {
    await sendMessage(
      incomingMessage.chat.id,
      "لم أتمكن من قراءة رقم الطلب من الدليل. رد على هذه الرسالة الأصلية برقم الطلب، أو أرسل صورة أوضح للفاتورة.",
      mediaMessage.message_id,
    );
    return;
  }

  const { data: existing, error: duplicateError } = await supabaseAdmin
    .from("telegram_order_evidence")
    .select("id")
    .eq("telegram_chat_id", incomingMessage.chat.id)
    .eq("telegram_message_id", mediaMessage.message_id)
    .maybeSingle();

  if (duplicateError) throw new Error(duplicateError.message);
  if (existing && incomingMessage.message_id !== mediaMessage.message_id && !detectedByAi) {
    await supabaseAdmin
      .from("telegram_order_evidence")
      .update({
        order_number: orderNumber,
        order_lookup_key: normalizeOrderLookupKey(orderNumber),
      })
      .eq("id", existing.id);
    await sendMessage(
      incomingMessage.chat.id,
      `✏️ تم تحديث رقم الطلب إلى ${orderNumber}.`,
      incomingMessage.message_id,
    );
    return;
  }
  if (existing) {
    await sendMessage(
      incomingMessage.chat.id,
      `✅ الدليل محفوظ مسبقاً للطلب ${orderNumber}.`,
      incomingMessage.message_id,
    );
    return;
  }

  const evidenceId = crypto.randomUUID();
  const capturedAt = new Date(mediaMessage.date * 1000).toISOString();
  const sender = mediaMessage.from ?? incomingMessage.from;
  const storedMediaType = media.mediaType;
  const { error: insertError } = await adminDb()
    .from("telegram_order_evidence")
    .insert({
      id: evidenceId,
      user_id: connection.user_id,
      workspace_id: connection.workspace_id,
      branch_id: connection.branch_id,
      branch_chat_id: connection.id,
      order_number: orderNumber,
      order_lookup_key: normalizeOrderLookupKey(orderNumber),
      telegram_chat_id: incomingMessage.chat.id,
      telegram_message_id: mediaMessage.message_id,
      telegram_file_id: media.fileId,
      telegram_file_unique_id: media.fileUniqueId,
      media_type: storedMediaType,
      thumbnail_file_id: media.thumbnailFileId,
      sender_telegram_id: sender?.id ?? null,
      sender_name: senderName(sender),
      caption: mediaMessage.caption?.trim() || null,
      captured_at: capturedAt,
      duration_seconds: media.durationSeconds,
      file_size_bytes: media.fileSizeBytes,
    });

  if (insertError) throw new Error(insertError.message);
  logEvent("telegram_evidence_metadata_saved", {
    evidence_id: evidenceId,
    workspace_id: connection.workspace_id,
    branch_id: connection.branch_id,
    media_type: storedMediaType,
    file_size_bytes: media.fileSizeBytes,
    detected_by_ai: detectedByAi,
  });

  // Media stays in Telegram: only the reference above is stored, and the file is
  // fetched on demand when an authorised user previews or downloads it.

  const now = new Date().toISOString();
  const { error: activityError } = await supabaseAdmin
    .from("telegram_branch_chats")
    .update({ last_message_at: now, updated_at: now })
    .eq("id", connection.id)
    .eq("user_id", connection.user_id);
  if (activityError) {
    console.error("Failed to update Telegram branch activity", activityError.message);
  }

  await sendMessage(
    incomingMessage.chat.id,
    `✅ تم حفظ الدليل\nرقم الطلب: ${orderNumber}${detectedByAi ? " (قرأه Tadqeeq AI)" : ""}\nالفرع: ${connection.branch_name}\n\nإذا كان الرقم خاطئاً، رد على الدليل بالرقم الصحيح.${oversizedEvidenceWarning(media.fileSizeBytes)}`,
    incomingMessage.message_id,
  );
}

async function migrateChat(fromId: number, toId: number): Promise<void> {
  const { error } = await supabaseAdmin
    .from("telegram_branch_chats")
    .update({ telegram_chat_id: toId })
    .eq("telegram_chat_id", fromId);
  if (error) throw new Error(error.message);
}

async function recoverUpgradedChat(chat: TelegramChat): Promise<void> {
  // A group promoted to supergroup gets a new id (-100...). If we missed the
  // migration update, re-link the single active legacy group with the same title.
  if (chat.type !== "supergroup" || !chat.title) return;
  const { data } = await supabaseAdmin
    .from("telegram_branch_chats")
    .select("id, telegram_chat_id")
    .eq("active", true)
    .eq("telegram_chat_title", chat.title);
  const legacy = (data ?? []).filter(
    (row) => Number(row.telegram_chat_id) > -1_000_000_000_000,
  );
  if (legacy.length !== 1 || !legacy[0]) return;
  await supabaseAdmin
    .from("telegram_branch_chats")
    .update({ telegram_chat_id: chat.id })
    .eq("id", legacy[0].id);
}

async function handleMessage(message: TelegramMessage): Promise<void> {
  if (message.migrate_to_chat_id) {
    await migrateChat(message.chat.id, message.migrate_to_chat_id);
    return;
  }
  if (message.migrate_from_chat_id) {
    await migrateChat(message.migrate_from_chat_id, message.chat.id);
    return;
  }

  const connectMatch = message.text
    ?.trim()
    .match(/^\/connect(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9]{6,16})\s*$/i);

  if (connectMatch?.[1]) {
    await connectBranch(message, connectMatch[1]);
    return;
  }

  await recoverUpgradedChat(message.chat);

  const directMedia = mediaFrom(message);
  if (directMedia) {
    await storeEvidence(message, message, directMedia, message.caption);
    return;
  }

  const repliedMedia = mediaFrom(message.reply_to_message);
  if (repliedMedia && message.reply_to_message && message.text) {
    await storeEvidence(
      message,
      message.reply_to_message,
      repliedMedia,
      message.text,
    );
  }
}

function secretsMatch(actual: string | null, expected: string): boolean {
  if (!actual || actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export async function handleTelegramWebhook(request: Request): Promise<Response> {
  const expectedSecret = requiredEnv("TELEGRAM_WEBHOOK_SECRET");
  const actualSecret = request.headers.get("x-telegram-bot-api-secret-token");

  if (!secretsMatch(actualSecret, expectedSecret)) {
    logEvent("permission_denied", { source: "telegram_webhook", reason: "bad_secret" }, "warn");
    return new Response("Unauthorized", { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return Response.json({ ok: true });
  }

  logEvent("telegram_webhook_received", {
    update_id: update.update_id,
    chat_id: update.message?.chat.id,
    message_id: update.message?.message_id,
    has_media: Boolean(mediaFrom(update.message)),
  });

  try {
    if (update.message) await handleMessage(update.message);
    return Response.json({ ok: true });
  } catch (error) {
    logEvent("telegram_webhook_failed", { update_id: update.update_id, error }, "error");
    return Response.json({ ok: false }, { status: 500 });
  }
}
