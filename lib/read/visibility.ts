// lib/read/visibility.ts
// Pure rules for what a student is allowed to see. No database, no Date.now().
//
//  - Recordings and materials follow their own `visibility` (PUBLIC / SIGNED_IN / ENROLLED).
//  - Zoom details go to ACTIVE students only, and only until shortly after the lecture ends.
//  - Correct answers follow the course's reveal mode (see shouldRevealAnswers). For exams there
//    is one extra rule: never while the student can still take (or finish) an attempt.

import {
  GradingError,
  getSubmissionWindow,
  shouldRevealAnswers,
  type AnswerRevealMode,
} from "../grading/grading";

export type Visibility = "PUBLIC" | "SIGNED_IN" | "ENROLLED";

export function canSeeByVisibility(
  visibility: Visibility,
  viewer: { signedIn: boolean; enrolled: boolean },
): boolean {
  if (visibility === "PUBLIC") return true;
  if (visibility === "SIGNED_IN") return viewer.signedIn;
  return viewer.enrolled;
}

// ---------------------------------------------------------------------------
// Lectures
// ---------------------------------------------------------------------------

export type LectureState = "UPCOMING" | "LIVE" | "ENDED";

export function lectureState(now: Date, startsAt: Date, endsAt: Date): LectureState {
  if (now.getTime() < startsAt.getTime()) return "UPCOMING";
  if (now.getTime() <= endsAt.getTime()) return "LIVE";
  return "ENDED";
}

/** Lectures that overrun still need the link, so it stays visible for a while after the end. */
export const ZOOM_GRACE_MINUTES = 60;

export function canSeeZoom(args: { enrolled: boolean; now: Date; endsAt: Date }): boolean {
  return args.enrolled && args.now.getTime() <= args.endsAt.getTime() + ZOOM_GRACE_MINUTES * 60_000;
}

// ---------------------------------------------------------------------------
// Lecture questions
// ---------------------------------------------------------------------------

export interface QuestionSubmissionState {
  canSubmit: boolean;
  isLate: boolean;
  reason: "DEADLINE_PASSED" | "SUBMISSIONS_CLOSED" | "ALREADY_GRADED" | null;
}

/** Mirrors the checks in submitAnswer, so the UI can show the right state before the attempt. */
export function questionSubmissionState(args: {
  now: Date;
  dueAt: Date | null;
  lateCutoffAt: Date | null;
  extensionDueAt: Date | null;
  allowLate: boolean;
  existing: { gradedAt: Date | null } | null;
}): QuestionSubmissionState {
  const { now, dueAt, lateCutoffAt, extensionDueAt, allowLate, existing } = args;

  let isLate: boolean;
  try {
    isLate = getSubmissionWindow({ now, dueAt, lateCutoffAt, extensionDueAt, allowLate }).isLate;
  } catch (e) {
    if (e instanceof GradingError && (e.code === "DEADLINE_PASSED" || e.code === "SUBMISSIONS_CLOSED")) {
      return { canSubmit: false, isLate: true, reason: e.code };
    }
    throw e;
  }
  if (existing?.gradedAt) return { canSubmit: false, isLate, reason: "ALREADY_GRADED" };
  if (existing && isLate) return { canSubmit: false, isLate, reason: "DEADLINE_PASSED" };
  return { canSubmit: true, isLate, reason: null };
}

// ---------------------------------------------------------------------------
// Exams
// ---------------------------------------------------------------------------

export type ExamState = "NOT_OPEN" | "OPEN" | "CLOSED";

export function examAvailability(args: {
  now: Date;
  opensAt: Date | null;
  effectiveDueAt: Date | null;
  attemptsUsed: number;
  allowed: number;
  hasInProgress: boolean;
}): { state: ExamState; canStart: boolean; canStillAttempt: boolean } {
  const { now, opensAt, effectiveDueAt, attemptsUsed, allowed, hasInProgress } = args;

  let state: ExamState = "OPEN";
  if (opensAt && now.getTime() < opensAt.getTime()) state = "NOT_OPEN";
  else if (effectiveDueAt && now.getTime() > effectiveDueAt.getTime()) state = "CLOSED";

  const hasAttemptsLeft = hasInProgress || attemptsUsed < allowed;
  return {
    state,
    canStart: state === "OPEN" && hasAttemptsLeft,
    // true while the student might still sit the exam (including before it opens)
    canStillAttempt: state !== "CLOSED" && hasAttemptsLeft,
  };
}

/**
 * Exam answer keys are revealed only when the student can no longer attempt the exam,
 * on top of the course's reveal mode. Otherwise a released result would hand out the key
 * to someone about to retake it.
 */
export function shouldRevealExamKeys(args: {
  mode: AnswerRevealMode;
  gradeReleased: boolean;
  effectiveDueAt: Date | null;
  now: Date;
  canStillAttempt: boolean;
}): boolean {
  const { canStillAttempt, ...rest } = args;
  return !canStillAttempt && shouldRevealAnswers(rest);
}
