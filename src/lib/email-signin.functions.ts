import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader } from "@tanstack/react-start/server";
import { z } from "zod";

function bearer(): string {
  const header = getRequestHeader("authorization") ?? "";
  const token = header.replace(/^Bearer\s+/i, "").trim();
  if (!token) throw new Error("الجلسة منتهية، سجّل الدخول مرة أخرى.");
  return token;
}

export const getEmailCodeStatus = createServerFn({ method: "POST" }).handler(async () => {
  const { emailCodeStatus } = await import("./email-signin.server");
  return emailCodeStatus(bearer());
});

export const requestEmailCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ force: z.boolean() }).parse(data))
  .handler(async ({ data }) => {
    const { sendEmailCode } = await import("./email-signin.server");
    return sendEmailCode(bearer(), data.force);
  });

export const submitEmailCode = createServerFn({ method: "POST" })
  .inputValidator((data: unknown) => z.object({ code: z.string().regex(/^\d{6}$/) }).parse(data))
  .handler(async ({ data }) => {
    const { verifyEmailCode } = await import("./email-signin.server");
    return verifyEmailCode(bearer(), data.code);
  });
