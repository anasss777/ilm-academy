// lib/read/project.ts
// The ONLY place a question is turned into something a student receives.
//
// Rule: students get an explicit allow-list of fields. `isCorrect`, the correct option ids and
// the explanation are added only when `reveal` is true. Never spread a database row into a
// student response: new columns would leak by default.

export interface ProjectableQuestion {
  id: string;
  type: "MULTIPLE_CHOICE" | "TRUE_FALSE" | "OPEN";
  body: string;
  points: number;
  explanation: string | null;
  options: { id: string; text: string; position: number; isCorrect: boolean }[];
}

export interface StudentQuestion {
  id: string;
  type: ProjectableQuestion["type"];
  body: string;
  points: number;
  options: { id: string; text: string }[];
  /** Present only when answers may be revealed */
  correctOptionIds?: string[];
  explanation?: string | null;
}

export function projectQuestionForStudent(q: ProjectableQuestion, reveal: boolean): StudentQuestion {
  const options = [...q.options].sort((a, b) => a.position - b.position);
  const projected: StudentQuestion = {
    id: q.id,
    type: q.type,
    body: q.body,
    points: q.points,
    options: options.map((o) => ({ id: o.id, text: o.text })),
  };
  if (reveal) {
    projected.correctOptionIds = options.filter((o) => o.isCorrect).map((o) => o.id);
    projected.explanation = q.explanation;
  }
  return projected;
}
