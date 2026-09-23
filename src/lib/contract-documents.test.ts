import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

async function read(relativePath: string) {
  return readFile(path.resolve(process.cwd(), relativePath), "utf8");
}

describe("contract document evidence", () => {
  test("stores evidence only after draft ownership checks", async () => {
    const source = await read("src/lib/contract-rulebook.server.ts");

    const guardIndex = source.indexOf(
      "await assertDraftVersion(client, userId, contractId, versionId)",
    );
    const uploadIndex = source.indexOf(
      ".from(CONTRACT_DOCUMENT_BUCKET)\n    .upload(storagePath, file",
    );

    expect(guardIndex).toBeGreaterThan(-1);
    expect(uploadIndex).toBeGreaterThan(guardIndex);
    expect(source).toContain("MAX_UPLOAD_SIZE_BYTES");
    expect(source).toContain("CONTRACT_DOCUMENT_EXTENSIONS");
  });

  test("hashes source bytes and cleans up orphaned storage on metadata failure", async () => {
    const source = await read("src/lib/contract-rulebook.server.ts");

    expect(source).toContain("const sha256 = await sha256Hex(file)");
    expect(source).toContain('sha256,\n    size_bytes: file.size');
    expect(source).toContain(".remove([storagePath])");
    expect(source).toContain("Failed to clean up orphan contract document");
  });

  test("keeps private storage paths user-owned and non-overwriting", async () => {
    const source = await read("src/lib/contract-rulebook.server.ts");

    expect(source).toContain("userId,\n    contractId,\n    versionId");
    expect(source).toContain("safeStorageFileName(file.name)");
    expect(source).toContain("upsert: false");
  });

  test("shows evidence in the Rulebook and disables uploads after approval", async () => {
    const route = await read("src/routes/_authenticated/contracts.tsx");

    expect(route).toContain("مستندات العقد");
    expect(route).toContain("SHA-256");
    expect(route).toContain("uploadContractDocument");
    expect(route).toContain("مستندات النسخة المعتمدة مقفلة");
  });
});
