import { describe, it, expect } from "vitest";
import { attendanceRate, average, histogram, percentOf, startOfWeek, weeklyCounts } from "./report-math";

describe("percentOf / average", () => {
  it("handles a zero denominator and empty lists", () => {
    expect(percentOf(1, 4)).toBe(25);
    expect(percentOf(1, 0)).toBeNull();
    expect(average([])).toBeNull();
    expect(average([2, 4, 9])).toBe(5);
  });
});

describe("attendanceRate", () => {
  it("counts present and weighted partial over everyone considered", () => {
    expect(attendanceRate({ PRESENT: 6, PARTIAL: 2, ABSENT: 2, EXCUSED: 0 }, 0.5)).toBe(70);
    expect(attendanceRate({ PRESENT: 6, PARTIAL: 2, ABSENT: 2, EXCUSED: 0 }, 1)).toBe(80);
  });
  it("leaves excused students out", () => {
    expect(attendanceRate({ PRESENT: 1, PARTIAL: 0, ABSENT: 1, EXCUSED: 8 })).toBe(50);
  });
  it("is null when nothing was recorded", () => {
    expect(attendanceRate({ PRESENT: 0, PARTIAL: 0, ABSENT: 0, EXCUSED: 3 })).toBeNull();
  });
});

describe("weeks", () => {
  it("starts the week on Monday (UTC)", () => {
    expect(startOfWeek(new Date("2026-10-07T15:00:00Z")).toISOString()).toBe("2026-10-05T00:00:00.000Z"); // Wednesday
    expect(startOfWeek(new Date("2026-10-11T23:59:00Z")).toISOString()).toBe("2026-10-05T00:00:00.000Z"); // Sunday
    expect(startOfWeek(new Date("2026-10-05T00:00:00Z")).toISOString()).toBe("2026-10-05T00:00:00.000Z"); // Monday
  });

  it("buckets dates into the last N weeks, newest last, ignoring older ones", () => {
    const now = new Date("2026-10-07T12:00:00Z");
    const result = weeklyCounts(
      [new Date("2026-10-06T00:00:00Z"), new Date("2026-10-07T00:00:00Z"), new Date("2026-09-30T00:00:00Z"), new Date("2026-06-01T00:00:00Z")],
      now,
      3,
    );
    expect(result.map((b) => b.count)).toEqual([0, 1, 2]);
    expect(result[2].weekStart.toISOString()).toBe("2026-10-05T00:00:00.000Z");
    expect(result[0].weekStart.toISOString()).toBe("2026-09-21T00:00:00.000Z");
  });
});

describe("histogram", () => {
  it("groups percentages into tens, with 100 in the last bucket", () => {
    const h = histogram([0, 9.9, 10, 55, 99.9, 100, 100]);
    expect(h).toHaveLength(10);
    expect(h[0].count).toBe(2); // 0 and 9.9
    expect(h[1].count).toBe(1);
    expect(h[5].count).toBe(1);
    expect(h[9].count).toBe(3); // 99.9, 100, 100
    expect(h.reduce((a, b) => a + b.count, 0)).toBe(7);
  });
  it("ignores values that are not numbers", () => {
    expect(histogram([Number.NaN]).reduce((a, b) => a + b.count, 0)).toBe(0);
  });
});
