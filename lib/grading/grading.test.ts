import { describe, it, expect } from "vitest";
import {
  GradingError,
  computeFinalScore,
  effectiveDueAt,
  getSubmissionWindow,
  gradeObjective,
  isLateAt,
  normalizePenalty,
  shouldRevealAnswers,
  validateScore,
} from "./grading";

const d = (s: string) => new Date(`2026-10-${s}:00Z`);
const DUE = d("10T12:00");

const win = (over: Partial<Parameters<typeof getSubmissionWindow>[0]> = {}) =>
  getSubmissionWindow({
    now: d("10T11:00"),
    dueAt: DUE,
    lateCutoffAt: null,
    extensionDueAt: null,
    allowLate: true,
    ...over,
  });

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof GradingError ? e.code : "OTHER";
  }
  return null;
};

describe("effectiveDueAt", () => {
  it("takes the later of due date and extension", () => {
    expect(effectiveDueAt(DUE, d("12T12:00"))).toEqual(d("12T12:00"));
    expect(effectiveDueAt(DUE, d("09T12:00"))).toEqual(DUE); // extensions never shorten
    expect(effectiveDueAt(null, null)).toBeNull();
  });
});

describe("getSubmissionWindow", () => {
  it("is on time before the deadline and exactly at it", () => {
    expect(win().isLate).toBe(false);
    expect(win({ now: DUE }).isLate).toBe(false);
  });

  it("has no deadline when dueAt is null", () => {
    expect(win({ dueAt: null, now: d("30T00:00") }).isLate).toBe(false);
  });

  it("marks late submissions as late when allowed", () => {
    expect(win({ now: d("11T12:00") }).isLate).toBe(true);
  });

  it("rejects late submissions when not allowed", () => {
    expect(codeOf(() => win({ now: d("11T12:00"), allowLate: false }))).toBe(
      "DEADLINE_PASSED",
    );
  });

  it("rejects submissions after the late cutoff", () => {
    expect(
      codeOf(() => win({ now: d("15T12:00"), lateCutoffAt: d("14T12:00") })),
    ).toBe("SUBMISSIONS_CLOSED");
    expect(
      win({ now: d("13T12:00"), lateCutoffAt: d("14T12:00") }).isLate,
    ).toBe(true);
  });

  it("an extension makes a would-be-late submission on time", () => {
    const r = win({ now: d("11T12:00"), extensionDueAt: d("12T12:00") });
    expect(r.isLate).toBe(false);
    expect(r.effectiveDueAt).toEqual(d("12T12:00"));
  });

  it("an extension also pushes the cutoff out", () => {
    const r = win({
      now: d("20T12:00"),
      lateCutoffAt: d("14T12:00"),
      extensionDueAt: d("25T12:00"),
    });
    expect(r.isLate).toBe(false);
  });
});

describe("isLateAt", () => {
  it("compares submission time with the effective due date", () => {
    expect(isLateAt(d("11T00:00"), DUE)).toBe(true);
    expect(isLateAt(d("10T00:00"), DUE)).toBe(false);
    expect(isLateAt(d("11T00:00"), null)).toBe(false);
  });
});

describe("computeFinalScore", () => {
  const late = { isLate: true, excuseGranted: false };

  it("applies a percentage penalty to the raw score", () => {
    expect(
      computeFinalScore({
        rawScore: 8,
        ...late,
        penaltyType: "PERCENT",
        penaltyValue: 25,
      }),
    ).toBe(6);
  });

  it("applies a points penalty", () => {
    expect(
      computeFinalScore({
        rawScore: 8,
        ...late,
        penaltyType: "POINTS",
        penaltyValue: 1.5,
      }),
    ).toBe(6.5);
  });

  it("never goes below zero", () => {
    expect(
      computeFinalScore({
        rawScore: 2,
        ...late,
        penaltyType: "POINTS",
        penaltyValue: 5,
      }),
    ).toBe(0);
  });

  it("does not penalize on-time submissions", () => {
    expect(
      computeFinalScore({
        rawScore: 8,
        isLate: false,
        excuseGranted: false,
        penaltyType: "PERCENT",
        penaltyValue: 50,
      }),
    ).toBe(8);
  });

  it("does not penalize excused late submissions", () => {
    expect(
      computeFinalScore({
        rawScore: 8,
        isLate: true,
        excuseGranted: true,
        penaltyType: "PERCENT",
        penaltyValue: 50,
      }),
    ).toBe(8);
  });

  it("rounds to 2 decimals", () => {
    expect(
      computeFinalScore({
        rawScore: 7,
        ...late,
        penaltyType: "PERCENT",
        penaltyValue: 33.33,
      }),
    ).toBe(4.67);
  });
});

