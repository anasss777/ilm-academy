// lib/eligibility/eligibility.ts
//
// Pure functions: no database access, no Date.now(). The caller loads the data
// (convert Prisma Decimals with Number()) and passes plain values in.
//
// Rules encoded here (agreed with the instructor):
//  - Attendance denominator = ALL lectures held to date. A missing attendance row = ABSENT.
//    Lectures held before the student enrolled, or while withdrawn, therefore count as absent.
//  - EXCUSED lectures are removed from that student's denominator AND their questions are removed.
//  - Required lectures = ceil(minPercent% x (held - excused)).
//  - PARTIAL attendance counts as `partialWeight` of a lecture (default 1).
//  - Question score = points earned / points available (unsubmitted = 0).
//  - Exam = best graded attempt, as a percentage of the exam's max score.
//  - A threshold of null means that requirement is disabled.
//
// "Held" lectures = published, not deleted, and already ended. The caller filters.

export type AttendanceStatus = "PRESENT" | "PARTIAL" | "ABSENT" | "EXCUSED";
export type CheckStatus = "MET" | "NOT_MET" | "PENDING";
export type CheckState = CheckStatus | "DISABLED";
export type EligibilityStatus = "ELIGIBLE" | "NOT_ELIGIBLE" | "PENDING";

const EPS = 1e-9;
const round2 = (n: number) => Math.round(n * 100) / 100;
const percentOf = (num: number, den: number): number | null =>
  den > 0 ? (num / den) * 100 : null;

/** ceil(minPercent% of total), robust to floating-point noise (e.g. 0.7 * 10). */
export function requiredCount(minPercent: number, total: number): number {
  return Math.max(0, Math.ceil((minPercent * total) / 100 - EPS));
}

// ---------------------------------------------------------------------------
// Attendance
// ---------------------------------------------------------------------------

export interface LectureAttendanceInput {
  /** null / undefined = no record = ABSENT */
  status: AttendanceStatus | null | undefined;
}

export interface AttendanceResult {
  state: CheckState;
  heldLectures: number;
  excusedLectures: number;
  countedLectures: number; // held - excused
  attended: number; // partial-weighted
  requiredLectures: number | null;
  percent: number | null;
}

export function computeAttendance(args: {
  lectures: LectureAttendanceInput[];
  partialWeight: number;
  minPercent: number | null;
}): AttendanceResult {
  const { lectures, partialWeight, minPercent } = args;
  let excused = 0;
  let present = 0;
  let partial = 0;
  for (const l of lectures) {
    const s = l.status ?? "ABSENT";
    if (s === "EXCUSED") excused++;
    else if (s === "PRESENT") present++;
    else if (s === "PARTIAL") partial++;
  }
  const counted = lectures.length - excused;
  const attended = present + partial * partialWeight;
  const percent = percentOf(attended, counted);
  const required =
    minPercent == null ? null : requiredCount(minPercent, counted);

  let state: CheckState;
  if (minPercent == null) state = "DISABLED";
  else if (counted === 0)
    state = "NOT_MET"; // nothing to attend yet: never eligible by default
  else state = attended + EPS >= (required as number) ? "MET" : "NOT_MET";

  return {
    state,
    heldLectures: lectures.length,
    excusedLectures: excused,
    countedLectures: counted,
    attended: round2(attended),
    requiredLectures: required,
    percent: percent == null ? null : round2(percent),
  };
}

// ---------------------------------------------------------------------------
// Lecture-question score
// ---------------------------------------------------------------------------

export interface QuestionInput {
  points: number;
  /** true when this student is EXCUSED for the question's lecture */
  excused: boolean;
  /** null/undefined = not submitted. finalScore null = submitted but not graded yet. */
  submission?: { finalScore: number | null } | null;
}

export interface QuestionScoreResult {
  state: CheckState;
  pointsAvailable: number;
  pointsEarned: number;
  pointsPendingGrading: number;
  percent: number | null;
}

