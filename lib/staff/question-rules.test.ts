import { describe, it, expect } from "vitest";
import { GradingError } from "../grading/grading";
import {
  FALSE_LABEL,
  TRUE_LABEL,
  buildOptions,
  isStructureLocked,
  validatePoints,
  validateQuestionTiming,
} from "./question-rules";

const codeOf = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof GradingError ? e.code : "OTHER";
  }
  return null;
};
const d = (s: string) => new Date(`2026-10-${s}:00Z`);

describe("buildOptions: multiple choice", () => {
  const opts = (...marks: boolean[]) => marks.map((isCorrect, i) => ({ text: `Option ${i + 1}`, isCorrect }));

  it("keeps order and positions for a valid question", () => {
    const out = buildOptions("MULTIPLE_CHOICE", { options: opts(false, true, false) });
    expect(out.map((o) => o.position)).toEqual([0, 1, 2]);
    expect(out.filter((o) => o.isCorrect)).toHaveLength(1);
  });
  it("needs exactly one correct option", () => {
    expect(codeOf(() => buildOptions("MULTIPLE_CHOICE", { options: opts(false, false) }))).toBe("INVALID_QUESTION");
    expect(codeOf(() => buildOptions("MULTIPLE_CHOICE", { options: opts(true, true) }))).toBe("INVALID_QUESTION");
  });
  it("needs 2 to 10 options", () => {
    expect(codeOf(() => buildOptions("MULTIPLE_CHOICE", { options: opts(true) }))).toBe("INVALID_QUESTION");
    expect(codeOf(() => buildOptions("MULTIPLE_CHOICE", { options: opts(true, ...Array(10).fill(false)) }))).toBe("INVALID_QUESTION");
  });
  it("rejects blank and duplicate options (ignoring case and spacing)", () => {
    expect(codeOf(() => buildOptions("MULTIPLE_CHOICE", { options: [{ text: "  ", isCorrect: true }, { text: "B", isCorrect: false }] }))).toBe("INVALID_QUESTION");
    expect(codeOf(() => buildOptions("MULTIPLE_CHOICE", { options: [{ text: "Yes", isCorrect: true }, { text: " yes ", isCorrect: false }] }))).toBe("INVALID_QUESTION");
  });
  it("does not accept correctAnswer", () => {
    expect(codeOf(() => buildOptions("MULTIPLE_CHOICE", { options: opts(true, false), correctAnswer: true }))).toBe("INVALID_QUESTION");
  });
});

describe("buildOptions: true/false and open", () => {
  it("generates the two labelled options from correctAnswer", () => {
    const t = buildOptions("TRUE_FALSE", { correctAnswer: true });
    expect(t).toEqual([
      { text: TRUE_LABEL, isCorrect: true, position: 0 },
      { text: FALSE_LABEL, isCorrect: false, position: 1 },
    ]);
    expect(buildOptions("TRUE_FALSE", { correctAnswer: false })[1].isCorrect).toBe(true);
  });
  it("requires correctAnswer and refuses custom options", () => {
    expect(codeOf(() => buildOptions("TRUE_FALSE", {}))).toBe("INVALID_QUESTION");
    expect(codeOf(() => buildOptions("TRUE_FALSE", { options: [{ text: "x", isCorrect: true }, { text: "y", isCorrect: false }] }))).toBe("INVALID_QUESTION");
  });
  it("open questions have no options", () => {
    expect(buildOptions("OPEN", {})).toEqual([]);
    expect(codeOf(() => buildOptions("OPEN", { options: [{ text: "x", isCorrect: true }] }))).toBe("INVALID_QUESTION");
    expect(codeOf(() => buildOptions("OPEN", { correctAnswer: true }))).toBe("INVALID_QUESTION");
  });
});

describe("validateQuestionTiming", () => {
  it("lecture questions may be open-ended or have a due date", () => {
    expect(codeOf(() => validateQuestionTiming({ kind: "lecture" }))).toBeNull();
    expect(codeOf(() => validateQuestionTiming({ kind: "lecture", dueAt: d("10T00:00"), lateCutoffAt: d("12T00:00"), allowLate: true }))).toBeNull();
  });
  it("rejects a cutoff without a due date or before it", () => {
    expect(codeOf(() => validateQuestionTiming({ kind: "lecture", lateCutoffAt: d("12T00:00") }))).toBe("INVALID_QUESTION");
    expect(codeOf(() => validateQuestionTiming({ kind: "lecture", dueAt: d("12T00:00"), lateCutoffAt: d("10T00:00") }))).toBe("INVALID_QUESTION");
  });
  it("exam questions cannot carry their own deadline settings", () => {
    expect(codeOf(() => validateQuestionTiming({ kind: "exam" }))).toBeNull();
    expect(codeOf(() => validateQuestionTiming({ kind: "exam", dueAt: d("10T00:00") }))).toBe("INVALID_QUESTION");
    expect(codeOf(() => validateQuestionTiming({ kind: "exam", allowLate: false }))).toBe("INVALID_QUESTION");
  });
});

describe("points and locking", () => {
  it("accepts 0.01 to 1000 and rounds to 2 decimals", () => {
    expect(validatePoints(2.505)).toBe(2.51);
    expect(codeOf(() => validatePoints(0))).toBe("INVALID_QUESTION");
    expect(codeOf(() => validatePoints(1001))).toBe("INVALID_QUESTION");
    expect(codeOf(() => validatePoints(NaN))).toBe("INVALID_QUESTION");
  });
  it("locks the structure once anyone has answered", () => {
    expect(isStructureLocked(0)).toBe(false);
    expect(isStructureLocked(1)).toBe(true);
  });
});
