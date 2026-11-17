import { describe, it, expect } from "vitest";
import {
  diffPermissions,
  grantableRoles,
  isLastOwner,
  isValidCustomRoleKey,
  missingPermissions,
  unknownPermissions,
} from "./team-rules";

describe("isValidCustomRoleKey", () => {
  it("accepts lowercase keys of 3-30 characters", () => {
    expect(isValidCustomRoleKey("grader")).toBe(true);
    expect(isValidCustomRoleKey("lecture-helper_2")).toBe(true);
  });
  it("rejects bad shapes", () => {
    expect(isValidCustomRoleKey("ab")).toBe(false);
    expect(isValidCustomRoleKey("Grader")).toBe(false);
    expect(isValidCustomRoleKey("1grader")).toBe(false);
    expect(isValidCustomRoleKey("has space")).toBe(false);
    expect(isValidCustomRoleKey("x".repeat(31))).toBe(false);
  });
  it("rejects the system keys", () => {
    for (const k of ["owner", "instructor", "assistant", "student"]) expect(isValidCustomRoleKey(k)).toBe(false);
  });
});

describe("permissions", () => {
  it("finds unknown permission keys", () => {
    expect(unknownPermissions(["course.edit", "made.up"])).toEqual(["made.up"]);
    expect(unknownPermissions(["course.edit"])).toEqual([]);
  });

  it("the escalation check lists what the actor lacks", () => {
    const actor = new Set(["course.edit", "lecture.edit"]);
    expect(missingPermissions(actor, ["course.edit"])).toEqual([]);
    expect(missingPermissions(actor, ["course.edit", "exam.grade", "user.manage"])).toEqual(["exam.grade", "user.manage"]);
  });

  it("diffs a permission change", () => {
    expect(diffPermissions(["a", "b"], ["b", "c"])).toEqual({ added: ["c"], removed: ["a"] });
    expect(diffPermissions(["a"], ["a"])).toEqual({ added: [], removed: [] });
  });
});

describe("last owner", () => {
  it("protects the only owner", () => {
    expect(isLastOwner(1)).toBe(true);
    expect(isLastOwner(0)).toBe(true);
    expect(isLastOwner(2)).toBe(false);
  });
});

describe("grantableRoles", () => {
  const roles = [
    { key: "owner", permissions: ["course.edit", "user.manage"] },
    { key: "instructor", permissions: ["course.edit", "lecture.edit"] },
    { key: "assistant", permissions: ["lecture.edit"] },
    { key: "student", permissions: [] },
  ];
  it("offers only roles within the actor's own rights, never student", () => {
    const actor = new Set(["course.edit", "lecture.edit"]);
    expect(grantableRoles(roles, actor).map((r) => r.key)).toEqual(["instructor", "assistant"]);
  });
  it("an owner can grant everything except student", () => {
    const owner = new Set(["course.edit", "lecture.edit", "user.manage"]);
    expect(grantableRoles(roles, owner).map((r) => r.key)).toEqual(["owner", "instructor", "assistant"]);
  });
});
