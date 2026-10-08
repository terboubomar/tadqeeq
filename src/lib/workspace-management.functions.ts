import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  createAccountWorkspaceOnServer,
  listMyWorkspacesOnServer,
  renameAccountWorkspaceOnServer,
  switchMyWorkspaceOnServer,
} from "./workspace-management.server";

export const listMyWorkspaces = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(() => listMyWorkspacesOnServer());

export const switchMyWorkspace = createServerFn({ method: "POST" })
  .validator(z.object({ workspaceId: z.string().uuid() }))
  .handler(({ data }) => switchMyWorkspaceOnServer(data.workspaceId));

export const createAccountWorkspace = createServerFn({ method: "POST" })
  .validator(z.object({ name: z.string().trim().min(1).max(160) }))
  .handler(({ data }) => createAccountWorkspaceOnServer(data.name));

export const renameAccountWorkspace = createServerFn({ method: "POST" })
  .validator(z.object({ workspaceId: z.string().uuid(), name: z.string().trim().min(1).max(160) }))
  .handler(({ data }) => renameAccountWorkspaceOnServer(data.workspaceId, data.name));
