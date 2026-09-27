import { describe, expect, test } from "bun:test";

import { parseAuthorizationBearer } from "./server-auth.server";

describe("authoritative audit import boundary", () => {
  test("server import owns engine execution, persistence and source retention", async () => {
    const source = await Bun.file("src/lib/import-audit.server.ts").text();

    expect(source).toContain("analyzeHungerStation");
    expect(source).toContain("analyzeKeeta");
    expect(source).toContain("analyzeJahez");
    expect(source).toContain("engine_version: ENGINE_VERSION");
    expect(source).toContain('.from("audit_source_files")');
    expect(source).toContain(".upload(path, source.file");
    expect(source).toContain("findDuplicate");
    expect(source).toContain("requireServerUser");
    expect(source).toContain("assertApprovedMappingsBelongToAnalysis");
  });

  test("browser import submits raw FormData instead of computed audit JSON", async () => {
    const route = await Bun.file(
      "src/routes/_authenticated/import.tsx",
    ).text();

    expect(route).toContain('form.set("dataFile", dataFile)');
    expect(route).toContain("importAuditPeriod({ data: form })");
    expect(route).not.toContain("analyzeHungerStation(");
    expect(route).not.toContain("analyzeKeeta(");
    expect(route).not.toContain("analyzeJahez(");
    expect(route).not.toContain("savePeriod(");
    expect(route).not.toContain('form.set("accessToken"');
  });

  test("client periods library no longer exposes computed-period writes", async () => {
    const periods = await Bun.file("src/lib/periods.ts").text();
    expect(periods).not.toContain("export async function savePeriod");
    expect(periods).not.toContain('.from("periods")\n    .insert(');
  });

  test("server PDF extraction uses PDF.js Node legacy build", async () => {
    const pdf = await Bun.file("src/lib/analysis/pdf.server.ts").text();
    expect(pdf).toContain('pdfjs-dist/legacy/build/pdf.mjs');
    expect(pdf).toContain("getTextContent()");
  });

  test("server PDF extraction registers the bundled worker handler", async () => {
    // Cloudflare Workers cannot load pdf.worker.mjs at runtime ("No such module _libs/pdf.worker.mjs"),
    // so the worker must be imported statically and registered before getDocument.
    const pdf = await Bun.file("src/lib/analysis/pdf.server.ts").text();
    expect(pdf).toContain('import("pdfjs-dist/legacy/build/pdf.worker.mjs")');
    expect(pdf).toContain("pdfjsWorker ??= { WorkerMessageHandler");
    expect(pdf.indexOf("pdfjsWorker ??=")).toBeLessThan(pdf.indexOf("getDocument({"));
  });

  test("server auth requires a bearer header instead of body credentials", () => {
    expect(parseAuthorizationBearer("Bearer abc.def.ghi")).toBe("abc.def.ghi");
    expect(() => parseAuthorizationBearer(undefined)).toThrow();
    expect(() => parseAuthorizationBearer("Basic abc")).toThrow();
  });
});
