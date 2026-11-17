import { describe, it, expect } from "vitest";
import { formatDate, formatDateTime, formatNumber, formatPercent, languageName } from "./format";

const date = new Date("2026-10-03T15:30:00Z");

describe("formatNumber / formatPercent", () => {
  it("uses Western digits in Arabic and English", () => {
    expect(formatNumber(80, "ar")).toBe("80");
    expect(formatNumber(80, "en")).toBe("80");
    expect(formatPercent(100, "ar")).toBe("100%");
    expect(/[\u0660-\u0669]/.test(formatPercent(75, "ar"))).toBe(false);
  });
  it("returns a string so templates cannot reformat it", () => {
    expect(typeof formatPercent(80, "ar")).toBe("string");
  });
});

describe("formatDate / formatDateTime", () => {
  it("contains the year in Western digits for Arabic", () => {
    const out = formatDateTime(date, "ar", "Africa/Tunis");
    expect(out).toContain("2026");
    expect(/[\u0660-\u0669]/.test(out)).toBe(false);
    expect(formatDate(date, "ar", "Africa/Tunis")).toContain("2026");
  });
  it("respects the time zone", () => {
    // 15:30 UTC is 16:30 in Tunis (UTC+1, no DST) and 17:30 in Cairo in October (UTC+3 or UTC+2 depending on DST)
    expect(formatDateTime(date, "en", "Africa/Tunis")).toContain("4:30");
  });
  it("falls back instead of throwing on an unknown time zone", () => {
    expect(() => formatDateTime(date, "en", "Not/AZone")).not.toThrow();
  });
});

describe("languageName", () => {
  it("names a language in the reader's language, and tolerates junk", () => {
    expect(languageName("en", "ar")).toBe("Arabic");
    expect(languageName("ar", "en").length).toBeGreaterThan(0);
    expect(languageName("en", "not a code!")).toBe("not a code!");
  });
});
