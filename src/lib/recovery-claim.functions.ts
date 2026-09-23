import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  listRecoveryDocumentsOnServer,
  uploadRecoveryDocumentOnServer,
} from "./recovery-claim.server";

export const getRecoveryDocuments = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => listRecoveryDocumentsOnServer());

export const uploadRecoveryDocument = createServerFn({ method: "POST" })
  .validator((data) => {
    if (!(data instanceof FormData)) {
      throw new Error("بيانات مستند المطالبة غير صالحة.");
    }
    return data;
  })
  .handler(async ({ data }) => uploadRecoveryDocumentOnServer(data));
