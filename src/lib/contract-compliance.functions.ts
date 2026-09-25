import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { evaluateContractComplianceOnServer } from "./contract-compliance.server";
import { requireWorkspacePermission } from "./server-auth.server";

const uuid = z.string().uuid();

export const evaluateContractCompliance = createServerFn({ method: "POST" })
  .validator(z.object({ contractId: uuid, periodId: uuid }))
  .handler(async ({ data }) => {
    await requireWorkspacePermission("contracts.read");
    return evaluateContractComplianceOnServer(data);
  });
