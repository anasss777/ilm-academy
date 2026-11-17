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

import {
  GradingError,
  MAX_ANSWER_LENGTH,
  gradeObjective,
  round2,
} from "../grading/grading";

export type ExamQuestionType = "MULTIPLE_CHOICE" | "TRUE_FALSE" | "OPEN";

// ---------------------------------------------------------------------------
// Attempts and deadlines
// ---------------------------------------------------------------------------

export function allowedAttempts(
  attemptLimit: number,
  grants: { extraAttempts: number }[],
): number {
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
  if (opensAt && now.getTime() < opensAt.getTime())
    throw new GradingError("EXAM_NOT_OPEN");
  if (effectiveDueAt && now.getTime() > effectiveDueAt.getTime())
    throw new GradingError("EXAM_CLOSED");
}

export function assertCanStartAttempt(
  attemptsUsed: number,
  allowed: number,
): void {
  if (attemptsUsed >= allowed) throw new GradingError("NO_ATTEMPTS_LEFT");
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
    if (text.length > MAX_ANSWER_LENGTH)
      throw new GradingError("INVALID_ANSWER", "Answer is too long");
    return { selectedOptionId: null, answerText: text };
  }
  const selected = input.selectedOptionId || null;
  if (!selected) return null;
  if (!question.options.some((o) => o.id === selected)) {
    throw new GradingError(
      "INVALID_ANSWER",
      "Option does not belong to this question",
    );
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

export function summarizeScores(scores: (number | null)[]): {
  total: number;
  pending: number;
} {
  let total = 0;
  let pending = 0;
  for (const s of scores) {
    if (s == null) pending++;
    else total += s;
  }
  return { total: round2(total), pending };
}

export function gradeAttempt(
  questions: GradableQuestion[],
  answers: StoredAnswer[],
): AttemptGrade {
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
      return {
        questionId: q.id,
        selectedOptionId: null,
        answerText: null,
        isCorrect: false,
        score: 0,
      };
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
