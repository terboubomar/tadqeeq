import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { getMyWorkspaceContextOnServer } from "./workspace-access.server";

export const getMyWorkspaceContext = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => getMyWorkspaceContextOnServer());
