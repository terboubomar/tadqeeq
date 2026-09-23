import { describe, expect, test } from "bun:test";

describe("recovery claim lifecycle", () => {
  test("migration extends the existing append-only exception ledger", async () => {
    const sql = await Bun.file(
      "drizzle/migrations/0017_recovery_claim_lifecycle.sql",
    ).text();

    for (const field of [
      "claim_reference",
      "approved_claim_amount",
      "submitted_amount",
      "accepted_amount",
      "submitted_on",
      "response_on",
      "recovered_on",
    ]) {
      expect(sql).toContain(field);
    }

    expect(sql).toContain("CREATE OR REPLACE FUNCTION public.set_exception_workflow");
    expect(sql).toContain("'claimReference'");
    expect(sql).toContain("'approvedClaimAmount'");
    expect(sql).toContain("'submittedAmount'");
    expect(sql).toContain("'acceptedAmount'");
    expect(sql).toContain("'submittedOn'");
    expect(sql).toContain("'responseOn'");
    expect(sql).toContain("'recoveredOn'");
    expect(sql).toContain("INSERT INTO public.exception_events");
  });

  test("supporting documents are private, user-owned, and immutable through the Data API", async () => {
    const sql = await Bun.file(
      "drizzle/migrations/0017_recovery_claim_lifecycle.sql",
    ).text();

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.recovery_documents");
    expect(sql).toContain("ALTER TABLE public.recovery_documents ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("GRANT SELECT, INSERT ON TABLE public.recovery_documents TO authenticated");
    expect(sql).not.toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.recovery_documents TO authenticated",
    );
    expect(sql).toContain("VALUES ('recovery-files', 'recovery-files', false");
    expect(sql).toContain("(storage.foldername(name))[1] = (SELECT auth.uid())::text");
  });

  test("server upload fingerprints exact bytes and cleans up orphaned blobs", async () => {
    const source = await Bun.file("src/lib/recovery-claim.server.ts").text();

    expect(source).toContain("sha256Hex(file)");
    expect(source).toContain('.eq("sha256", sha256)');
    expect(source).toContain(".remove([storagePath])");
    expect(source).toContain("MAX_UPLOAD_SIZE_BYTES");
    expect(source).toContain("assertOwnedPeriod");
  });

  test("workflow patch carries claim metadata through the existing RPC", async () => {
    const periods = await Bun.file("src/lib/periods.ts").text();
    const exceptions = await Bun.file("src/lib/exceptions.ts").text();

    for (const field of [
      "claimReference",
      "approvedClaimAmount",
      "submittedAmount",
      "acceptedAmount",
      "submittedOn",
      "responseOn",
      "recoveredOn",
    ]) {
      expect(periods).toContain(`workflowPatch["${field}"]`);
      expect(exceptions).toContain(field);
    }
  });

  test("Recovery Center exposes claim lifecycle inputs and evidence upload", async () => {
    const route = await Bun.file(
      "src/routes/_authenticated/recovery.tsx",
    ).text();

    expect(route).toContain("ملف المطالبة");
    expect(route).toContain("رقم اعتراض / مرجع المنصة");
    expect(route).toContain("approvedClaimAmount");
    expect(route).toContain("submittedAmount");
    expect(route).toContain("acceptedAmount");
    expect(route).toContain("submittedOn");
    expect(route).toContain("responseOn");
    expect(route).toContain("recoveredOn");
    expect(route).toContain("uploadRecoveryDocument");
  });
});
