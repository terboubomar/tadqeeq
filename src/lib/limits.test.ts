import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import * as limits from "./limits";
import { oversizedEvidenceWarning } from "./telegram-webhook.server";

describe("operational limits", () => {
  test("values are unchanged by centralising them", () => {
    expect(limits.MAX_UPLOAD_SIZE_BYTES).toBe(25 * 1024 * 1024);
    expect(limits.MAX_UPLOAD_SIZE_LABEL).toBe("25 MB");
    expect(limits.TELEGRAM_GET_FILE_LIMIT_BYTES).toBe(20 * 1024 * 1024);
    expect(limits.ORDER_NUMBER_DETECTION_MAX_BYTES).toBe(8_000_000);
    expect(limits.TELEGRAM_CONNECTION_CODE_TTL_MINUTES).toBe(30);
    expect(limits.DEFAULT_AI_REQUESTS_PER_HOUR).toBe(30);
    expect(limits.COMPENSATION_FOLLOW_UP_DAYS).toEqual({ ready: 3, submitted: 7, accepted: 7 });
  });

  test("no other module re-declares these numbers", () => {
    const patterns = [/25 \* 1024 \* 1024/, /20 \* 1024 \* 1024/, /8_000_000/, /2_097_152/];
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx)$/.test(name) && !/\.test\.ts$/.test(name) && !path.endsWith(join("lib", "limits.ts"))) {
          const source = readFileSync(path, "utf8");
          if (patterns.some((pattern) => pattern.test(source))) offenders.push(path);
        }
      }
    };
    walk("src");
    expect(offenders).toEqual([]);
  });

  test("the bot warns the branch when evidence is too large to retrieve later", () => {
    expect(oversizedEvidenceWarning(5_000_000)).toBe("");
    expect(oversizedEvidenceWarning(null)).toBe("");
    expect(oversizedEvidenceWarning(limits.TELEGRAM_GET_FILE_LIMIT_BYTES + 1)).toContain("20 ميجابايت");
  });
});
