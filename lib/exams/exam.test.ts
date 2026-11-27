import { describe, it, expect } from "vitest";
import { GradingError } from "../grading/grading";
import {
  allowedAttempts,
  assertCanStartAttempt,
  checkExamWindow,
  effectiveExamDueAt,
  gradeAttempt,
  summarizeScores,
  validateAnswerShape,
  type GradableQuestion,
  ATTEMPT_GRACE_MS,
  attemptEndsAt,
  attemptExpiresAt,
  checkAttemptWritable,
  isAttemptOver,
  secondsLeft,
} from "./exam";

const d = (s: string) => new Date(`2026-10-${s}:00Z`);

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof GradingError ? e.code : "OTHER";
  }
  return null;
};

describe("attempts and deadlines", () => {
  it("adds extra attempts from grants to the limit", () => {
    expect(allowedAttempts(1, [])).toBe(1);
    expect(allowedAttempts(1, [{ extraAttempts: 1 }, { extraAttempts: 2 }])).toBe(4);
  });

  it("blocks starting once attempts are used up", () => {
    expect(codeOf(() => assertCanStartAttempt(1, 1))).toBe("NO_ATTEMPTS_LEFT");
    expect(codeOf(() => assertCanStartAttempt(1, 2))).toBeNull();
  });

  it("uses the latest grant deadline and never shortens it", () => {
    const due = d("10T12:00");
    expect(effectiveExamDueAt(due, [{ newDueAt: d("12T12:00") }, { newDueAt: d("11T12:00") }])).toEqual(d("12T12:00"));
    expect(effectiveExamDueAt(due, [{ newDueAt: d("09T12:00") }])).toEqual(due);
    expect(effectiveExamDueAt(due, [{ newDueAt: null }])).toEqual(due);
  });

  it("an exam with no deadline stays open even if a grant carries a date", () => {
    expect(effectiveExamDueAt(null, [{ newDueAt: d("12T12:00") }])).toBeNull();
  });

  it("checks the open/close window", () => {
    const opensAt = d("05T00:00");
    const due = d("10T00:00");
    expect(codeOf(() => checkExamWindow({ now: d("04T00:00"), opensAt, effectiveDueAt: due }))).toBe("EXAM_NOT_OPEN");
    expect(codeOf(() => checkExamWindow({ now: d("07T00:00"), opensAt, effectiveDueAt: due }))).toBeNull();
    expect(codeOf(() => checkExamWindow({ now: due, opensAt, effectiveDueAt: due }))).toBeNull();
    expect(codeOf(() => checkExamWindow({ now: d("11T00:00"), opensAt, effectiveDueAt: due }))).toBe("EXAM_CLOSED");
    expect(codeOf(() => checkExamWindow({ now: d("30T00:00"), opensAt: null, effectiveDueAt: null }))).toBeNull();
  });
});

describe("validateAnswerShape", () => {
  const mc = { type: "MULTIPLE_CHOICE" as const, options: [{ id: "a" }, { id: "b" }] };
  const open = { type: "OPEN" as const, options: [] };

  it("accepts a valid option and rejects a foreign one", () => {
    expect(validateAnswerShape(mc, { selectedOptionId: "b" })).toEqual({ selectedOptionId: "b", answerText: null });
    expect(codeOf(() => validateAnswerShape(mc, { selectedOptionId: "zzz" }))).toBe("INVALID_ANSWER");
  });

  it("trims open answers and treats blanks as 'clear'", () => {
    expect(validateAnswerShape(open, { answerText: "  hello " })).toEqual({ selectedOptionId: null, answerText: "hello" });
    expect(validateAnswerShape(open, { answerText: "   " })).toBeNull();
    expect(validateAnswerShape(mc, { selectedOptionId: null })).toBeNull();
  });

  it("rejects over-long open answers", () => {
    expect(codeOf(() => validateAnswerShape(open, { answerText: "x".repeat(20_001) }))).toBe("INVALID_ANSWER");
  });
});

