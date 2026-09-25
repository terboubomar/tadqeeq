import { describe, expect, test } from "bun:test";

import {
  ASSIGNABLE_WORKSPACE_ROLES,
  ROLE_PERMISSIONS,
  hasWorkspacePermission,
  roleHasGlobalBranchAccess,
} from "./workspace-access";

describe("workspace access matrix", () => {
  test("owner and admin keep full operational permissions", () => {
    expect(hasWorkspacePermission("owner", "users.manage")).toBe(true);
    expect(hasWorkspacePermission("owner", "workspace.settings.manage")).toBe(true);
    expect(hasWorkspacePermission("admin", "users.manage")).toBe(true);
    expect(hasWorkspacePermission("admin", "compensation.manage")).toBe(true);
    expect(hasWorkspacePermission("admin", "contracts.manage")).toBe(true);
  });

  test("auditor can audit but cannot manage users", () => {
    expect(hasWorkspacePermission("auditor", "imports.create")).toBe(true);
    expect(hasWorkspacePermission("auditor", "periods.reanalyze")).toBe(true);
    expect(hasWorkspacePermission("auditor", "contracts.manage")).toBe(true);
    expect(hasWorkspacePermission("auditor", "users.manage")).toBe(false);
  });

  test("compensation role is focused on evidence, claims, recovery and AI", () => {
    expect(hasWorkspacePermission("compensation", "compensation.manage")).toBe(true);
    expect(hasWorkspacePermission("compensation", "telegram.manage")).toBe(true);
    expect(hasWorkspacePermission("compensation", "recovery.manage")).toBe(true);
    expect(hasWorkspacePermission("compensation", "ai.use")).toBe(true);
    expect(hasWorkspacePermission("compensation", "contracts.manage")).toBe(false);
    expect(hasWorkspacePermission("compensation", "users.manage")).toBe(false);
    expect(hasWorkspacePermission("compensation", "imports.create")).toBe(false);
  });

  test("branch managers and viewers cannot mutate company-wide configuration", () => {
    expect(hasWorkspacePermission("branch_manager", "branches.read")).toBe(true);
    expect(hasWorkspacePermission("branch_manager", "telegram.read")).toBe(true);
    expect(hasWorkspacePermission("branch_manager", "compensation.manage")).toBe(false);
    expect(hasWorkspacePermission("viewer", "reports.read")).toBe(true);
    expect(hasWorkspacePermission("viewer", "contracts.read")).toBe(true);
    expect(hasWorkspacePermission("viewer", "contracts.manage")).toBe(false);
  });

  test("restricted roles require branch assignments", () => {
    expect(roleHasGlobalBranchAccess("owner")).toBe(true);
    expect(roleHasGlobalBranchAccess("admin")).toBe(true);
    expect(roleHasGlobalBranchAccess("auditor")).toBe(true);
    expect(roleHasGlobalBranchAccess("viewer")).toBe(true);
    expect(roleHasGlobalBranchAccess("compensation")).toBe(false);
    expect(roleHasGlobalBranchAccess("branch_manager")).toBe(false);
  });

  test("owner cannot be assigned through normal member management", () => {
    expect(ASSIGNABLE_WORKSPACE_ROLES).not.toContain("owner");
    expect(ROLE_PERMISSIONS.owner.length).toBeGreaterThan(ROLE_PERMISSIONS.compensation.length);
  });
});
