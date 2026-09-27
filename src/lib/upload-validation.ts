export const MAX_UPLOAD_SIZE_BYTES = 25 * 1024 * 1024;
export const MAX_UPLOAD_SIZE_LABEL = "25 MB";

export function uploadSizeError(sizeBytes: number): string | null {
  if (!Number.isFinite(sizeBytes) || sizeBytes < 0) {
    return "تعذّر التحقق من حجم الملف. اختر الملف مرة أخرى.";
  }

  if (sizeBytes === 0) {
    return "الملف فارغ. تأكد من تصدير الملف من المنصة كاملاً ثم اختره مرة أخرى.";
  }

  if (sizeBytes > MAX_UPLOAD_SIZE_BYTES) {
    return "حجم الملف يتجاوز الحد الأقصى المسموح وهو 25 MB. اختر ملفاً أصغر.";
  }

  return null;
}
