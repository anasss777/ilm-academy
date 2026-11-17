import { describe, it, expect } from "vitest";
import {
  requiredCount,
  computeAttendance,
  computeQuestionScore,
  computeExam,
  evaluateEligibility,
  reconcileReview,
  decideReview,
  canExport,
  type AttendanceStatus,
  type ReviewState,
} from "./eligibility";

const lec = (...groups: [AttendanceStatus | null, number][]) =>
  groups.flatMap(([status, n]) =>
    Array.from({ length: n }, () => ({ status })),
  );

describe("requiredCount", () => {
  it("80% of 20 = 16", () => expect(requiredCount(80, 20)).toBe(16));
  it("rounds up fractional requirements", () =>
    expect(requiredCount(82.5, 20)).toBe(17));
  it("is not fooled by floating-point noise", () => {
    expect(requiredCount(70, 10)).toBe(7);
    expect(requiredCount(35, 20)).toBe(7);
  });
  it("0 total needs 0", () => expect(requiredCount(80, 0)).toBe(0));
});

describe("computeAttendance", () => {
  it("meets exactly 80% of 20 lectures", () => {
    const r = computeAttendance({
      lectures: lec(["PRESENT", 16], ["ABSENT", 4]),
      partialWeight: 1,
      minPercent: 80,
    });
    expect(r.requiredLectures).toBe(16);
    expect(r.percent).toBe(80);
    expect(r.state).toBe("MET");
  });

  it("fails with 15 of 20", () => {
    const r = computeAttendance({
      lectures: lec(["PRESENT", 15], ["ABSENT", 5]),
      partialWeight: 1,
      minPercent: 80,
    });
    expect(r.state).toBe("NOT_MET");
  });

  it("removes excused lectures from the denominator", () => {
    // 20 held, 2 excused -> 18 counted -> ceil(0.8 * 18) = 15 required
    const r = computeAttendance({
      lectures: lec(["PRESENT", 15], ["ABSENT", 3], ["EXCUSED", 2]),
      partialWeight: 1,
      minPercent: 80,
    });
    expect(r.countedLectures).toBe(18);
    expect(r.requiredLectures).toBe(15);
    expect(r.state).toBe("MET");
  });

  it("applies the partial weight", () => {
    const r = computeAttendance({
      lectures: lec(["PRESENT", 6], ["PARTIAL", 4]),
      partialWeight: 0.5,
      minPercent: 80,
    });
    expect(r.attended).toBe(8);
    expect(r.state).toBe("MET");
  });

  it("treats a missing record as absent", () => {
    const r = computeAttendance({
      lectures: lec([null, 4], ["PRESENT", 1]),
      partialWeight: 1,
      minPercent: 20,
    });
    expect(r.attended).toBe(1);
    expect(r.state).toBe("MET");
  });

  it("is NOT_MET when every lecture is excused or none are held", () => {
    expect(
      computeAttendance({
        lectures: lec(["EXCUSED", 3]),
        partialWeight: 1,
        minPercent: 80,
      }).state,
    ).toBe("NOT_MET");
    expect(
      computeAttendance({ lectures: [], partialWeight: 1, minPercent: 80 })
        .state,
    ).toBe("NOT_MET");
  });

  it("is DISABLED without a threshold", () => {
    expect(
      computeAttendance({
        lectures: lec(["PRESENT", 1]),
        partialWeight: 1,
        minPercent: null,
      }).state,
    ).toBe("DISABLED");
  });
});

describe("computeQuestionScore", () => {
  it("scores unsubmitted as 0 and ignores excused questions", () => {
    const r = computeQuestionScore({
      minPercent: 40,
      questions: [
        { points: 10, excused: false, submission: { finalScore: 8 } },
        { points: 10, excused: false, submission: null },
        { points: 10, excused: true, submission: null },
      ],
    });
    expect(r.pointsAvailable).toBe(20);
    expect(r.pointsEarned).toBe(8);
    expect(r.percent).toBe(40);
    expect(r.state).toBe("MET");
  });

  it("is MET when current score already passes, even with grading pending", () => {
    const r = computeQuestionScore({
      minPercent: 50,
      questions: [
        { points: 10, excused: false, submission: { finalScore: 10 } },
        { points: 10, excused: false, submission: { finalScore: null } },
      ],
    });
    expect(r.state).toBe("MET");
  });

  it("is PENDING when only the best case passes", () => {
    const r = computeQuestionScore({
      minPercent: 80,
      questions: [
        { points: 10, excused: false, submission: { finalScore: 10 } },
        { points: 10, excused: false, submission: { finalScore: null } },
      ],
    });
    expect(r.state).toBe("PENDING");
  });

  it("is NOT_MET when even the best case fails", () => {
    const r = computeQuestionScore({
      minPercent: 80,
      questions: [
        { points: 10, excused: false, submission: { finalScore: 2 } },
        { points: 10, excused: false, submission: { finalScore: null } },
      ],
    });
    expect(r.state).toBe("NOT_MET");
  });
});

