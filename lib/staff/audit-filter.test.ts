import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, it, expect } from "vitest";
import { KNOWN_AUDIT_ACTIONS, AUDIT_AREAS, actionMessageKey, parseAuditFilter, zonedDayStart } from "./audit-filter";

describe("zonedDayStart", () => {
  it("returns the instant a day starts in the zone", () => {
    expect(zonedDayStart("2026-10-03", "UTC")?.toISOString()).toBe("2026-10-03T00:00:00.000Z");
    expect(zonedDayStart("2026-10-03", "Africa/Tunis")?.toISOString()).toBe("2026-10-02T23:00:00.000Z");
  });
  it("rejects malformed dates and unknown zones", () => {
    expect(zonedDayStart("2026-13-40", "UTC")).toBeNull();
    expect(zonedDayStart("2026-02-30", "UTC")).toBeNull();
    expect(zonedDayStart("yesterday", "UTC")).toBeNull();
    expect(zonedDayStart("2026-10-03", "Not/AZone")).toBeNull();
  });
});

describe("parseAuditFilter", () => {
  const ID = "11111111-1111-4111-8111-111111111111";

  it("accepts valid values and echoes them for the page links", () => {
    const { filter, query } = parseAuditFilter(
      { q: " grade ", area: "exam", entityType: "Course", entityId: ID, actor: ID, from: "2026-10-01", to: "2026-10-03" },
      "UTC",
    );
    expect(filter.q).toBe("grade");
    expect(filter.area).toBe("exam");
    expect(filter.entityType).toBe("Course");
    expect(filter.entityId).toBe(ID);
    expect(filter.actorId).toBe(ID);
    expect(filter.from?.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    // "to" includes the whole chosen day: the bound is the start of the next one
    expect(filter.toExclusive?.toISOString()).toBe("2026-10-04T00:00:00.000Z");
    expect(query).toMatchObject({ q: "grade", area: "exam", from: "2026-10-01", to: "2026-10-03" });
  });

  it("drops anything invalid, so it never reaches the query or the next link", () => {
    const { filter, query } = parseAuditFilter(
      { area: "hack", entityType: "x; drop table", entityId: "not-an-id", actor: "nope", from: "tomorrow", to: "2026-99-99" },
      "UTC",
    );
    expect(filter).toEqual({});
    expect(query).toEqual({});
  });

  it("limits the search text", () => {
    expect(parseAuditFilter({ q: "x".repeat(300) }, "UTC").filter.q?.length).toBe(100);
  });
});

describe("action labels", () => {
  it("every known action and area has a label in both languages", () => {
    for (const locale of ["ar", "en"]) {
      const m = JSON.parse(readFileSync(join(process.cwd(), "messages", `${locale}.json`), "utf8")).admin.audit as {
        actions: Record<string, string>;
        areas: Record<string, string>;
      };
      for (const a of KNOWN_AUDIT_ACTIONS) expect(typeof m.actions[actionMessageKey(a)], `${locale}:${a}`).toBe("string");
      for (const a of AUDIT_AREAS) expect(typeof m.areas[a], `${locale}:area ${a}`).toBe("string");
    }
  });

  it("message keys never contain a dot", () => {
    for (const a of KNOWN_AUDIT_ACTIONS) expect(actionMessageKey(a)).not.toContain(".");
  });
});
