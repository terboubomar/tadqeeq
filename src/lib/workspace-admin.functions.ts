import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import {
  inviteWorkspaceMemberOnServer,
  listWorkspaceMembersOnServer,
  removeWorkspaceMemberOnServer,
  updateWorkspaceMemberOnServer,
} from "./workspace-admin.server";

const role = z.enum([
  "admin",
  "auditor",
  "compensation",
  "branch_manager",
  "viewer",
]);

export const getWorkspaceMembers = createServerFn({ method: "POST" })
  .validator(z.object({}))
  .handler(async () => listWorkspaceMembersOnServer());

export const inviteWorkspaceMember = createServerFn({ method: "POST" })
  .validator(
    z.object({
      fullName: z.string().trim().min(1).max(160),
      email: z.string().trim().email().max(320),
      password: z.string().min(8).max(128).optional(),
      role,
      branchIds: z.array(z.string().uuid()).max(200),
    }),
  )
  .handler(async ({ data }) => inviteWorkspaceMemberOnServer(data));

export const updateWorkspaceMember = createServerFn({ method: "POST" })
  .validator(
    z.object({
      membershipId: z.string().uuid(),
      role,
      status: z.enum(["active", "suspended"]),
      branchIds: z.array(z.string().uuid()).max(200),
    }),
  )
  .handler(async ({ data }) => updateWorkspaceMemberOnServer(data));

export const removeWorkspaceMember = createServerFn({ method: "POST" })
  .validator(z.object({ membershipId: z.string().uuid() }))
  .handler(async ({ data }) =>
    removeWorkspaceMemberOnServer(data.membershipId),
  );