describe("computeExam", () => {
  it("uses the best graded attempt", () => {
    const r = computeExam({
      minPercent: 60,
      exam: {
        maxScore: 100,
        attempts: [
          { status: "GRADED", totalScore: 40 },
          { status: "GRADED", totalScore: 75 },
        ],
      },
    });
    expect(r.percent).toBe(75);
    expect(r.state).toBe("MET");
  });

  it("is PENDING when a submitted attempt awaits grading", () => {
    const r = computeExam({
      minPercent: 60,
      exam: {
        maxScore: 100,
        attempts: [{ status: "SUBMITTED", totalScore: null }],
      },
    });
    expect(r.state).toBe("PENDING");
  });

  it("is NOT_MET with no attempts, or with no exam at all", () => {
    expect(
      computeExam({ minPercent: 60, exam: { maxScore: 100, attempts: [] } })
        .state,
    ).toBe("NOT_MET");
    expect(computeExam({ minPercent: 60, exam: null }).state).toBe("NOT_MET");
  });
});

describe("evaluateEligibility", () => {
  const base = {
    partialWeight: 1,
    lectures: lec(["PRESENT", 9], ["ABSENT", 1]),
    questions: [{ points: 10, excused: false, submission: { finalScore: 9 } }],
    exam: {
      maxScore: 100,
      attempts: [{ status: "GRADED" as const, totalScore: 74 }],
    },
  };
  const req = {
    minAttendancePercent: 80,
    minQuestionScorePercent: 70,
    minExamPercent: 60,
  };

  it("ELIGIBLE when all enabled requirements are met", () => {
    expect(evaluateEligibility({ ...base, requirement: req }).status).toBe(
      "ELIGIBLE",
    );
  });

  it("NOT_ELIGIBLE with a reason when attendance fails", () => {
    const r = evaluateEligibility({
      ...base,
      lectures: lec(["PRESENT", 7], ["ABSENT", 3]),
      requirement: req,
    });
    expect(r.status).toBe("NOT_ELIGIBLE");
    expect(r.reasons).toContain("ATTENDANCE_NOT_MET");
  });

  it("PENDING when nothing failed but grading is outstanding", () => {
    const r = evaluateEligibility({
      ...base,
      exam: {
        maxScore: 100,
        attempts: [{ status: "SUBMITTED", totalScore: null }],
      },
      requirement: req,
    });
    expect(r.status).toBe("PENDING");
    expect(r.reasons).toContain("EXAM_PENDING_GRADING");
  });

  it("ignores disabled requirements", () => {
    const r = evaluateEligibility({
      ...base,
      exam: null,
      requirement: { ...req, minExamPercent: null },
    });
    expect(r.status).toBe("ELIGIBLE");
  });

  it("never makes everyone eligible when no thresholds are configured", () => {
    const r = evaluateEligibility({
      ...base,
      requirement: {
        minAttendancePercent: null,
        minQuestionScorePercent: null,
        minExamPercent: null,
      },
    });
    expect(r.status).toBe("NOT_ELIGIBLE");
    expect(r.reasons).toContain("NO_REQUIREMENTS_CONFIGURED");
  });
});

describe("certificate review state machine", () => {
  const undecided: ReviewState = {
    status: "PENDING",
    requirementVersion: null,
    needsReReview: false,
    overrideReason: null,
  };
  const approved: ReviewState = {
    status: "APPROVED",
    requirementVersion: 1,
    needsReReview: false,
    overrideReason: null,
  };

  it("undecided rows follow the auto result", () => {
    expect(reconcileReview(undecided, "ELIGIBLE", 1).status).toBe(
      "AUTO_ELIGIBLE",
    );
    expect(reconcileReview(undecided, "NOT_ELIGIBLE", 1).status).toBe(
      "AUTO_INELIGIBLE",
    );
    expect(reconcileReview(undecided, "PENDING", 1).status).toBe("PENDING");
  });

  it("keeps an approval untouched when nothing changed", () => {
    const r = reconcileReview(approved, "ELIGIBLE", 1);
    expect(r.status).toBe("APPROVED");
    expect(r.needsReReview).toBe(false);
  });

  it("flags an approval for re-review when requirements change", () => {
    const r = reconcileReview(approved, "ELIGIBLE", 2);
    expect(r.status).toBe("APPROVED");
    expect(r.needsReReview).toBe(true);
  });

  it("flags an approval when the student is no longer eligible", () => {
    expect(reconcileReview(approved, "NOT_ELIGIBLE", 1).needsReReview).toBe(
      true,
    );
  });

  it("does not flag an explicit override just because auto disagrees", () => {
    const overridden = { ...approved, overrideReason: "Medical leave" };
    expect(reconcileReview(overridden, "NOT_ELIGIBLE", 1).needsReReview).toBe(
      false,
    );
  });

  it("requires a reason to contradict the auto result", () => {
    expect(() =>
      decideReview({
        auto: "NOT_ELIGIBLE",
        decision: "APPROVED",
        currentVersion: 1,
      }),
    ).toThrow("OVERRIDE_REASON_REQUIRED");
    expect(
      decideReview({
        auto: "NOT_ELIGIBLE",
        decision: "APPROVED",
        currentVersion: 1,
        reason: "Excused absences",
      }).overrideReason,
    ).toBe("Excused absences");
  });

  it("needs no reason when the decision matches the auto result", () => {
    const r = decideReview({
      auto: "ELIGIBLE",
      decision: "APPROVED",
      currentVersion: 3,
    });
    expect(r).toMatchObject({
      status: "APPROVED",
      requirementVersion: 3,
      overrideReason: null,
    });
  });

  it("exports only approved, current, consenting candidates", () => {
    expect(canExport(approved, true)).toBe(true);
    expect(canExport(approved, false)).toBe(false);
    expect(canExport({ ...approved, needsReReview: true }, true)).toBe(false);
    expect(canExport({ ...approved, status: "REJECTED" }, true)).toBe(false);
  });
});
