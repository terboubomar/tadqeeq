import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireAiServerAuth } from "./ai/auth.server";
import { requireAiEnabled } from "./ai/config.server";
import { readContractDocumentOnServer } from "./contract-reading.server";

const uuid = z.string().uuid();

/** Tadqeeq AI reads an uploaded contract document and proposes its terms (nothing is saved). */
export const readContractDocument = createServerFn({ method: "POST" })
  .validator(z.object({ contractId: uuid, versionId: uuid, documentId: uuid }))
  .handler(async ({ data }) => {
    requireAiEnabled();
    const auth = await requireAiServerAuth();
    return readContractDocumentOnServer(data, auth);
  });