export function computeQuestionScore(args: {
  questions: QuestionInput[];
  minPercent: number | null;
}): QuestionScoreResult {
  const { questions, minPercent } = args;
  let available = 0;
  let earned = 0;
  let pending = 0;
  for (const q of questions) {
    if (q.excused) continue;
    available += q.points;
    if (q.submission) {
      if (q.submission.finalScore == null) pending += q.points;
      else earned += q.submission.finalScore;
    }
  }
  const percent = percentOf(earned, available);
  const bestCase = percentOf(earned + pending, available);

  let state: CheckState;
  if (minPercent == null) state = "DISABLED";
  else if (available === 0 || percent === null) state = "NOT_MET";
  else if (percent + EPS >= minPercent)
    state = "MET"; // can only go up as grading completes
  else if (bestCase !== null && bestCase + EPS >= minPercent) state = "PENDING";
  else state = "NOT_MET";

  return {
    state,
    pointsAvailable: round2(available),
    pointsEarned: round2(earned),
    pointsPendingGrading: round2(pending),
    percent: percent == null ? null : round2(percent),
  };
}

// ---------------------------------------------------------------------------
// Final exam
// ---------------------------------------------------------------------------

export interface ExamAttemptInput {
  status: "IN_PROGRESS" | "SUBMITTED" | "GRADED";
  totalScore: number | null;
}

export interface ExamInput {
  maxScore: number; // sum of the exam's question points
  attempts: ExamAttemptInput[];
}

export interface ExamResult {
  state: CheckState;
  percent: number | null; // best graded attempt
  hasAttemptAwaitingGrading: boolean;
}

export function computeExam(args: {
  exam: ExamInput | null;
  minPercent: number | null;
}): ExamResult {
  const { exam, minPercent } = args;
  const graded = (exam?.attempts ?? []).filter(
    (a) => a.status === "GRADED" && a.totalScore != null,
  );
  const awaiting = (exam?.attempts ?? []).some((a) => a.status === "SUBMITTED");
  const best =
    exam && exam.maxScore > 0 && graded.length > 0
      ? Math.max(
          ...graded.map(
            (a) => ((a.totalScore as number) / exam.maxScore) * 100,
          ),
        )
      : null;

  let state: CheckState;
  if (minPercent == null) state = "DISABLED";
  else if (best !== null && best + EPS >= minPercent) state = "MET";
  else if (awaiting) state = "PENDING";
  else state = "NOT_MET";

  return {
    state,
    percent: best == null ? null : round2(best),
    hasAttemptAwaitingGrading: awaiting,
  };
}

// ---------------------------------------------------------------------------
// Overall eligibility
// ---------------------------------------------------------------------------

export type RequirementInput = {
  minAttendancePercent: number | null;
  minQuestionScorePercent: number | null;
  minExamPercent: number | null;
};

export type ReasonCode =
  | "ATTENDANCE_NOT_MET"
  | "QUESTIONS_NOT_MET"
  | "EXAM_NOT_MET"
  | "QUESTIONS_PENDING_GRADING"
  | "EXAM_PENDING_GRADING"
  | "NO_REQUIREMENTS_CONFIGURED";

export interface EligibilityResult {
  status: EligibilityStatus;
  attendance: AttendanceResult;
  questions: QuestionScoreResult;
  exam: ExamResult;
  reasons: ReasonCode[];
}

