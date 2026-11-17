import { describe, it, expect } from "vitest";
import { parseUuid, safeNextPath } from "./params";

describe("safeNextPath", () => {
  it("accepts internal paths and keeps the query string", () => {
    expect(safeNextPath("/my-courses")).toBe("/my-courses");
    expect(safeNextPath("/courses/intro?tab=2")).toBe("/courses/intro?tab=2");
  });

  it("strips a leading locale segment", () => {
    expect(safeNextPath("/ar/my-courses/abc")).toBe("/my-courses/abc");
    expect(safeNextPath("/en")).toBe("/");
    expect(safeNextPath("/arabic")).toBe("/arabic"); // not a locale segment
  });

  it("rejects external and protocol-relative URLs", () => {
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("javascript:alert(1)")).toBeNull();
  });

  it("rejects backslash and control-character tricks", () => {
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath("/\tevil")).toBeNull();
  });

  it("rejects api and auth paths", () => {
    expect(safeNextPath("/api/me")).toBeNull();
    expect(safeNextPath("/auth/callback")).toBeNull();
  });

  it("returns null for empty input", () => {
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath("")).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
  });
});

describe("parseUuid", () => {
  it("accepts a UUID and rejects anything else", () => {
    expect(parseUuid("00000000-0000-0000-0000-000000000001")).toBe("00000000-0000-0000-0000-000000000001");
    expect(parseUuid("not-a-uuid")).toBeNull();
    expect(parseUuid(null)).toBeNull();
  });
});
