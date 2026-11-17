import { describe, it, expect } from "vitest";
import { isStale } from "./deliver";

const now = new Date("2026-10-03T12:00:00Z");
const past = new Date("2026-10-03T11:00:00Z");
const future = new Date("2026-10-03T13:00:00Z");

describe("isStale", () => {
  it("drops a lecture reminder once the lecture has started", () => {
    expect(isStale("lecture.upcoming_1h", { lectureStartsAt: past }, now)).toBe(true);
    expect(isStale("lecture.upcoming_24h", { lectureStartsAt: future }, now)).toBe(false);
  });

  it("drops deadline reminders once the deadline has passed", () => {
    expect(isStale("question.due_soon", { questionDueAt: past }, now)).toBe(true);
    expect(isStale("exam.closing_soon", { examDueAt: future }, now)).toBe(false);
  });

  it("never drops event notifications", () => {
    expect(isStale("question.graded", { questionDueAt: past }, now)).toBe(false);
    expect(isStale("certificate.approved", {}, now)).toBe(false);
  });

  it("keeps a reminder whose date is unknown", () => {
    expect(isStale("lecture.upcoming_1h", {}, now)).toBe(false);
  });
});
