import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import path from "node:path";

async function read(relativePath: string) {
  return readFile(path.resolve(process.cwd(), relativePath), "utf8");
}

describe("contract rulebook workflow", () => {
  test("keeps ownership and approval decisions server-authoritative", async () => {
    const source = await read("src/lib/contract-rulebook.server.ts");

    expect(source).toContain('requireWorkspacePermission("contracts.read")');
    expect(source).toContain('requireWorkspacePermission("contracts.manage")');
    expect(source).not.toContain("requireServerUser()");
    expect(source).toContain("user_id: userId");
    expect(source).toContain("assertDraftVersion");
    expect(source).toContain('.update({ status: "approved" })');
    expect(source).toContain("version_number: (latest?.version_number ?? 0) + 1");
    expect(source).not.toContain("service_role");
  });

  test("validates rule values before persistence", async () => {
    const source = await read("src/lib/contract-rulebook.server.ts");

    expect(source).toContain('value < 0 || value > 100');
    expect(source).toContain('/^[A-Z]{3}$/.test(code)');
    expect(source).toContain('value !== "true" && value !== "false"');
    expect(source).toContain('input.scopeType === "branch" && !scopeKey');
  });

  test("exposes the management workflow in the authenticated app", async () => {
    const route = await read("src/routes/_authenticated/contracts.tsx");
    const shell = await read("src/components/AppShell.tsx");

    expect(shell).toContain('{ to: "/contracts", label: "العقود وشروط المنصات", permission: "contracts.read" }');
    expect(route).toContain("إنشاء نسخة عقد جديدة");
    expect(route).toContain("إضافة بند");
    expect(route).toContain("اعتماد وقفل النسخة");
    expect(route).toContain("سجل التغييرات");
  });

  test("does not couple the rulebook workflow to marketplace engines", async () => {
    const server = await read("src/lib/contract-rulebook.server.ts");
    const functions = await read("src/lib/contract-rulebook.functions.ts");

    expect(server).not.toContain("/analysis/");
    expect(functions).not.toContain("/analysis/");
    expect(server).not.toContain("hungerstation.ts");
    expect(server).not.toContain("keeta.ts");
    expect(server).not.toContain("jahez.ts");
  });
});
