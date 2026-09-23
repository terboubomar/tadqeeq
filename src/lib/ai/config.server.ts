export function isAiServerEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env["AI_ENABLED"] ?? env["TADQEEQ_AI_ENABLED"] ?? "true")
    .trim()
    .toLowerCase();

  return !["0", "false", "off", "no", "disabled"].includes(raw);
}

export function requireAiEnabled(): void {
  if (!isAiServerEnabled()) {
    throw new Error("خدمة Tadqeeq AI غير مفعّلة في بيئة النشر الحالية.");
  }
}
