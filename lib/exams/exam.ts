// lib/exams/exam.ts
//
// Pure exam rules: no database, no Date.now().
//
// Rules encoded here:
//  - Allowed attempts = exam.attemptLimit + SUM(extraAttempts) over the student's reopen grants.
//  - A student's effective deadline = the later of exam.dueAt and their grants' newDueAt.
//    If the exam has no deadline, grants never create one.
//  - Objective answers (MC / true-false) are auto-graded: full points or zero.
//  - An open answer with text waits for manual grading. A blank open answer scores 0 at once.
//  - Unanswered questions score 0. Every question gets an answer row at submission.
//  - An attempt is GRADED (and has a total) only when no answer awaits manual grading;
//    otherwise it is SUBMITTED with no total, so a partial result is never shown as final.

import { GradingError, MAX_ANSWER_LENGTH, gradeObjective, round2 } from "../grading/grading";

export type ExamQuestionType = "MULTIPLE_CHOICE" | "TRUE_FALSE" | "OPEN";

// ---------------------------------------------------------------------------
// Attempts and deadlines
// ---------------------------------------------------------------------------

export function allowedAttempts(attemptLimit: number, grants: { extraAttempts: number }[]): number {
  return attemptLimit + grants.reduce((sum, g) => sum + g.extraAttempts, 0);
}

export function effectiveExamDueAt(
  dueAt: Date | null,
  grants: { newDueAt: Date | null }[],
): Date | null {
  if (dueAt == null) return null;
  let due = dueAt;
  for (const g of grants) {
    if (g.newDueAt && g.newDueAt.getTime() > due.getTime()) due = g.newDueAt;
  }
  return due;
}

/** Throws EXAM_NOT_OPEN before the exam opens and EXAM_CLOSED after the student's deadline. */
export function checkExamWindow(args: {
  now: Date;
  opensAt: Date | null;
  effectiveDueAt: Date | null;
}): void {
  const { now, opensAt, effectiveDueAt } = args;
  if (opensAt && now.getTime() < opensAt.getTime()) throw new GradingError("EXAM_NOT_OPEN");
  if (effectiveDueAt && now.getTime() > effectiveDueAt.getTime()) throw new GradingError("EXAM_CLOSED");
}

export function assertCanStartAttempt(attemptsUsed: number, allowed: number): void {
  if (attemptsUsed >= allowed) throw new GradingError("NO_ATTEMPTS_LEFT");
}

// ---------------------------------------------------------------------------
// Time limit per attempt
// ---------------------------------------------------------------------------
//
// An exam may have a time limit per attempt (durationMinutes). The clock starts when the student
// starts the attempt, and the end is stored on the attempt (expiresAt) at that moment, so a later
// change of the limit never affects attempts already running.
//
// An attempt ends at the EARLIER of its own limit and the student's exam deadline (someone who
// starts ten minutes before the exam closes gets ten minutes).
//
// The server accepts writes for a short grace period after the end: a final autosave or submit
// that left the browser in time must not be lost to network delay or a slightly wrong clock.

export const ATTEMPT_GRACE_MS = 15_000;

/** When an attempt started now must end because of its own limit (null = no per-attempt limit). */
export function attemptExpiresAt(startedAt: Date, durationMinutes: number | null | undefined): Date | null {
  if (durationMinutes == null || !(durationMinutes > 0)) return null;
  return new Date(startedAt.getTime() + durationMinutes * 60_000);
}

/** The moment an attempt ends: the earlier of its own limit and the student's exam deadline. */
export function attemptEndsAt(expiresAt: Date | null, effectiveDueAt: Date | null): Date | null {
  if (expiresAt && effectiveDueAt) {
    return expiresAt.getTime() <= effectiveDueAt.getTime() ? expiresAt : effectiveDueAt;
  }
  return expiresAt ?? effectiveDueAt;
}

/** True once the attempt is past its end plus the grace period (nothing more may be written). */
export function isAttemptOver(args: { now: Date; end: Date | null; graceMs?: number }): boolean {
  if (!args.end) return false;
  return args.now.getTime() > args.end.getTime() + (args.graceMs ?? ATTEMPT_GRACE_MS);
}

