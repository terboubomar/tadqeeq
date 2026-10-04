/** The /import link an AI assistant gives the user: platform, bank fee and label filled in, tied to the request. */
export function auditUploadUrl(appUrl: string, input: { requestId: string; platform: string; bankFeePct: number | null; label?: string }): string {
  const params = new URLSearchParams({ platform: input.platform, mcp: input.requestId });
  if (input.bankFeePct !== null) params.set("bankRate", String(input.bankFeePct));
  if (input.label) params.set("label", input.label);
  return `${appUrl}/import?${params.toString()}`;
}
