import { describe, it, expect } from "vitest";
import { countUnanswered, draftChanges, normalizeAnswer, toDraft, type Draft } from "./exam-draft";

const a = (selectedOptionId: string | null, answerText: string | null = null) => ({ selectedOptionId, answerText });

describe("normalizeAnswer", () => {
  it("treats blank, missing and whitespace-only answers as empty", () => {
    expect(normalizeAnswer()).toEqual(a(null));
    expect(normalizeAnswer(a("", "   "))).toEqual(a(null));
    expect(normalizeAnswer(a("o1", "text"))).toEqual(a("o1", "text"));
  });
});

describe("draftChanges", () => {
  it("returns nothing when nothing changed", () => {
    const d: Draft = { q1: a("o1"), q2: a(null, "essay") };
    expect(draftChanges(d, { ...d })).toEqual([]);
  });

  it("returns only the answers that changed", () => {
    const saved: Draft = { q1: a("o1"), q2: a(null, "essay") };
    const current: Draft = { q1: a("o2"), q2: a(null, "essay") };
    expect(draftChanges(saved, current)).toEqual([{ questionId: "q1", selectedOptionId: "o2", answerText: null }]);
  });

  it("includes new answers", () => {
    expect(draftChanges({}, { q1: a("o1") })).toEqual([{ questionId: "q1", selectedOptionId: "o1", answerText: null }]);
  });

  it("includes cleared answers as nulls, so the server clears them too", () => {
    expect(draftChanges({ q1: a("o1") }, {})).toEqual([{ questionId: "q1", selectedOptionId: null, answerText: null }]);
    expect(draftChanges({ q2: a(null, "essay") }, { q2: a(null, "  ") })).toEqual([
      { questionId: "q2", selectedOptionId: null, answerText: null },
    ]);
  });

  it("ignores changes that are only whitespace around the same text", () => {
    expect(draftChanges({ q2: a(null, "essay") }, { q2: a(null, "essay  ") })).toEqual([]);
  });
});

describe("countUnanswered / toDraft", () => {
  it("counts questions with no answer", () => {
    const draft = toDraft([
      { questionId: "q1", selectedOptionId: "o1", answerText: null },
      { questionId: "q2", selectedOptionId: null, answerText: "  " },
    ]);
    expect(countUnanswered(["q1", "q2", "q3"], draft)).toBe(2);
  });
});
