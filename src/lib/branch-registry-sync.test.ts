import { describe, expect, test } from "bun:test";

import type { BranchRow } from "./analysis/types";
import type { RegistryBranch } from "./branch-registry";
import { planRegistrySync } from "./branch-registry-sync";

const branch = (name: string, branchId: string, orders = 10) => ({ branch: name, branchId, orders }) as BranchRow;
const row = (over: Partial<RegistryBranch>): RegistryBranch => ({ id: "r1", name: "x", hungerstation_id: null, keeta_id: null, jahez_id: null, ...over });

describe("planRegistrySync", () => {
  test("adds new branches with their platform id, once each", () => {
    expect(planRegistrySync([], "hungerstation", [branch("العليا", "123"), branch("النرجس", "456"), branch("العليا", "123")])).toEqual({
      inserts: [
        { name: "العليا", hungerstation_id: "123" },
        { name: "النرجس", hungerstation_id: "456" },
      ],
      updates: [],
    });
  });

  test("links a branch already named the same, and skips one already known by id", () => {
    const existing = [row({ id: "a", name: "العليا", keeta_id: "k1" }), row({ id: "b", name: "Other", hungerstation_id: "456" })];
    expect(planRegistrySync(existing, "hungerstation", [branch(" العليا ", "123"), branch("النرجس", "456")])).toEqual({
      inserts: [],
      updates: [{ id: "a", hungerstation_id: "123" }],
    });
  });

  test("never overwrites an id, and ignores invoice-only rows and blank names", () => {
    const existing = [row({ id: "a", name: "العليا", hungerstation_id: "999" })];
    expect(planRegistrySync(existing, "hungerstation", [branch("العليا", "123"), branch("فاتورة فقط", "777", 0), branch(" ", "1")])).toEqual({
      inserts: [],
      updates: [],
    });
  });

  test("Jahez files without ids use the branch name as its id", () => {
    expect(planRegistrySync([], "jahez", [branch("الملقا", "")])).toEqual({ inserts: [{ name: "الملقا", jahez_id: "الملقا" }], updates: [] });
  });
});
