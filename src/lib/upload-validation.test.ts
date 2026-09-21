import { describe, expect, test } from "bun:test";

import {
  MAX_UPLOAD_SIZE_BYTES,
  uploadSizeError,
} from "./upload-validation";

describe("upload size validation", () => {
  test("accepts files at or below the 25 MB limit", () => {
    expect(uploadSizeError(0)).toBeNull();
    expect(uploadSizeError(MAX_UPLOAD_SIZE_BYTES)).toBeNull();
  });

  test("rejects files larger than 25 MB before parsing", () => {
    expect(uploadSizeError(MAX_UPLOAD_SIZE_BYTES + 1)).toBe(
      "حجم الملف يتجاوز الحد الأقصى المسموح وهو 25 MB. اختر ملفاً أصغر.",
    );
  });

  test("rejects invalid file-size metadata", () => {
    expect(uploadSizeError(Number.NaN)).toContain("تعذّر التحقق من حجم الملف");
    expect(uploadSizeError(-1)).toContain("تعذّر التحقق من حجم الملف");
  });
});
