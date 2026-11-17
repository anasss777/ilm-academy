import { describe, it, expect } from "vitest";
import {
  EMAIL_TYPES,
  NOTIFICATION_TYPES,
  asPayload,
  isNotificationType,
  notificationPath,
  typeKey,
} from "./catalog";

const C = "11111111-1111-4111-8111-111111111111";
const L = "22222222-2222-4222-8222-222222222222";
const Q = "33333333-3333-4333-8333-333333333333";
const A = "44444444-4444-4444-8444-444444444444";

describe("notificationPath", () => {
  it("leads each type to the right page", () => {
    expect(notificationPath("enrollment.confirmed", { courseId: C })).toBe(`/my-courses/${C}`);
    expect(notificationPath("lecture.upcoming_1h", { courseId: C, lectureId: L })).toBe(`/my-courses/${C}/lectures/${L}`);
    expect(notificationPath("recording.added", { courseId: C, lectureId: L })).toBe(`/my-courses/${C}/lectures/${L}`);
    expect(notificationPath("question.graded", { courseId: C, questionId: Q })).toBe(`/my-courses/${C}/questions/${Q}`);
    expect(notificationPath("exam.published", { courseId: C })).toBe(`/my-courses/${C}/exam`);
    expect(notificationPath("exam.results_released", { courseId: C, attemptId: A })).toBe(`/my-courses/${C}/exam/attempts/${A}`);
    expect(notificationPath("certificate.approved", { courseId: C })).toBe(`/my-courses/${C}/progress`);
  });

  it("falls back to the list page when the specific id is missing", () => {
    expect(notificationPath("question.due_soon", { courseId: C })).toBe(`/my-courses/${C}/questions`);
    expect(notificationPath("lecture.upcoming_24h", { courseId: C })).toBe(`/my-courses/${C}/lectures`);
  });

  it("returns null for an incomplete payload or an unknown type", () => {
    expect(notificationPath("question.graded", {})).toBeNull();
    expect(notificationPath("question.graded", null)).toBeNull();
    expect(notificationPath("something.else", { courseId: C })).toBeNull();
  });
});

describe("catalog", () => {
  it("every emailed type is a known type", () => {
    for (const t of EMAIL_TYPES) expect(NOTIFICATION_TYPES).toContain(t);
  });

  it("type keys never contain a dot", () => {
    for (const t of NOTIFICATION_TYPES) expect(typeKey(t)).not.toContain(".");
  });

  it("recognises types and tolerates odd payloads", () => {
    expect(isNotificationType("exam.published")).toBe(true);
    expect(isNotificationType("nope")).toBe(false);
    expect(asPayload([1, 2])).toEqual({});
    expect(asPayload("x")).toEqual({});
  });
});
