/**
 * Operational limits in one place. Changing a value here changes it everywhere it is enforced.
 * None of these affect financial calculations.
 */

/** Largest audit or contract file accepted for upload. */
export const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOAD_SIZE_LABEL = "25 MB";

/** Largest file the standard Telegram Bot API lets a bot download (getFile). */
export const TELEGRAM_GET_FILE_LIMIT_BYTES = 20 * 1024 * 1024;

/** Largest image sent to AI order-number detection (read in memory, never stored). */
export const ORDER_NUMBER_DETECTION_MAX_BYTES = 8_000_000;

/** Largest document attached to a رادار exception; matches the exception-documents bucket limit (migration 0059). */
export const EXCEPTION_DOCUMENT_MAX_BYTES = 20 * 1024 * 1024;

/** How long a branch's Telegram connection code stays valid. */
export const TELEGRAM_CONNECTION_CODE_TTL_MINUTES = 30;

/** Default AI requests per user per hour when TADQEEQ_AI_MAX_REQUESTS_PER_HOUR is not set. */
export const DEFAULT_AI_REQUESTS_PER_HOUR = 30;

/** Days after which a compensation case needs a follow-up: ready but unsent, or sent/accepted with no outcome. */
export const COMPENSATION_FOLLOW_UP_DAYS = { ready: 3, submitted: 7, accepted: 7 } as const;
