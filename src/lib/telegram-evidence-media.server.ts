import { TELEGRAM_GET_FILE_LIMIT_BYTES } from "./limits";
import { assertBranchAccess, requireWorkspacePermission } from "./server-auth.server";

/**
 * Telegram evidence media is never stored by Tadqeeq. The database keeps only the Telegram
 * reference (file_id); when an authorised user previews or downloads evidence, the server asks
 * Telegram for the file and streams the bytes straight through. Nothing is written to Supabase,
 * disk or a cache, and the bot-token URL never leaves the server.
 */

export { TELEGRAM_GET_FILE_LIMIT_BYTES };

export type EvidenceMediaVariant = "full" | "thumb";

export interface EvidenceMediaRow {
  id: string;
  branch_id: string | null;
  order_number: string;
  media_type: string;
  telegram_file_id: string;
  thumbnail_file_id: string | null;
}

export const EVIDENCE_NO_STORE_HEADERS = {
  "Cache-Control": "no-store, private, max-age=0",
  Pragma: "no-cache",
  "X-Content-Type-Options": "nosniff",
} as const;

const MIME_BY_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
  gif: "image/gif",
  heic: "image/heic",
  mp4: "video/mp4",
  mov: "video/quicktime",
  webm: "video/webm",
  mkv: "video/x-matroska",
  m4v: "video/x-m4v",
};

export function evidenceMimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

export function evidenceErrorResponse(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...EVIDENCE_NO_STORE_HEADERS },
  });
}

/** Which Telegram file to fetch: the original, or its small preview (photos use the photo itself). */
export function telegramFileIdFor(row: EvidenceMediaRow, variant: EvidenceMediaVariant): string | null {
  if (variant === "full") return row.telegram_file_id;
  if (row.thumbnail_file_id) return row.thumbnail_file_id;
  return row.media_type === "photo" || row.media_type === "image_document" ? row.telegram_file_id : null;
}

/**
 * Fetches one Telegram file and returns it as a streamed, uncached response. Pure apart from
 * `fetchImpl`, so tests can prove the token never reaches the response and nothing is stored.
 */
export async function streamTelegramFile(input: {
  row: EvidenceMediaRow;
  variant: EvidenceMediaVariant;
  download: boolean;
  token: string;
  fetchImpl?: typeof fetch;
}): Promise<Response> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const fileId = telegramFileIdFor(input.row, input.variant);
  if (!fileId) return evidenceErrorResponse(404, "لا توجد معاينة مصغرة لهذا الدليل.");

  let filePath: string | undefined;
  let fileSize: number | undefined;
  try {
    const info = await fetchImpl(`https://api.telegram.org/bot${input.token}/getFile`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ file_id: fileId }),
    });
    const body = (await info.json()) as {
      ok?: boolean;
      description?: string;
      result?: { file_path?: string; file_size?: number };
    };
    if (!body.ok) {
      if (/too big/i.test(body.description ?? "")) {
        return evidenceErrorResponse(413, "الملف أكبر من 20 ميجابايت ولا يسمح Telegram بجلبه. افتحه من قروب الفرع مباشرة.");
      }
      return evidenceErrorResponse(404, "الدليل غير متاح من Telegram (ربما حُذفت الرسالة).");
    }
    filePath = body.result?.file_path;
    fileSize = body.result?.file_size;
  } catch {
    return evidenceErrorResponse(502, "تعذّر الاتصال بـ Telegram. حاول مرة أخرى.");
  }

  if (!filePath) return evidenceErrorResponse(404, "الدليل غير متاح من Telegram (ربما حُذفت الرسالة).");
  if (fileSize && fileSize > TELEGRAM_GET_FILE_LIMIT_BYTES) {
    return evidenceErrorResponse(413, "الملف أكبر من 20 ميجابايت ولا يسمح Telegram بجلبه. افتحه من قروب الفرع مباشرة.");
  }

  let upstream: Response;
  try {
    upstream = await fetchImpl(`https://api.telegram.org/file/bot${input.token}/${filePath}`);
  } catch {
    return evidenceErrorResponse(502, "تعذّر تنزيل الدليل من Telegram. حاول مرة أخرى.");
  }
  if (!upstream.ok || !upstream.body) {
    return evidenceErrorResponse(502, "تعذّر تنزيل الدليل من Telegram. حاول مرة أخرى.");
  }

  const ext = filePath.split(".").pop()?.toLowerCase() || "bin";
  const safeOrder = input.row.order_number.replace(/[^A-Za-z0-9_-]/g, "") || "evidence";
  const filename = `order-${safeOrder}${input.variant === "thumb" ? "-preview" : ""}.${ext}`;
  const headers = new Headers({
    "Content-Type": evidenceMimeFromPath(filePath),
    "Content-Disposition": `${input.download ? "attachment" : "inline"}; filename="${filename}"`,
    ...EVIDENCE_NO_STORE_HEADERS,
  });
  const length = upstream.headers.get("content-length");
  if (length) headers.set("Content-Length", length);

  // The upstream body is piped straight to the browser; Tadqeeq never holds a copy.
  return new Response(upstream.body, { status: 200, headers });
}

/** GET /api/compensation/evidence/:evidenceId/media — authorise, then stream from Telegram. */
export async function handleEvidenceMediaRequest(
  request: Request,
  evidenceId: string,
  deps: {
    authorize?: () => ReturnType<typeof requireWorkspacePermission>;
    botToken?: () => string | undefined;
    fetchImpl?: typeof fetch;
  } = {},
): Promise<Response> {
  if (!/^[0-9a-f-]{36}$/i.test(evidenceId)) return evidenceErrorResponse(400, "معرّف الدليل غير صالح.");

  let context: Awaited<ReturnType<typeof requireWorkspacePermission>>;
  try {
    context = await (deps.authorize ?? (() => requireWorkspacePermission("telegram.read")))();
  } catch (error) {
    return evidenceErrorResponse(401, error instanceof Error ? error.message : "غير مصرح.");
  }

  // Read with the user's own client: row access rules limit it to the workspace and branches.
  const { data, error } = await (context.client as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => {
            maybeSingle: () => Promise<{ data: EvidenceMediaRow | null; error: { message: string } | null }>;
          };
        };
      };
    };
  })
    .from("telegram_order_evidence")
    .select("id, branch_id, order_number, media_type, telegram_file_id, thumbnail_file_id")
    .eq("id", evidenceId)
    .eq("workspace_id", context.workspaceId)
    .maybeSingle();
  if (error) return evidenceErrorResponse(500, "تعذّر قراءة بيانات الدليل.");
  if (!data) return evidenceErrorResponse(404, "الدليل غير موجود.");

  try {
    assertBranchAccess(context, data.branch_id);
  } catch (accessError) {
    return evidenceErrorResponse(403, accessError instanceof Error ? accessError.message : "غير مصرح.");
  }

  const token = (deps.botToken ?? (() => process.env["TELEGRAM_BOT_TOKEN"]))()?.trim();
  if (!token) return evidenceErrorResponse(503, "إعدادات Telegram غير مكتملة على الخادم.");

  const url = new URL(request.url);
  return streamTelegramFile({
    row: data,
    variant: url.searchParams.get("variant") === "thumb" ? "thumb" : "full",
    download: url.searchParams.get("download") === "1",
    token,
    fetchImpl: deps.fetchImpl,
  });
}
