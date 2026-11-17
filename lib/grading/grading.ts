// lib/grading/grading.ts
//
// Pure grading rules for lecture-question submissions: no database, no Date.now().
//
// Rules encoded here:
//  - A deadline extension replaces the student's due date (it can only move it later).
//  - Past the effective due date a submission is LATE. Late submissions are accepted only if
//    allowed for the question/course, and only until the late cutoff (if one is set).
//  - Penalty (type + value) is chosen by the grader. PERCENT is a percentage of the raw score
//    earned; POINTS is a fixed deduction. The result is clamped to [0, rawScore].
//  - The penalty applies only if the submission is late AND no excuse was granted.
//  - Objective questions (MC / true-false) are auto-graded: full points or 0.
//  - Correct answers are revealed according to CourseSettings.answerRevealMode.

export type PenaltyType = "NONE" | "PERCENT" | "POINTS";
export type AnswerRevealMode = "AFTER_GRADE_AND_DEADLINE" | "AFTER_GRADE" | "NEVER";

export type GradingErrorCode =
  | "NOT_FOUND"
  | "QUESTION_NOT_AVAILABLE"
  | "COURSE_FEATURE_DISABLED"
  | "NOT_ENROLLED"
  | "INVALID_ANSWER"
  | "ALREADY_SUBMITTED"
  | "ALREADY_GRADED"
  | "DEADLINE_PASSED"
  | "SUBMISSIONS_CLOSED"
  | "SCORE_OUT_OF_RANGE"
  | "INVALID_PENALTY"
  | "INVALID_DATE"
  | "EXCUSE_REASON_REQUIRED"
  // exams
  | "EXAM_NOT_AVAILABLE"
  | "EXAM_NOT_OPEN"
  | "EXAM_CLOSED"
  | "NO_ATTEMPTS_LEFT"
  | "ATTEMPT_NOT_IN_PROGRESS"
  | "ATTEMPT_CONFLICT"
  | "INVALID_ATTEMPT_GRANT"
  // enrollment
  | "ENROLLMENT_CLOSED"
  // staff management
  | "INVALID_SLUG"
  | "SLUG_TAKEN"
  | "SLUG_LOCKED"
  | "LECTURE_NUMBER_TAKEN"
  | "INVALID_URL"
  | "COURSE_NOT_READY"
  | "INVALID_STATUS_TRANSITION"
  | "INVALID_ATTENDANCE"
  | "INVALID_SETTINGS"
  // authoring
  | "INVALID_QUESTION"
  | "QUESTION_LOCKED"
  | "EXAM_EXISTS"
  | "EXAM_NOT_READY"
  | "EXAM_HAS_ATTEMPTS"
  // uploads
  | "INVALID_UPLOAD";

/** Route handlers can map `code` to an HTTP status and a localized message. */
export class GradingError extends Error {
  constructor(
    public readonly code: GradingErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    this.name = "GradingError";
  }
}

export const MAX_ANSWER_LENGTH = 20_000;
const EPS = 1e-9;
export const round2 = (n: number) => Math.round(n * 100) / 100;

const laterOf = (a: Date | null, b: Date | null): Date | null =>
  a && b ? (a.getTime() >= b.getTime() ? a : b) : (a ?? b);

// ---------------------------------------------------------------------------
// Deadlines
// ---------------------------------------------------------------------------

/** The student's effective due date: the later of the question deadline and their extension. */
export function effectiveDueAt(dueAt: Date | null, extensionDueAt: Date | null): Date | null {
  return laterOf(dueAt, extensionDueAt);
}

export interface SubmissionWindow {
  isLate: boolean;
  effectiveDueAt: Date | null;
}

/** Throws DEADLINE_PASSED or SUBMISSIONS_CLOSED when the student may not submit at `now`. */
export function getSubmissionWindow(args: {
  now: Date;
  dueAt: Date | null;
  lateCutoffAt: Date | null;
  extensionDueAt: Date | null;
  allowLate: boolean;
}): SubmissionWindow {
  const { now, dueAt, lateCutoffAt, extensionDueAt, allowLate } = args;
  const due = effectiveDueAt(dueAt, extensionDueAt);
  if (!due || now.getTime() <= due.getTime()) return { isLate: false, effectiveDueAt: due };

  if (!allowLate) throw new GradingError("DEADLINE_PASSED");
  // An extension also pushes the cutoff out so it can never fall before the student's due date
  const cutoff = lateCutoffAt ? laterOf(lateCutoffAt, extensionDueAt) : null;
  if (cutoff && now.getTime() > cutoff.getTime()) throw new GradingError("SUBMISSIONS_CLOSED");
  return { isLate: true, effectiveDueAt: due };
}

export function isLateAt(submittedAt: Date, due: Date | null): boolean {
  return due != null && submittedAt.getTime() > due.getTime();
}

// ---------------------------------------------------------------------------
// Scores and penalties
// ---------------------------------------------------------------------------

/** 0 <= score <= max, rounded to 2 decimals. */
export function validateScore(score: number, maxPoints: number): number {
  if (!Number.isFinite(score) || score < 0 || score > maxPoints + EPS) {
    throw new GradingError("SCORE_OUT_OF_RANGE", `Score must be between 0 and ${maxPoints}`);
  }
  return Math.min(round2(score), maxPoints);
}

export function normalizePenalty(
  type: PenaltyType,
  value: number,
): { type: PenaltyType; value: number } {
  if (type === "NONE") return { type, value: 0 };
  if (!Number.isFinite(value) || value < 0 || (type === "PERCENT" && value > 100)) {
    throw new GradingError("INVALID_PENALTY");
  }
  return { type, value: round2(value) };
}

export function computeFinalScore(args: {
  rawScore: number;
  isLate: boolean;
  excuseGranted: boolean;
  penaltyType: PenaltyType;
  penaltyValue: number;
}): number {
  const { rawScore, isLate, excuseGranted, penaltyType, penaltyValue } = args;
  if (!isLate || excuseGranted || penaltyType === "NONE") return round2(rawScore);
  const deduction = penaltyType === "PERCENT" ? (rawScore * penaltyValue) / 100 : penaltyValue;
  return round2(Math.min(rawScore, Math.max(0, rawScore - deduction)));
}

/** Auto-grade a multiple-choice / true-false answer: full points or zero. */
export function gradeObjective(
  options: { id: string; isCorrect: boolean }[],
  selectedOptionId: string,
  points: number,
): { isCorrect: boolean; rawScore: number } {
  const chosen = options.find((o) => o.id === selectedOptionId);
  if (!chosen) throw new GradingError("INVALID_ANSWER", "Option does not belong to this question");
  return { isCorrect: chosen.isCorrect, rawScore: chosen.isCorrect ? round2(points) : 0 };
}

// ---------------------------------------------------------------------------
// Answer visibility
// ---------------------------------------------------------------------------

/**
 * May this student see the correct answers / explanation?
 * AFTER_GRADE_AND_DEADLINE needs the grade released AND the student's own (extended)
 * deadline passed, so answers can't leak to classmates still working on it.
 */
export function shouldRevealAnswers(args: {
  mode: AnswerRevealMode;
  gradeReleased: boolean;
  effectiveDueAt: Date | null;
  now: Date;
}): boolean {
  const { mode, gradeReleased, effectiveDueAt: due, now } = args;
  if (mode === "NEVER" || !gradeReleased) return false;
  if (mode === "AFTER_GRADE") return true;
  return due == null || now.getTime() > due.getTime();
}
