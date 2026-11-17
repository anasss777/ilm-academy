import { describe, it, expect } from "vitest";
import {
  canSeeByVisibility,
  canSeeZoom,
  examAvailability,
  lectureState,
  questionSubmissionState,
  shouldRevealExamKeys,
} from "./visibility";
import { projectQuestionForStudent, type ProjectableQuestion } from "./project";

const d = (s: string) => new Date(`2026-10-${s}:00Z`);

describe("canSeeByVisibility", () => {
  const anon = { signedIn: false, enrolled: false };
  const signedIn = { signedIn: true, enrolled: false };
  const enrolled = { signedIn: true, enrolled: true };

  it("PUBLIC is visible to everyone", () => {
    expect([anon, signedIn, enrolled].map((v) => canSeeByVisibility("PUBLIC", v))).toEqual([true, true, true]);
  });
  it("SIGNED_IN needs an account", () => {
    expect([anon, signedIn, enrolled].map((v) => canSeeByVisibility("SIGNED_IN", v))).toEqual([false, true, true]);
  });
  it("ENROLLED needs an active enrollment", () => {
    expect([anon, signedIn, enrolled].map((v) => canSeeByVisibility("ENROLLED", v))).toEqual([false, false, true]);
  });
});

describe("lectures and zoom", () => {
  const startsAt = d("10T10:00");
  const endsAt = d("10T12:00");

  it("derives the lecture state", () => {
    expect(lectureState(d("10T09:00"), startsAt, endsAt)).toBe("UPCOMING");
    expect(lectureState(d("10T11:00"), startsAt, endsAt)).toBe("LIVE");
    expect(lectureState(d("10T13:00"), startsAt, endsAt)).toBe("ENDED");
  });

  it("shows zoom to enrolled students until an hour after the end", () => {
    expect(canSeeZoom({ enrolled: true, now: d("09T00:00"), endsAt })).toBe(true); // well before
    expect(canSeeZoom({ enrolled: true, now: d("10T12:59"), endsAt })).toBe(true); // overrun grace
    expect(canSeeZoom({ enrolled: true, now: d("10T13:01"), endsAt })).toBe(false);
  });

  it("never shows zoom to anyone who is not enrolled", () => {
    expect(canSeeZoom({ enrolled: false, now: d("10T11:00"), endsAt })).toBe(false);
  });
});

describe("questionSubmissionState", () => {
  const base = {
    now: d("10T12:00"),
    dueAt: d("11T12:00") as Date | null,
    lateCutoffAt: null as Date | null,
    extensionDueAt: null as Date | null,
    allowLate: true,
    existing: null as { gradedAt: Date | null } | null,
  };

  it("allows a first submission before the deadline", () => {
    expect(questionSubmissionState(base)).toEqual({ canSubmit: true, isLate: false, reason: null });
  });
  it("allows a late first submission when late is allowed", () => {
    expect(questionSubmissionState({ ...base, now: d("12T12:00") })).toEqual({ canSubmit: true, isLate: true, reason: null });
  });
  it("blocks late submissions when not allowed, and after the cutoff", () => {
    expect(questionSubmissionState({ ...base, now: d("12T12:00"), allowLate: false }).reason).toBe("DEADLINE_PASSED");
    expect(questionSubmissionState({ ...base, now: d("15T12:00"), lateCutoffAt: d("14T12:00") }).reason).toBe("SUBMISSIONS_CLOSED");
  });
  it("locks a graded submission, and an existing one once the deadline passes", () => {
    expect(questionSubmissionState({ ...base, existing: { gradedAt: d("10T00:00") } }).reason).toBe("ALREADY_GRADED");
    expect(questionSubmissionState({ ...base, now: d("12T12:00"), existing: { gradedAt: null } }).reason).toBe("DEADLINE_PASSED");
    expect(questionSubmissionState({ ...base, existing: { gradedAt: null } }).canSubmit).toBe(true);
  });
  it("an extension reopens the window", () => {
    const r = questionSubmissionState({ ...base, now: d("12T12:00"), allowLate: false, extensionDueAt: d("14T12:00") });
    expect(r).toEqual({ canSubmit: true, isLate: false, reason: null });
  });
});

describe("examAvailability and key reveal", () => {
  const args = {
    now: d("10T12:00"),
    opensAt: d("09T00:00") as Date | null,
    effectiveDueAt: d("11T00:00") as Date | null,
    attemptsUsed: 0,
    allowed: 1,
    hasInProgress: false,
  };

  it("is open with attempts left", () => {
    expect(examAvailability(args)).toEqual({ state: "OPEN", canStart: true, canStillAttempt: true });
  });
  it("is not open yet before opensAt, but the student can still attempt later", () => {
    expect(examAvailability({ ...args, opensAt: d("11T00:00"), effectiveDueAt: d("12T00:00") })).toEqual({
      state: "NOT_OPEN", canStart: false, canStillAttempt: true,
    });
  });
  it("is closed after the deadline", () => {
    expect(examAvailability({ ...args, now: d("12T00:00") })).toEqual({ state: "CLOSED", canStart: false, canStillAttempt: false });
  });
  it("cannot start without attempts left, unless one is in progress", () => {
    expect(examAvailability({ ...args, attemptsUsed: 1 }).canStart).toBe(false);
    expect(examAvailability({ ...args, attemptsUsed: 1, hasInProgress: true }).canStart).toBe(true);
  });

  const reveal = {
    mode: "AFTER_GRADE" as const,
    gradeReleased: true,
    effectiveDueAt: d("11T00:00") as Date | null,
    now: d("10T12:00"),
  };
  it("hides exam keys while the student can still attempt, even if released", () => {
    expect(shouldRevealExamKeys({ ...reveal, canStillAttempt: true })).toBe(false);
  });
  it("reveals exam keys once no further attempt is possible and the mode allows it", () => {
    expect(shouldRevealExamKeys({ ...reveal, canStillAttempt: false })).toBe(true);
    expect(shouldRevealExamKeys({ ...reveal, canStillAttempt: false, gradeReleased: false })).toBe(false);
    expect(shouldRevealExamKeys({ ...reveal, canStillAttempt: false, mode: "NEVER" })).toBe(false);
  });
});

describe("projectQuestionForStudent: no answer key unless revealed", () => {
  const q: ProjectableQuestion = {
    id: "q1",
    type: "MULTIPLE_CHOICE",
    body: "Pick one",
    points: 5,
    explanation: "SECRET-EXPLANATION",
    options: [
      { id: "o2", text: "Right", position: 1, isCorrect: true },
      { id: "o1", text: "Wrong", position: 0, isCorrect: false },
    ],
  };

  it("returns options in order and without any correctness information", () => {
    const out = projectQuestionForStudent(q, false);
    expect(out.options).toEqual([{ id: "o1", text: "Wrong" }, { id: "o2", text: "Right" }]);
    const json = JSON.stringify(out);
    expect(json).not.toContain("isCorrect");
    expect(json).not.toContain("correctOptionIds");
    expect(json).not.toContain("SECRET-EXPLANATION");
    expect("explanation" in out).toBe(false);
  });

  it("adds the key and explanation only when revealed", () => {
    const out = projectQuestionForStudent(q, true);
    expect(out.correctOptionIds).toEqual(["o2"]);
    expect(out.explanation).toBe("SECRET-EXPLANATION");
    expect(JSON.stringify(out)).not.toContain("isCorrect");
  });

  it("handles open questions (no options)", () => {
    const open = projectQuestionForStudent({ ...q, type: "OPEN", options: [] }, false);
    expect(open.options).toEqual([]);
  });
});
