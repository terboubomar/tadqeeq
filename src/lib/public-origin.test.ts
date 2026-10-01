import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import { PublicOriginConfigError, resolvePublicOrigin } from "./public-origin.server";

describe("resolvePublicOrigin", () => {
  test("TADQEEQ_PUBLIC_URL wins and is reduced to its origin", () => {
    expect(
      resolvePublicOrigin({ configured: "https://tadqeeq.app/some/path", requestOrigin: "https://other.example", production: true }),
    ).toBe("https://tadqeeq.app");
  });

  test("production without TADQEEQ_PUBLIC_URL has no origin (no Lovable fallback)", () => {
    expect(resolvePublicOrigin({ requestOrigin: "https://id-preview--x.lovable.app", production: true })).toBeNull();
    expect(resolvePublicOrigin({ production: true })).toBeNull();
  });

  test("invite links may use the request origin in production when allowed", () => {
    expect(
      resolvePublicOrigin({ requestOrigin: "https://tadqeeq.app", production: true, allowRequestOriginInProduction: true }),
    ).toBe("https://tadqeeq.app");
    expect(
      resolvePublicOrigin({ requestOrigin: "http://tadqeeq.app", production: true, allowRequestOriginInProduction: true }),
    ).toBeNull();
  });

  test("development accepts localhost", () => {
    expect(resolvePublicOrigin({ requestOrigin: "http://localhost:5173", production: false })).toBe("http://localhost:5173");
    expect(resolvePublicOrigin({ configured: "http://localhost:3000", production: false })).toBe("http://localhost:3000");
  });

  test("a non-HTTPS or malformed TADQEEQ_PUBLIC_URL is a configuration error", () => {
    expect(() => resolvePublicOrigin({ configured: "http://tadqeeq.app", production: true })).toThrow(PublicOriginConfigError);
    expect(() => resolvePublicOrigin({ configured: "not a url", production: true })).toThrow(PublicOriginConfigError);
    expect(() => resolvePublicOrigin({ configured: "http://localhost:3000", production: true })).toThrow(PublicOriginConfigError);
  });
});

describe("no hard-coded Lovable origin in server code", () => {
  test("server modules never contain a lovable.app URL", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.server\.ts$/.test(name) && /https?:\/\/[^"'\s]*lovable\.app/.test(readFileSync(path, "utf8"))) {
          offenders.push(path);
        }
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
  });
});

describe("environment contract", () => {
  test(".env.example documents the server-only Telegram and origin settings", () => {
    const env = readFileSync(".env.example", "utf8");
    for (const key of ["TELEGRAM_BOT_TOKEN=", "TELEGRAM_WEBHOOK_SECRET=", "TADQEEQ_PUBLIC_URL="]) {
      expect(env).toContain(key);
    }
  });

  test("secrets are never read through a browser-visible VITE_ variable", () => {
    const forbidden = /VITE_(TELEGRAM_BOT_TOKEN|TELEGRAM_WEBHOOK_SECRET|SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|DATABASE_URL)/;
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && !name.endsWith(".test.ts") && forbidden.test(readFileSync(path, "utf8"))) {
          offenders.push(path);
        }
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
    expect(forbidden.test(readFileSync(".env.example", "utf8"))).toBe(false);
  });
});
