import { describe, it, expect } from "vitest";
import { fromLocalInput, toLocalInput } from "./datetime";

describe("datetime-local conversion", () => {
  it("round-trips an instant to the minute, in any time zone", () => {
    const instant = new Date("2026-10-03T18:07:30Z");
    expect(fromLocalInput(toLocalInput(instant))).toBe("2026-10-03T18:07:00.000Z");
  });

  it("produces the shape the input expects", () => {
    expect(toLocalInput(new Date("2026-10-03T18:07:00Z"))).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  });

  it("handles empty and invalid input", () => {
    expect(toLocalInput(null)).toBe("");
    expect(toLocalInput("not a date")).toBe("");
    expect(fromLocalInput("")).toBeNull();
    expect(fromLocalInput("garbage")).toBeNull();
  });
});
