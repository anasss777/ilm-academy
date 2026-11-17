import { describe, it, expect } from "vitest";
import { PERMISSION_KEYS } from "../auth/permission-keys";
import { PERMISSION_GROUPS, permissionMessageKey } from "./permission-groups";

describe("permission groups", () => {
  it("places every permission in exactly one group", () => {
    const placed = PERMISSION_GROUPS.flatMap((g) => g.keys);
    expect(new Set(placed).size).toBe(placed.length); // no duplicates
    expect([...placed].sort()).toEqual([...PERMISSION_KEYS].sort());
  });

  it("message keys never contain a dot", () => {
    for (const k of PERMISSION_KEYS) expect(permissionMessageKey(k)).not.toContain(".");
  });
});