/** Throws EXAM_CLOSED when the attempt is past its end plus grace. Used for saving and submitting. */
export function checkAttemptWritable(args: {
  now: Date;
  expiresAt: Date | null;
  effectiveDueAt: Date | null;
  graceMs?: number;
}): void {
  const end = attemptEndsAt(args.expiresAt, args.effectiveDueAt);
  if (isAttemptOver({ now: args.now, end, graceMs: args.graceMs })) throw new GradingError("EXAM_CLOSED");
}

/** Whole seconds left until the end (0 when over); null when the attempt has no end. */
export function secondsLeft(end: Date | null, now: Date): number | null {
  return end ? Math.max(0, Math.ceil((end.getTime() - now.getTime()) / 1000)) : null;
}

// ---------------------------------------------------------------------------
// Answer shape
// ---------------------------------------------------------------------------

/**
 * Validate one submitted answer against its question.
 * Returns the normalized answer, or null when it is blank (which clears any saved answer).
 */
export function validateAnswerShape(
  question: { type: ExamQuestionType; options: { id: string }[] },
  input: { selectedOptionId?: string | null; answerText?: string | null },
): { selectedOptionId: string | null; answerText: string | null } | null {
  if (question.type === "OPEN") {
    const text = input.answerText?.trim() || null;
    if (!text) return null;
    if (text.length > MAX_ANSWER_LENGTH) throw new GradingError("INVALID_ANSWER", "Answer is too long");
    return { selectedOptionId: null, answerText: text };
  }
  const selected = input.selectedOptionId || null;
  if (!selected) return null;
  if (!question.options.some((o) => o.id === selected)) {
    throw new GradingError("INVALID_ANSWER", "Option does not belong to this question");
  }
  return { selectedOptionId: selected, answerText: null };
}

// ---------------------------------------------------------------------------
// Grading an attempt
// ---------------------------------------------------------------------------

export interface GradableQuestion {
  id: string;
  type: ExamQuestionType;
  points: number;
  options: { id: string; isCorrect: boolean }[];
}

export interface StoredAnswer {
  questionId: string;
  selectedOptionId: string | null;
  answerText: string | null;
}

export interface GradedAnswerRow {
  questionId: string;
  selectedOptionId: string | null;
  answerText: string | null;
  isCorrect: boolean | null;
  /** null = awaiting manual grading */
  score: number | null;
}

export interface AttemptGrade {
  rows: GradedAnswerRow[];
  maxScore: number;
  /** null while any answer awaits manual grading */
  totalScore: number | null;
  pendingManual: number;
  status: "SUBMITTED" | "GRADED";
}

export function summarizeScores(scores: (number | null)[]): { total: number; pending: number } {
  let total = 0;
  let pending = 0;
  for (const s of scores) {
    if (s == null) pending++;
    else total += s;
  }
  return { total: round2(total), pending };
}

export function gradeAttempt(questions: GradableQuestion[], answers: StoredAnswer[]): AttemptGrade {
  const byQuestion = new Map(answers.map((a) => [a.questionId, a]));
  const rows: GradedAnswerRow[] = questions.map((q) => {
    const a = byQuestion.get(q.id);

    if (q.type === "OPEN") {
      const text = a?.answerText?.trim() || null;
      return {
        questionId: q.id,
        selectedOptionId: null,
        answerText: text,
        isCorrect: null,
        score: text ? null : 0, // blank open answers need no human
      };
    }

    const selected = a?.selectedOptionId ?? null;
    if (!selected || !q.options.some((o) => o.id === selected)) {
      return { questionId: q.id, selectedOptionId: null, answerText: null, isCorrect: false, score: 0 };
    }
    const g = gradeObjective(q.options, selected, q.points);
    return {
      questionId: q.id,
      selectedOptionId: selected,
      answerText: null,
      isCorrect: g.isCorrect,
      score: g.rawScore,
    };
  });

  const { total, pending } = summarizeScores(rows.map((r) => r.score));
  return {
    rows,
    maxScore: round2(questions.reduce((s, q) => s + q.points, 0)),
    totalScore: pending === 0 ? total : null,
    pendingManual: pending,
    status: pending === 0 ? "GRADED" : "SUBMITTED",
  };
}
