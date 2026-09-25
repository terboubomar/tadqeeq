export type WorkspaceRole =
  | "owner"
  | "admin"
  | "auditor"
  | "compensation"
  | "branch_manager"
  | "viewer";

export type WorkspacePermission =
  | "users.manage"
  | "workspace.settings.manage"
  | "branches.read"
  | "branches.manage"
  | "imports.create"
  | "periods.read"
  | "periods.reanalyze"
  | "reports.read"
  | "financials.read"
  | "contracts.read"
  | "contracts.manage"
  | "exceptions.read"
  | "exceptions.manage"
  | "compensation.read"
  | "compensation.manage"
  | "telegram.read"
  | "telegram.manage"
  | "recovery.read"
  | "recovery.manage"
  | "ai.use"
  | "audit_log.read";

export const WORKSPACE_ROLE_LABELS: Record<WorkspaceRole, string> = {
  owner: "المالك",
  admin: "مدير",
  auditor: "مدقق / مالية",
  compensation: "مسؤول التعويضات",
  branch_manager: "مدير فرع",
  viewer: "مشاهد",
};

const ALL_PERMISSIONS: WorkspacePermission[] = [
  "users.manage",
  "workspace.settings.manage",
  "branches.read",
  "branches.manage",
  "imports.create",
  "periods.read",
  "periods.reanalyze",
  "reports.read",
  "financials.read",
  "contracts.read",
  "contracts.manage",
  "exceptions.read",
  "exceptions.manage",
  "compensation.read",
  "compensation.manage",
  "telegram.read",
  "telegram.manage",
  "recovery.read",
  "recovery.manage",
  "ai.use",
  "audit_log.read",
];

export const ROLE_PERMISSIONS: Record<WorkspaceRole, readonly WorkspacePermission[]> = {
  owner: ALL_PERMISSIONS,
  admin: ALL_PERMISSIONS,
  auditor: [
    "branches.read",
    "imports.create",
    "periods.read",
    "periods.reanalyze",
    "reports.read",
    "financials.read",
    "contracts.read",
    "contracts.manage",
    "exceptions.read",
    "exceptions.manage",
    "compensation.read",
    "compensation.manage",
    "telegram.read",
    "recovery.read",
    "recovery.manage",
    "ai.use",
    "audit_log.read",
  ],
  compensation: [
    "branches.read",
    "compensation.read",
    "compensation.manage",
    "telegram.read",
    "telegram.manage",
    "recovery.read",
    "recovery.manage",
    "ai.use",
  ],
  branch_manager: [
    "branches.read",
    "compensation.read",
    "telegram.read",
  ],
  viewer: [
    "branches.read",
    "periods.read",
    "reports.read",
    "financials.read",
    "contracts.read",
    "exceptions.read",
    "compensation.read",
    "recovery.read",
  ],
};

export function hasWorkspacePermission(
  role: WorkspaceRole,
  permission: WorkspacePermission,
): boolean {
  return ROLE_PERMISSIONS[role].includes(permission);
}

export function roleHasGlobalBranchAccess(role: WorkspaceRole): boolean {
  return role === "owner" || role === "admin" || role === "auditor" || role === "viewer";
}

export const ASSIGNABLE_WORKSPACE_ROLES: WorkspaceRole[] = [
  "admin",
  "auditor",
  "compensation",
  "branch_manager",
  "viewer",
];
