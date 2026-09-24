import { supabaseAdmin } from "@/integrations/supabase/client.server";

import {
  extractOrderNumber,
  normalizeOrderLookupKey,
} from "./compensation-evidence";

const THUMBNAIL_BUCKET = "telegram-evidence-thumbnails";

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
  video?: TelegramVideo;
  document?: TelegramDocument;
  reply_to_message?: TelegramMessage;
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
  mediaType: "video" | "video_document";
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

function mediaFrom(message: TelegramMessage | undefined): TelegramMedia | null {
  if (!message) return null;
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

  if (message.document?.mime_type?.toLowerCase().startsWith("video/")) {
    return {
      fileId: message.document.file_id,
      fileUniqueId: message.document.file_unique_id,
      thumbnailFileId: message.document.thumbnail?.file_id ?? null,
      durationSeconds: null,
      fileSizeBytes: message.document.file_size ?? null,
      mediaType: "video_document",
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
  const { data: connection, error } = await supabaseAdmin
    .from("telegram_branch_chats")
    .select("id, user_id, branch_name, connect_code_expires_at")
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
    `✅ تم ربط القروب بفرع ${connection.branch_name}.\n\nأرسل فيديو الطلب واكتب رقم الطلب في التعليق. وإذا نسيت الرقم، رد على الفيديو برقم الطلب.`,
    message.message_id,
  );
}

async function uploadThumbnail(
  userId: string,
  evidenceId: string,
  thumbnailFileId: string | null,
): Promise<string | null> {
  if (!thumbnailFileId) return null;

  try {
    const file = await telegramCall<{ file_path?: string }>("getFile", {
      file_id: thumbnailFileId,
    });
    if (!file.file_path) return null;

    const token = requiredEnv("TELEGRAM_BOT_TOKEN");
    const response = await fetch(
      `https://api.telegram.org/file/bot${token}/${file.file_path}`,
    );
    if (!response.ok) return null;

    const bytes = await response.arrayBuffer();
    if (bytes.byteLength <= 0 || bytes.byteLength > 2_097_152) return null;

    const path = `${userId}/${evidenceId}.jpg`;
    const { error } = await supabaseAdmin.storage
      .from(THUMBNAIL_BUCKET)
      .upload(path, bytes, {
        contentType: response.headers.get("content-type") || "image/jpeg",
        upsert: false,
      });

    if (error) {
      console.error("Telegram thumbnail upload failed", error.message);
      return null;
    }
    return path;
  } catch (error) {
    console.error("Telegram thumbnail capture failed", error);
    return null;
  }
}

async function storeEvidence(
  incomingMessage: TelegramMessage,
  mediaMessage: TelegramMessage,
  media: TelegramMedia,
  orderText: string | null | undefined,
): Promise<void> {
  const { data: connection, error: connectionError } = await supabaseAdmin
    .from("telegram_branch_chats")
    .select("id, user_id, branch_name")
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

  const orderNumber = extractOrderNumber(orderText);
  if (!orderNumber) {
    await sendMessage(
      incomingMessage.chat.id,
      "أرسل رقم الطلب فقط في تعليق الفيديو، أو رد على هذا الفيديو برقم الطلب.",
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
  const { error: insertError } = await supabaseAdmin
    .from("telegram_order_evidence")
    .insert({
      id: evidenceId,
      user_id: connection.user_id,
      branch_chat_id: connection.id,
      order_number: orderNumber,
      order_lookup_key: normalizeOrderLookupKey(orderNumber),
      telegram_chat_id: incomingMessage.chat.id,
      telegram_message_id: mediaMessage.message_id,
      telegram_file_id: media.fileId,
      telegram_file_unique_id: media.fileUniqueId,
      media_type: media.mediaType,
      thumbnail_file_id: media.thumbnailFileId,
      sender_telegram_id: sender?.id ?? null,
      sender_name: senderName(sender),
      caption: mediaMessage.caption?.trim() || null,
      captured_at: capturedAt,
      duration_seconds: media.durationSeconds,
      file_size_bytes: media.fileSizeBytes,
    });

  if (insertError) throw new Error(insertError.message);

  const thumbnailPath = await uploadThumbnail(
    connection.user_id,
    evidenceId,
    media.thumbnailFileId,
  );

  if (thumbnailPath) {
    const { error: thumbnailUpdateError } = await supabaseAdmin
      .from("telegram_order_evidence")
      .update({ thumbnail_storage_path: thumbnailPath })
      .eq("id", evidenceId)
      .eq("user_id", connection.user_id);
    if (thumbnailUpdateError) {
      console.error("Failed to persist thumbnail path", thumbnailUpdateError.message);
    }
  }

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
    `✅ Evidence received\nOrder: ${orderNumber}\nBranch: ${connection.branch_name}\nEvidence saved in Tadqeeq.`,
    incomingMessage.message_id,
  );
}

async function handleMessage(message: TelegramMessage): Promise<void> {
  const connectMatch = message.text
    ?.trim()
    .match(/^\/connect(?:@[A-Za-z0-9_]+)?\s+([A-Za-z0-9]{6,16})\s*$/i);

  if (connectMatch?.[1]) {
    await connectBranch(message, connectMatch[1]);
    return;
  }

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
    return new Response("Unauthorized", { status: 401 });
  }

  let update: TelegramUpdate;
  try {
    update = (await request.json()) as TelegramUpdate;
  } catch {
    return Response.json({ ok: true });
  }

  try {
    if (update.message) await handleMessage(update.message);
    return Response.json({ ok: true });
  } catch (error) {
    console.error("Telegram webhook processing failed", {
      updateId: update.update_id,
      error: error instanceof Error ? error.message : String(error),
    });
    return Response.json({ ok: false }, { status: 500 });
  }
}
