import { describe, expect, test } from "bun:test";

import { parseBearerAuthorizationHeader } from "./auth.server";

describe("parseBearerAuthorizationHeader", () => {
  test("extracts a bearer token without exposing it through request data", () => {
    expect(parseBearerAuthorizationHeader("Bearer abc.def.ghi")).toBe(
      "abc.def.ghi",
    );
  });

  test("accepts case-insensitive Bearer scheme and surrounding whitespace", () => {
    expect(parseBearerAuthorizationHeader("  bearer token-value  ")).toBe(
      "token-value",
    );
  });

  test("rejects missing or non-bearer authorization", () => {
    expect(() => parseBearerAuthorizationHeader(undefined)).toThrow();
    expect(() => parseBearerAuthorizationHeader("Basic abc")).toThrow();
    expect(() => parseBearerAuthorizationHeader("Bearer   ")).toThrow();
  });
});
