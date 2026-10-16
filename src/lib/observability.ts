/**
 * Structured server logs and error categories. Logs are one JSON line each, carry ids rather
 * than payloads, and redact anything that looks like a secret. They never contain document
 * contents, media bytes or tokens.
 */

export type LogEvent =
  | "analysis_started"
  | "analysis_completed"
  | "analysis_failed"
  | "telegram_webhook_received"
  | "telegram_webhook_failed"
  | "telegram_evidence_metadata_saved"
  | "telegram_evidence_stream_started"
  | "telegram_evidence_stream_completed"
  | "telegram_evidence_stream_failed"
  | "compensation_case_created"
  | "compensation_status_changed"
  | "compensation_recovered"
  | "permission_denied"
  | "workspace_isolation_violation_attempt"
  | "ai_request_started"
  | "ai_request_failed"
  | "csp_violation"
  | "contact_message_received"
  | "contact_message_failed"
  | "contact_message_email_failed"
  | "integration_connected"
  | "integration_disconnected"
  | "integration_journals_sent";

/** What kind of failure happened, so logs and support can tell them apart. */
export type ErrorKind =
  | "configuration"
  | "authorization"
  | "invalid_input"
  | "external_provider"
  | "temporary"
  | "data_format"
  | "financial_validation"
  | "unknown";

/** An error that already knows its category. The message is safe to show to the user. */
export class TadqeeqError extends Error {
  readonly kind: ErrorKind;
  constructor(kind: ErrorKind, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "TadqeeqError";
    this.kind = kind;
  }
}

const AUTHORIZATION_MESSAGES = [
  "ليس لديك صلاحية",
  "الجلسة منتهية",
  "الحساب موقوف",
  "غير مصرح",
];

/** Best-effort category for any thrown value. Never changes the error itself. */
export function classifyError(error: unknown): ErrorKind {
  if (error instanceof TadqeeqError) return error.kind;
  if (!(error instanceof Error)) return "unknown";
  // A platform changed its file layout (UnsupportedFormatError carries formatId + missing columns).
  if ("formatId" in error && "missing" in error) return "data_format";
  switch (error.name) {
    case "PublicOriginConfigError":
      return "configuration";
    case "UnsupportedFormatError":
      return "data_format";
    case "ParseError":
      return "financial_validation";
    case "PercentRateError":
    case "ZodError":
      return "invalid_input";
    case "AbortError":
    case "TimeoutError":
      return "temporary";
  }
  if (error instanceof TypeError && /fetch|network/i.test(error.message)) return "external_provider";
  if (AUTHORIZATION_MESSAGES.some((text) => error.message.includes(text))) return "authorization";
  if (/configuration|غير مكتمل|غير مضبوط/i.test(error.message)) return "configuration";
  return "unknown";
}

const SECRET_KEY = /token|secret|password|passwd|authorization|cookie|api[_-]?key|service[_-]?role|signature|credential/i;
const MAX_STRING = 200;

/** Removes secrets, binary data and long text from log fields. */
export function redactLogFields(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "string") return value.length > MAX_STRING ? value.slice(0, MAX_STRING) + "…" : value;
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (value instanceof ArrayBuffer) return `[binary ${value.byteLength} bytes]`;
  if (ArrayBuffer.isView(value)) return `[binary ${value.byteLength} bytes]`;
  if (value instanceof Error) return { name: value.name, kind: classifyError(value), message: redactLogFields(value.message) };
  if (depth >= 3) return "[nested]";
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => redactLogFields(item, depth + 1));
  if (typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, item]) => [
        key,
        SECRET_KEY.test(key) ? "[redacted]" : redactLogFields(item, depth + 1),
      ]),
    );
  }
  return String(value);
}

export interface LogSink {
  (line: string, level: "info" | "warn" | "error"): void;
}

const consoleSink: LogSink = (line, level) => {
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else console.log(line);
};

let sink: LogSink = consoleSink;

/** Test hook: capture log lines instead of printing them. Returns a restore function. */
export function setLogSink(next: LogSink): () => void {
  const previous = sink;
  sink = next;
  return () => {
    sink = previous;
  };
}

/** Writes one structured log line. Logging never throws. */
export function logEvent(
  event: LogEvent,
  fields: Record<string, unknown> = {},
  level: "info" | "warn" | "error" = "info",
): void {
  try {
    const { error, ...rest } = fields;
    const record: Record<string, unknown> = {
      ts: new Date().toISOString(),
      level,
      event,
      ...(redactLogFields(rest) as Record<string, unknown>),
    };
    if (error !== undefined) {
      record["error_kind"] = classifyError(error);
      record["error"] = error instanceof Error ? redactLogFields(error.message) : redactLogFields(String(error));
    }
    sink(JSON.stringify(record), level);
  } catch {
    // Observability must never break the request it observes.
  }
}
