// lib/ui/exam-draft.ts
// The exam answer sheet as the browser sees it, and what has to be sent to the server.
// Pure functions so the autosave rules can be tested without a browser.

export interface DraftAnswer {
  selectedOptionId: string | null;
  answerText: string | null;
}
export type Draft = Record<string, DraftAnswer>;

export interface AnswerChange {
  questionId: string;
  selectedOptionId: string | null;
  answerText: string | null;
}

/** A blank answer and a missing answer are the same thing. */
export function normalizeAnswer(a?: Partial<DraftAnswer> | null): DraftAnswer {
  return {
    selectedOptionId: a?.selectedOptionId || null,
    answerText: a?.answerText?.trim() ? a.answerText : null,
  };
}

const same = (a: DraftAnswer, b: DraftAnswer) =>
  a.selectedOptionId === b.selectedOptionId && (a.answerText?.trim() ?? null) === (b.answerText?.trim() ?? null);

/**
 * The answers that differ from what the server already has. An answer that was cleared is
 * included (with nulls), because sending a blank answer is how it is cleared on the server.
 */
export function draftChanges(saved: Draft, current: Draft): AnswerChange[] {
  const ids = new Set([...Object.keys(saved), ...Object.keys(current)]);
  const changes: AnswerChange[] = [];
  for (const questionId of ids) {
    const before = normalizeAnswer(saved[questionId]);
    const after = normalizeAnswer(current[questionId]);
    if (!same(before, after)) changes.push({ questionId, ...after });
  }
  return changes;
}

export function countUnanswered(questionIds: string[], draft: Draft): number {
  return questionIds.filter((id) => {
    const a = normalizeAnswer(draft[id]);
    return !a.selectedOptionId && !a.answerText;
  }).length;
}

export function toDraft(
  rows: { questionId: string; selectedOptionId: string | null; answerText: string | null }[],
): Draft {
  const draft: Draft = {};
  for (const r of rows) draft[r.questionId] = normalizeAnswer(r);
  return draft;
}