describe("gradeAttempt", () => {
  const questions: GradableQuestion[] = [
    { id: "q1", type: "MULTIPLE_CHOICE", points: 5, options: [{ id: "q1a", isCorrect: false }, { id: "q1b", isCorrect: true }] },
    { id: "q2", type: "TRUE_FALSE", points: 5, options: [{ id: "q2t", isCorrect: true }, { id: "q2f", isCorrect: false }] },
    { id: "q3", type: "OPEN", points: 10, options: [] },
  ];

  it("grades an objective-only attempt immediately", () => {
    const objectiveOnly = questions.slice(0, 2);
    const r = gradeAttempt(objectiveOnly, [
      { questionId: "q1", selectedOptionId: "q1b", answerText: null },
      { questionId: "q2", selectedOptionId: "q2f", answerText: null },
    ]);
    expect(r.status).toBe("GRADED");
    expect(r.totalScore).toBe(5);
    expect(r.maxScore).toBe(10);
  });

  it("holds the total back while an open answer awaits grading", () => {
    const r = gradeAttempt(questions, [
      { questionId: "q1", selectedOptionId: "q1b", answerText: null },
      { questionId: "q3", selectedOptionId: null, answerText: "essay" },
    ]);
    expect(r.status).toBe("SUBMITTED");
    expect(r.totalScore).toBeNull();
    expect(r.pendingManual).toBe(1);
    expect(r.rows.find((x) => x.questionId === "q3")?.score).toBeNull();
  });

  it("scores unanswered questions as zero, including blank open answers", () => {
    const r = gradeAttempt(questions, []);
    expect(r.rows).toHaveLength(3);
    expect(r.rows.every((x) => x.score === 0)).toBe(true);
    expect(r.status).toBe("GRADED");
    expect(r.totalScore).toBe(0);
  });

  it("treats an option from another question as unanswered", () => {
    const r = gradeAttempt(questions.slice(0, 1), [{ questionId: "q1", selectedOptionId: "q2t", answerText: null }]);
    expect(r.rows[0]).toMatchObject({ selectedOptionId: null, isCorrect: false, score: 0 });
  });
});

describe("summarizeScores", () => {
  it("counts pending separately from the total", () => {
    expect(summarizeScores([5, null, 2.5])).toEqual({ total: 7.5, pending: 1 });
  });
});


describe("time limit per attempt", () => {
  const start = new Date("2026-10-03T10:00:00Z");
  const at = (minutes: number, seconds = 0) => new Date(start.getTime() + minutes * 60_000 + seconds * 1000);

  it("sets the end from the start and the limit, or none", () => {
    expect(attemptExpiresAt(start, 30)?.toISOString()).toBe("2026-10-03T10:30:00.000Z");
    expect(attemptExpiresAt(start, null)).toBeNull();
    expect(attemptExpiresAt(start, 0)).toBeNull();
  });

  it("ends at the earlier of the attempt's limit and the exam deadline", () => {
    expect(attemptEndsAt(at(30), at(120))).toEqual(at(30)); // limit first
    expect(attemptEndsAt(at(30), at(10))).toEqual(at(10)); // exam closes first
    expect(attemptEndsAt(at(30), null)).toEqual(at(30));
    expect(attemptEndsAt(null, at(10))).toEqual(at(10));
    expect(attemptEndsAt(null, null)).toBeNull();
  });

  it("allows a grace period after the end, then closes", () => {
    expect(isAttemptOver({ now: at(30, 14), end: at(30) })).toBe(false);
    expect(isAttemptOver({ now: new Date(at(30).getTime() + ATTEMPT_GRACE_MS), end: at(30) })).toBe(false);
    expect(isAttemptOver({ now: at(30, 16), end: at(30) })).toBe(true);
    expect(isAttemptOver({ now: at(999), end: null })).toBe(false);
  });

  it("checkAttemptWritable throws EXAM_CLOSED only past end + grace", () => {
    expect(() => checkAttemptWritable({ now: at(29), expiresAt: at(30), effectiveDueAt: null })).not.toThrow();
    expect(() => checkAttemptWritable({ now: at(30, 10), expiresAt: at(30), effectiveDueAt: null })).not.toThrow();
    expect(() => checkAttemptWritable({ now: at(30, 20), expiresAt: at(30), effectiveDueAt: null })).toThrow(/EXAM_CLOSED/);
    // the exam deadline cuts a longer attempt short
    expect(() => checkAttemptWritable({ now: at(11), expiresAt: at(30), effectiveDueAt: at(10) })).toThrow(/EXAM_CLOSED/);
    expect(() => checkAttemptWritable({ now: at(5000), expiresAt: null, effectiveDueAt: null })).not.toThrow();
  });

  it("counts whole seconds left, never below zero", () => {
    expect(secondsLeft(at(30), at(0))).toBe(1800);
    expect(secondsLeft(at(30), at(29, 59.5))).toBe(1);
    expect(secondsLeft(at(30), at(31))).toBe(0);
    expect(secondsLeft(null, at(0))).toBeNull();
  });
});
