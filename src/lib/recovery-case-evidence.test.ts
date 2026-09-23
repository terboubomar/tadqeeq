import { describe, expect, test } from "bun:test";

describe("recovery case dates and supporting evidence", () => {
  test("adds lineage-aware claim dates and immutable evidence metadata", async () => {
    const sql = await Bun.file(
      "drizzle/migrations/0018_recovery_case_evidence.sql",
    ).text();

    expect(sql).toContain("ADD COLUMN IF NOT EXISTS submitted_on DATE");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS response_on DATE");
    expect(sql).toContain("ADD COLUMN IF NOT EXISTS recovered_on DATE");
    expect(sql).toContain(
      "CREATE TABLE IF NOT EXISTS public.recovery_case_documents",
    );
    expect(sql).toContain("recovery_case_id UUID NOT NULL");
    expect(sql).toContain("lineage_id UUID NOT NULL");
    expect(sql).toContain("UNIQUE (recovery_case_id, sha256)");
    expect(sql).toContain(
      "ALTER TABLE public.recovery_case_documents ENABLE ROW LEVEL SECURITY",
    );
    expect(sql).toContain(
      "GRANT SELECT, INSERT ON TABLE public.recovery_case_documents TO authenticated",
    );
    expect(sql).toContain(
      "REVOKE UPDATE, DELETE ON TABLE public.recovery_case_documents FROM authenticated",
    );
  });

  test("private storage is user-scoped and only deletable for failed-upload cleanup", async () => {
    const sql = await Bun.file(
      "drizzle/migrations/0018_recovery_case_evidence.sql",
    ).text();

    expect(sql).toContain(
      "VALUES ('recovery-case-files', 'recovery-case-files', false",
    );
    expect(sql).toContain(
      "(storage.foldername(name))[1] = (select auth.uid())::text",
    );
    expect(sql).toContain("recovery_case_files_delete_own");
  });

  test("server validates date ordering and fingerprints exact evidence bytes", async () => {
    const source = await Bun.file(
      "src/lib/recovery-case-details.server.ts",
    ).text();

    expect(source).toContain(
      'throw new Error("تاريخ الرد لا يمكن أن يسبق تاريخ إرسال المطالبة.")',
    );
    expect(source).toContain(
      'throw new Error("تاريخ الاسترداد لا يمكن أن يسبق تاريخ رد المنصة.")',
    );
    expect(source).toContain("sha256Hex(file)");
    expect(source).toContain('.eq("sha256", sha256)');
    expect(source).toContain(".remove([storagePath])");
    expect(source).toContain("MAX_UPLOAD_SIZE_BYTES");
  });

  test("Recovery Center exposes dates and private evidence upload", async () => {
    const route = await Bun.file(
      "src/routes/_authenticated/recovery.tsx",
    ).text();

    expect(route).toContain("تاريخ الإرسال");
    expect(route).toContain("تاريخ الرد");
    expect(route).toContain("تاريخ الاسترداد");
    expect(route).toContain("مستندات المطالبة");
    expect(route).toContain("uploadRecoveryCaseDocument");
  });
});
