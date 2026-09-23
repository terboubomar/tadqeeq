import { supabase } from "@/integrations/supabase/client";

import type { Platform } from "./analysis/types";
import { safeStorageFileName, sha256Hex } from "./source-file-utils";

export type AuditSourceKind =
  | "data"
  | "invoice"
  | "cpc_invoice"
  | "compensation";

export interface AuditSourceUpload {
  kind: AuditSourceKind;
  file: File;
  formatId?: string;
}

interface StorePeriodSourceFilesInput {
  periodId: string;
  platform: Platform;
  files: AuditSourceUpload[];
}

const SOURCE_BUCKET = "source-files";

export async function storePeriodSourceFiles(
  input: StorePeriodSourceFilesInput,
): Promise<void> {
  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError) throw authError;

  const userId = auth.user?.id;
  if (!userId) {
    throw new Error(
      "الجلسة منتهية؛ تعذّر حفظ ملفات مصدر التدقيق بشكل آمن.",
    );
  }

  const uploadedPaths: string[] = [];

  try {
    for (const source of input.files) {
      const digest = await sha256Hex(source.file);
      const path =
        userId +
        "/" +
        input.periodId +
        "/" +
        source.kind +
        "-" +
        crypto.randomUUID() +
        "-" +
        safeStorageFileName(source.file.name);

      const { error: uploadError } = await supabase.storage
        .from(SOURCE_BUCKET)
        .upload(path, source.file, {
          upsert: false,
          contentType: source.file.type || "application/octet-stream",
        });

      if (uploadError) throw uploadError;
      uploadedPaths.push(path);

      const { error: metadataError } = await supabase
        .from("audit_source_files")
        .insert({
          user_id: userId,
          period_id: input.periodId,
          platform: input.platform,
          source_kind: source.kind,
          original_name: source.file.name,
          format_id: source.formatId ?? null,
          sha256: digest,
          size_bytes: source.file.size,
          storage_path: path,
        });

      if (metadataError) throw metadataError;
    }
  } catch (cause) {
    if (uploadedPaths.length) {
      const { error: storageCleanupError } = await supabase.storage
        .from(SOURCE_BUCKET)
        .remove(uploadedPaths);
      if (storageCleanupError) {
        console.error(
          "Failed to clean partial Tadqeeq source-file upload",
          storageCleanupError,
        );
      }
    }

    const { error: metadataCleanupError } = await supabase
      .from("audit_source_files")
      .delete()
      .eq("period_id", input.periodId)
      .eq("user_id", userId);

    if (metadataCleanupError) {
      console.error(
        "Failed to clean partial Tadqeeq source-file metadata",
        metadataCleanupError,
      );
    }

    throw new Error(
      cause instanceof Error
        ? "تعذّر حفظ ملفات مصدر التدقيق بشكل آمن: " + cause.message
        : "تعذّر حفظ ملفات مصدر التدقيق بشكل آمن.",
    );
  }
}
