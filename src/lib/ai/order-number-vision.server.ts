import { callTadqeeqAi } from "./gateway.server";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    order_number: { type: ["string", "null"] },
    confidence: { type: "string", enum: ["high", "medium", "low"] },
  },
  required: ["order_number", "confidence"],
};

/**
 * Reads the delivery-platform order number from a photo (receipt, bag label,
 * tablet/POS screen). Returns null when nothing trustworthy is visible.
 */
export async function detectOrderNumberFromImage(
  bytes: ArrayBuffer,
  mimeType: string,
): Promise<string | null> {
  const base64 = Buffer.from(bytes).toString("base64");
  const { text } = await callTadqeeqAi({
    systemPrompt:
      "You read restaurant delivery evidence photos (receipts, order stickers, bag labels, HungerStation/Keeta/Jahez tablet or POS screens). Extract the platform ORDER number / order ID only — not phone numbers, prices, dates, times, VAT numbers, or branch codes. Return digits/letters exactly as printed, without '#'. If no order number is clearly readable, return null with low confidence.",
    userText: "Extract the order number from this image.",
    schemaName: "order_number_detection",
    schema: SCHEMA,
    maxOutputTokens: 800,
    imageDataUrls: [`data:${mimeType};base64,${base64}`],
  });
  const parsed = JSON.parse(text) as { order_number: string | null; confidence: string };
  const value = parsed.order_number?.trim().replace(/^#\s*/, "").replace(/\s+/g, "") ?? "";
  if (!value || parsed.confidence === "low") return null;
  if (value.length < 3 || value.length > 120) return null;
  if (!/^[\p{L}\p{N}][\p{L}\p{N}._/-]*$/u.test(value)) return null;
  return value;
}
