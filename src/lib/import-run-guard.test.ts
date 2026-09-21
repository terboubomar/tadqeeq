import { describe, expect, test } from "bun:test";

import {
  acquireImportRun,
  finishImportRun,
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


test("keeps the lock after a successful save until the import page unmounts", () => {
  const lock = { current: false };

  expect(acquireImportRun(lock)).toBe(true);
  finishImportRun(lock, true);

  expect(lock.current).toBe(true);
  expect(acquireImportRun(lock)).toBe(false);
});

test("releases the lock after a failed analysis so the user can retry", () => {
  const lock = { current: false };

  expect(acquireImportRun(lock)).toBe(true);
  finishImportRun(lock, false);

  expect(lock.current).toBe(false);
  expect(acquireImportRun(lock)).toBe(true);
});
