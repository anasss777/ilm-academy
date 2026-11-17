// lib/staff/question-rules.ts
// Pure rules for authoring questions. No database.
//
//  - MULTIPLE_CHOICE: 2 to 10 distinct options, exactly one correct.
//  - TRUE_FALSE:      the author supplies `correctAnswer`; the two options are generated.
//  - OPEN:            no options.
//  - Lecture questions may have a due date, a late cutoff and a late-submission override.
//    Exam questions may not: they follow the exam's own window (also enforced by a DB CHECK).
//  - Once students have answered, the structure (options, correct answer, points) is locked,
//    because it would silently invalidate grades that were already given.

import { GradingError, round2 } from "../grading/grading";

export type QuestionType = "MULTIPLE_CHOICE" | "TRUE_FALSE" | "OPEN";

export interface OptionInput {
  text: string;
  isCorrect: boolean;
}
export interface BuiltOption {
  text: string;
  isCorrect: boolean;
  position: number;
}

// Option labels for true/false questions are bilingual so one record works in both UIs
export const TRUE_LABEL = "صحيح / True";
export const FALSE_LABEL = "خطأ / False";

const bad = (message: string) => new GradingError("INVALID_QUESTION", message);

export function buildOptions(
  type: QuestionType,
  input: { options?: OptionInput[] | null; correctAnswer?: boolean | null },
): BuiltOption[] {
  if (type === "OPEN") {
    if (input.options?.length || input.correctAnswer != null) throw bad("Open questions have no options");
    return [];
  }

  if (type === "TRUE_FALSE") {
    if (input.options?.length) throw bad("True/false questions take correctAnswer, not options");
    if (typeof input.correctAnswer !== "boolean") throw bad("correctAnswer is required for true/false questions");
    return [
      { text: TRUE_LABEL, isCorrect: input.correctAnswer, position: 0 },
      { text: FALSE_LABEL, isCorrect: !input.correctAnswer, position: 1 },
    ];
  }

  if (input.correctAnswer != null) throw bad("Multiple-choice questions take options, not correctAnswer");
  const options = input.options ?? [];
  if (options.length < 2 || options.length > 10) throw bad("Provide between 2 and 10 options");
  const texts = options.map((o) => o.text.trim());
  if (texts.some((t) => !t)) throw bad("Options cannot be empty");
  if (new Set(texts.map((t) => t.toLowerCase())).size !== texts.length) throw bad("Options must be different from each other");
  if (options.filter((o) => o.isCorrect).length !== 1) throw bad("Mark exactly one option as correct");
  return options.map((o, position) => ({ text: texts[position], isCorrect: o.isCorrect, position }));
}

export function validateQuestionTiming(args: {
  kind: "lecture" | "exam";
  dueAt?: Date | null;
  lateCutoffAt?: Date | null;
  allowLate?: boolean | null;
}): void {
  const { kind, dueAt, lateCutoffAt, allowLate } = args;
  if (kind === "exam") {
    if (dueAt || lateCutoffAt || allowLate != null) throw bad("Exam questions follow the exam's own opening and closing times");
    return;
  }
  if (lateCutoffAt && !dueAt) throw bad("A late cutoff needs a due date");
  if (dueAt && lateCutoffAt && lateCutoffAt.getTime() < dueAt.getTime()) {
    throw bad("The late cutoff cannot be before the due date");
  }
}

export function validatePoints(points: number): number {
  if (!Number.isFinite(points) || points < 0.01 || points > 1000) throw bad("Points must be between 0.01 and 1000");
  return round2(points);
}

/** True once students have answered: options, correct answer and points can no longer change. */
export const isStructureLocked = (answerCount: number) => answerCount > 0;
