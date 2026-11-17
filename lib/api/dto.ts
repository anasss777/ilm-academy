// lib/api/dto.ts
// Student-facing response shapes. Never return raw Prisma rows to students:
// they carry fields (grades not yet released, answer keys) that must stay hidden.

type Dec = { toNumber(): number } | null | undefined;
const n = (d: Dec) => (d == null ? null : d.toNumber());

export function studentSubmissionDto(s: {
  id: string;
  questionId: string;
  submittedAt: Date;
  isLate: boolean;
  excuseGranted: boolean;
  rawScore: Dec;
  finalScore: Dec;
  penaltyType: string;
  penaltyValue: Dec;
  feedback: string | null;
  gradedAt: Date | null;
  releasedAt: Date | null;
}) {
  const released = s.releasedAt != null;
  return {
    id: s.id,
    questionId: s.questionId,
    submittedAt: s.submittedAt,
    isLate: s.isLate,
    excuseGranted: s.excuseGranted,
    graded: s.gradedAt != null,
    released,
    // Scores and feedback are visible only once released
    score: released
      ? {
          raw: n(s.rawScore),
          final: n(s.finalScore),
          penaltyType: s.penaltyType,
          penaltyValue: n(s.penaltyValue),
        }
      : null,
    feedback: released ? s.feedback : null,
  };
}

export function studentAttemptDto(a: {
  id: string;
  examId: string;
  attemptNumber: number;
  status: string;
  startedAt: Date;
  submittedAt: Date | null;
  totalScore: Dec;
  releasedAt: Date | null;
}) {
  const released = a.releasedAt != null;
  return {
    id: a.id,
    examId: a.examId,
    attemptNumber: a.attemptNumber,
    status: a.status,
    startedAt: a.startedAt,
    submittedAt: a.submittedAt,
    released,
    totalScore: released ? n(a.totalScore) : null,
  };
}

// Staff-facing shapes: staff may see raw and final scores regardless of release state.
export function staffSubmissionDto(s: {
  id: string;
  questionId: string;
  userId: string;
  isLate: boolean;
  excuseGranted: boolean;
  rawScore: Dec;
  finalScore: Dec;
  penaltyType: string;
  penaltyValue: Dec;
  gradedAt: Date | null;
  releasedAt: Date | null;
}) {
  return {
    id: s.id,
    questionId: s.questionId,
    userId: s.userId,
    isLate: s.isLate,
    excuseGranted: s.excuseGranted,
    rawScore: n(s.rawScore),
    finalScore: n(s.finalScore),
    penaltyType: s.penaltyType,
    penaltyValue: n(s.penaltyValue),
    gradedAt: s.gradedAt,
    releasedAt: s.releasedAt,
  };
}

export function staffAttemptDto(a: {
  id: string;
  examId: string;
  userId: string;
  attemptNumber: number;
  status: string;
  submittedAt: Date | null;
  totalScore: Dec;
  gradedAt: Date | null;
  releasedAt: Date | null;
}) {
  return {
    id: a.id,
    examId: a.examId,
    userId: a.userId,
    attemptNumber: a.attemptNumber,
    status: a.status,
    submittedAt: a.submittedAt,
    totalScore: n(a.totalScore),
    gradedAt: a.gradedAt,
    releasedAt: a.releasedAt,
  };
}
