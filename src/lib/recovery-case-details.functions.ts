import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  listRecoveryCaseDetailsOnServer,
  saveRecoveryCaseDetailOnServer,
  uploadRecoveryCaseDocumentOnServer,
} from "./recovery-case-details.server";

const nullableMoney = z.number().finite().nonnegative().nullable().optional();
const nullableDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();

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
      submittedOn: nullableDate,
      responseOn: nullableDate,
      recoveredOn: nullableDate,
    }),
  )
  .handler(async ({ data }) => saveRecoveryCaseDetailOnServer(data));


export const uploadRecoveryCaseDocument = createServerFn({ method: "POST" })
  .validator((data) => {
    if (!(data instanceof FormData)) {
      throw new Error("بيانات مستند المطالبة غير صالحة.");
    }
    return data;
  })
  .handler(async ({ data }) => uploadRecoveryCaseDocumentOnServer(data));
