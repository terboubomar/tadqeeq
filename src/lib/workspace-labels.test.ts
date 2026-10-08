import { describe, expect, test } from "bun:test";

import { companiesLabel } from "./workspace-labels";
import { workspaceErrorMessage } from "./workspace-management.server";

describe("company count in Arabic", () => {
  test("uses the dual and the plural correctly", () => {
    expect(companiesLabel(1)).toBe("شركة واحدة");
    expect(companiesLabel(2)).toBe("شركتان");
    expect(companiesLabel(3)).toBe("3 شركات");
    expect(companiesLabel(10)).toBe("10 شركات");
    expect(companiesLabel(11)).toBe("11 شركة");
  });
});

describe("workspace errors in Arabic", () => {
  test("maps the database refusals the person can meet", () => {
    expect(workspaceErrorMessage("An active subscription is required to create a workspace", "x")).toBe("إضافة شركة متاحة بعد تفعيل الاشتراك.");
    expect(workspaceErrorMessage("Workspace limit reached for this subscription", "x")).toContain("حد الشركات");
    expect(workspaceErrorMessage("An active account is required to create a workspace", "x")).toContain("غير مفعّل");
    expect(workspaceErrorMessage("Could not find the function public.create_account_workspace(p_name) in the schema cache", "x")).toContain("غير جاهزة");
    expect(workspaceErrorMessage("You are not an active member of this workspace", "x")).toBe("لم تعد عضواً في هذه الشركة.");
  });

  test("never shows an unknown English message", () => {
    expect(workspaceErrorMessage("duplicate key value violates unique constraint", "تعذّر إنشاء الشركة.")).toBe("تعذّر إنشاء الشركة.");
  });
});
