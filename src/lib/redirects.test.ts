import { describe, expect, test } from "bun:test";

import { safeNextPath } from "./redirects";

describe("safeNextPath", () => {
  test("keeps paths on this site, with their query and hash", () => {
    expect(safeNextPath("/import?platform=keeta&mcp=0b9c6f1e-2a3d-4e5f-8a9b-0c1d2e3f4a5b")).toBe(
      "/import?platform=keeta&mcp=0b9c6f1e-2a3d-4e5f-8a9b-0c1d2e3f4a5b",
    );
    expect(safeNextPath("/dashboard#top")).toBe("/dashboard#top");
  });

  test("refuses anything that could leave the site", () => {
    for (const raw of [
      "//evil.com",
      "/\\evil.com",
      "/\\/evil.com",
      "\\evil.com",
      "https://evil.com",
      "javascript:alert(1)",
      "/%2F%2Fevil.com",
      "/%5C%5Cevil.com",
      "/\tevil.com",
      "evil.com",
      "",
    ]) {
      expect(safeNextPath(raw)).toBeUndefined();
    }
    expect(safeNextPath(42)).toBeUndefined();
  });
});
