import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  listRecoveryCaseDetailsOnServer,
  saveRecoveryCaseDetailOnServer,
} from "./recovery-case-details.server";

const nullableMoney = z.number().finite().nonnegative().nullable().optional();

export const getRecoveryCaseDetails = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => listRecoveryCaseDetailsOnServer());

export const saveRecoveryCaseDetail = createServerFn({ method: "POST" })
  .validator(
    z.object({
      periodId: z.string().uuid(),
      exceptionId: z.string().trim().min(1).max(160),
      platformCaseReference: z.string().trim().max(160).nullable().optional(),
      approvedClaimAmount: nullableMoney,
      submittedAmount: nullableMoney,
      acceptedAmount: nullableMoney,
    }),
  )
  .handler(async ({ data }) => saveRecoveryCaseDetailOnServer(data));