describe("validateScore / normalizePenalty", () => {
  it("accepts scores within range and rounds them", () => {
    expect(validateScore(7.456, 10)).toBe(7.46);
    expect(validateScore(0, 10)).toBe(0);
    expect(validateScore(10, 10)).toBe(10);
  });

  it("rejects out-of-range, negative and non-finite scores", () => {
    expect(codeOf(() => validateScore(10.5, 10))).toBe("SCORE_OUT_OF_RANGE");
    expect(codeOf(() => validateScore(-1, 10))).toBe("SCORE_OUT_OF_RANGE");
    expect(codeOf(() => validateScore(NaN, 10))).toBe("SCORE_OUT_OF_RANGE");
  });

  it("normalizes and validates penalties", () => {
    expect(normalizePenalty("NONE", 40)).toEqual({ type: "NONE", value: 0 });
    expect(normalizePenalty("PERCENT", 20)).toEqual({
      type: "PERCENT",
      value: 20,
    });
    expect(codeOf(() => normalizePenalty("PERCENT", 120))).toBe(
      "INVALID_PENALTY",
    );
    expect(codeOf(() => normalizePenalty("POINTS", -1))).toBe(
      "INVALID_PENALTY",
    );
  });
});

describe("gradeObjective", () => {
  const options = [
    { id: "a", isCorrect: false },
    { id: "b", isCorrect: true },
  ];
  it("gives full points for the correct option and zero otherwise", () => {
    expect(gradeObjective(options, "b", 5)).toEqual({
      isCorrect: true,
      rawScore: 5,
    });
    expect(gradeObjective(options, "a", 5)).toEqual({
      isCorrect: false,
      rawScore: 0,
    });
  });
  it("rejects an option from another question", () => {
    expect(codeOf(() => gradeObjective(options, "zzz", 5))).toBe(
      "INVALID_ANSWER",
    );
  });
});

describe("shouldRevealAnswers", () => {
  const base = { effectiveDueAt: DUE, now: d("11T00:00") };

  it("never reveals before the grade is released", () => {
    expect(
      shouldRevealAnswers({
        ...base,
        mode: "AFTER_GRADE",
        gradeReleased: false,
      }),
    ).toBe(false);
  });
  it("AFTER_GRADE reveals as soon as released", () => {
    expect(
      shouldRevealAnswers({
        ...base,
        now: d("01T00:00"),
        mode: "AFTER_GRADE",
        gradeReleased: true,
      }),
    ).toBe(true);
  });
  it("AFTER_GRADE_AND_DEADLINE waits for the student's own deadline", () => {
    const m = "AFTER_GRADE_AND_DEADLINE" as const;
    expect(
      shouldRevealAnswers({
        ...base,
        now: d("09T00:00"),
        mode: m,
        gradeReleased: true,
      }),
    ).toBe(false);
    expect(shouldRevealAnswers({ ...base, mode: m, gradeReleased: true })).toBe(
      true,
    );
    // an extension moves the deadline, so the answers stay hidden for that student
    expect(
      shouldRevealAnswers({
        mode: m,
        gradeReleased: true,
        effectiveDueAt: d("20T00:00"),
        now: d("11T00:00"),
      }),
    ).toBe(false);
  });
  it("NEVER never reveals", () => {
    expect(
      shouldRevealAnswers({ ...base, mode: "NEVER", gradeReleased: true }),
    ).toBe(false);
  });
});
