import { describe, expect, test } from "bun:test";

import {
  acquireImportRun,
  releaseImportRun,
} from "./import-run-guard";

describe("import run guard", () => {
  test("allows only one active import run at a time", () => {
    const lock = { current: false };

    expect(acquireImportRun(lock)).toBe(true);
    expect(acquireImportRun(lock)).toBe(false);

    releaseImportRun(lock);

    expect(acquireImportRun(lock)).toBe(true);
  });
});
