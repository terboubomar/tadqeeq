import { describe, expect, test } from "bun:test";

import { Route } from "@/routes/_authenticated/import";

import { auditUploadUrl } from "./links";

describe("assistant upload link", () => {
  test("the import page reads back everything the link carries", () => {
    const url = new URL(
      auditUploadUrl("https://tadqeeq.app", { requestId: "0b9c6f1e-2a3d-4e5f-8a9b-0c1d2e3f4a5b", platform: "hungerstation", bankFeePct: 1.8, label: "سبتمبر 2026" }),
    );
    expect(url.pathname).toBe("/import");
    const search = Route.options.validateSearch!(Object.fromEntries(url.searchParams)) as Record<string, unknown>;
    expect(search).toEqual({ platform: "hungerstation", bankRate: "1.8", label: "سبتمبر 2026", mcp: "0b9c6f1e-2a3d-4e5f-8a9b-0c1d2e3f4a5b" });
  });

  test("Keeta and Jahez links carry no bank fee", () => {
    const url = new URL(auditUploadUrl("https://tadqeeq.app", { requestId: "0b9c6f1e-2a3d-4e5f-8a9b-0c1d2e3f4a5b", platform: "keeta", bankFeePct: null }));
    expect(url.searchParams.has("bankRate")).toBe(false);
  });

  test("the import page ignores a malformed request id or fee", () => {
    const search = Route.options.validateSearch!({ platform: "keeta", mcp: "x' or 1=1", bankRate: "abc" }) as Record<string, unknown>;
    expect(search).toEqual({ platform: "keeta" });
  });
});