export function evaluateEligibility(args: {
  requirement: RequirementInput;
  partialWeight: number;
  lectures: LectureAttendanceInput[];
  questions: QuestionInput[];
  exam: ExamInput | null;
}): EligibilityResult {
  const { requirement, partialWeight, lectures, questions, exam } = args;

  const attendance = computeAttendance({
    lectures,
    partialWeight,
    minPercent: requirement.minAttendancePercent,
  });
  const questionScore = computeQuestionScore({
    questions,
    minPercent: requirement.minQuestionScorePercent,
  });
  const examResult = computeExam({
    exam,
    minPercent: requirement.minExamPercent,
  });

  const states = [attendance.state, questionScore.state, examResult.state];
  const enabled = states.filter((s) => s !== "DISABLED");
  const reasons: ReasonCode[] = [];

  if (attendance.state === "NOT_MET") reasons.push("ATTENDANCE_NOT_MET");
  if (questionScore.state === "NOT_MET") reasons.push("QUESTIONS_NOT_MET");
  if (examResult.state === "NOT_MET") reasons.push("EXAM_NOT_MET");
  if (questionScore.state === "PENDING")
    reasons.push("QUESTIONS_PENDING_GRADING");
  if (examResult.state === "PENDING") reasons.push("EXAM_PENDING_GRADING");

  let status: EligibilityStatus;
  if (enabled.length === 0) {
    // Safety default: a course with no thresholds must not make everyone eligible by accident.
    status = "NOT_ELIGIBLE";
    reasons.push("NO_REQUIREMENTS_CONFIGURED");
  } else if (enabled.includes("NOT_MET")) status = "NOT_ELIGIBLE";
  else if (enabled.includes("PENDING")) status = "PENDING";
  else status = "ELIGIBLE";

  return {
    status,
    attendance,
    questions: questionScore,
    exam: examResult,
    reasons,
  };
}

// ---------------------------------------------------------------------------
// Certificate review state machine
//   PENDING -> AUTO_ELIGIBLE | AUTO_INELIGIBLE -> APPROVED | REJECTED (instructor)
// ---------------------------------------------------------------------------

export type ReviewStatus =
  | "PENDING"
  | "AUTO_ELIGIBLE"
  | "AUTO_INELIGIBLE"
  | "APPROVED"
  | "REJECTED";

export interface ReviewState {
  status: ReviewStatus;
  requirementVersion: number | null;
  needsReReview: boolean;
  overrideReason: string | null;
}

const AUTO_STATUS: Record<EligibilityStatus, ReviewStatus> = {
  ELIGIBLE: "AUTO_ELIGIBLE",
  NOT_ELIGIBLE: "AUTO_INELIGIBLE",
  PENDING: "PENDING",
};

/**
 * Re-sync a review row with the latest live result. Undecided rows simply follow the
 * auto result. Decided rows are never silently changed: they are flagged for re-review
 * when the requirements version changed, or when a decision that agreed with the auto
 * result no longer does.
 */
export function reconcileReview(
  review: ReviewState,
  auto: EligibilityStatus,
  currentVersion: number,
): ReviewState {
  if (review.status === "APPROVED" || review.status === "REJECTED") {
    const versionChanged = review.requirementVersion !== currentVersion;
    const wasConsistent = review.overrideReason == null;
    const approvalInvalid =
      review.status === "APPROVED" && wasConsistent && auto !== "ELIGIBLE";
    const rejectionInvalid =
      review.status === "REJECTED" && wasConsistent && auto === "ELIGIBLE";
    return {
      ...review,
      needsReReview:
        review.needsReReview ||
        versionChanged ||
        approvalInvalid ||
        rejectionInvalid,
    };
  }
  return {
    status: AUTO_STATUS[auto],
    requirementVersion: currentVersion,
    needsReReview: false,
    overrideReason: null,
  };
}

/** Instructor decision. Contradicting the auto result requires a written reason. */
export function decideReview(args: {
  auto: EligibilityStatus;
  decision: "APPROVED" | "REJECTED";
  currentVersion: number;
  reason?: string | null;
}): ReviewState {
  const { auto, decision, currentVersion } = args;
  const consistent =
    decision === "APPROVED" ? auto === "ELIGIBLE" : auto === "NOT_ELIGIBLE";
  const reason = args.reason?.trim() || null;
  if (!consistent && !reason) throw new Error("OVERRIDE_REASON_REQUIRED");
  return {
    status: decision,
    requirementVersion: currentVersion,
    needsReReview: false,
    overrideReason: consistent ? null : reason,
  };
}

/** Only approved, up-to-date candidates who consented to data sharing can be exported. */
export function canExport(
  review: ReviewState,
  hasDataSharingConsent: boolean,
): boolean {
  return (
    review.status === "APPROVED" &&
    !review.needsReReview &&
    hasDataSharingConsent
  );
}
