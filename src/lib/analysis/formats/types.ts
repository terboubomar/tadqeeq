import { ParseError } from "../parse";
import type { Platform } from "../types";

export interface FormatFingerprint {
  id: string;
  platform: Platform;
  source: string;
  requiredHeaderGroups: readonly (readonly string[])[];
  optionalSources?: readonly string[];
}

export class UnsupportedFormatError extends ParseError {
  readonly platform: Platform;
  readonly source: string;
  readonly formatId: string;
  readonly missing: string[];

  constructor(input: {
    platform: Platform;
    source: string;
    formatId: string;
    missing: string[];
  }) {
    super(
      "صيغة الملف تغيّرت من المنصة. تم إيقاف التحليل لحماية دقة النتائج. المصدر: " +
        input.source +
        (input.missing.length ? " · مفقود: " + input.missing.join("، ") : ""),
      undefined,
      {
        platform: input.platform,
        sheet: input.source,
      },
    );
    this.name = "UnsupportedFormatError";
    this.platform = input.platform;
    this.source = input.source;
    this.formatId = input.formatId;
    this.missing = input.missing;
  }
}

export function normalizeFormatHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

export function missingHeaderGroups(
  availableHeaders: Iterable<unknown>,
  requiredGroups: readonly (readonly string[])[],
): string[] {
  const normalized = new Set(
    [...availableHeaders].map((header) => normalizeFormatHeader(header)),
  );

  return requiredGroups
    .filter(
      (group) =>
        !group.some((candidate) =>
          normalized.has(normalizeFormatHeader(candidate)),
        ),
    )
    .map((group) => group.join(" / "));
}

export function assertSupportedHeaders(
  fingerprint: FormatFingerprint,
  headers: Iterable<unknown>,
): void {
  const missing = missingHeaderGroups(
    headers,
    fingerprint.requiredHeaderGroups,
  );
  if (!missing.length) return;

  throw new UnsupportedFormatError({
    platform: fingerprint.platform,
    source: fingerprint.source,
    formatId: fingerprint.id,
    missing,
  });
}
