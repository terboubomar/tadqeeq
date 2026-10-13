import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAiServerAuth } from "./ai/auth.server";
import { requireAiEnabled } from "./ai/config.server";
import { importContractOnServer, readContractDocumentOnServer } from "./contract-reading.server";

const uuid = z.string().uuid();

/** Tadqeeq AI reads an uploaded contract document and proposes its terms (nothing is saved). */
export const readContractDocument = createServerFn({ method: "POST" })
  .validator(z.object({ contractId: uuid, versionId: uuid, documentId: uuid }))
  .handler(async ({ data }) => {
    requireAiEnabled();
    const auth = await requireAiServerAuth();
    return readContractDocumentOnServer(data, auth);
  });

/** Upload a contract: Tadqeeq AI reads it and the contract, version, document and terms are set up as a draft. */
export const importContract = createServerFn({ method: "POST" })
  .validator((data) => {
    if (!(data instanceof FormData)) throw new Error("بيانات ملف العقد غير صالحة.");
    return data;
  })
  .handler(async ({ data }) => {
    requireAiEnabled();
    const auth = await requireAiServerAuth();
    return importContractOnServer(data, auth);
  });
