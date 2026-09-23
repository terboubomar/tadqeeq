import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { evaluateContractComplianceOnServer } from "./contract-compliance.server";

const uuid = z.string().uuid();

export const evaluateContractCompliance = createServerFn({ method: "POST" })
  .validator(z.object({ contractId: uuid, periodId: uuid }))
  .handler(async ({ data }) => evaluateContractComplianceOnServer(data));
