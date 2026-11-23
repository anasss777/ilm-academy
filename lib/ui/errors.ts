// lib/ui/errors.ts
// API error codes that have a translated message under `apiErrors` in messages/*.json.
// Anything else falls back to the generic "FAILED" message.

export const KNOWN_API_ERRORS = [
  "FAILED",
  "ENDPOINT_NOT_FOUND",
  "UNAUTHENTICATED",
  "RATE_LIMITED",
  "VALIDATION_ERROR",
  "INVALID_ANSWER",
  "DEADLINE_PASSED",
  "SUBMISSIONS_CLOSED",
  "ALREADY_GRADED",
  "NOT_ENROLLED",
  "EXAM_NOT_OPEN",
  "EXAM_CLOSED",
  "NO_ATTEMPTS_LEFT",
  "ATTEMPT_NOT_IN_PROGRESS",
  "ATTEMPT_CONFLICT",
  // staff area
  "FORBIDDEN",
  "NOT_FOUND",
  "INVALID_SLUG",
  "SLUG_TAKEN",
  "SLUG_LOCKED",
  "COURSE_NOT_READY",
  "INVALID_STATUS_TRANSITION",
  "LECTURE_NUMBER_TAKEN",
  "INVALID_URL",
  "INVALID_DATE",
  "INVALID_ATTENDANCE",
  "INVALID_UPLOAD",
  "INVALID_SETTINGS",
  "INVALID_PENALTY",
  "ENROLLMENT_CLOSED",
  "STORAGE_NOT_CONFIGURED",
  "STORAGE_FAILED",
  // questions, exams, grading, certificates
  "INVALID_QUESTION",
  "QUESTION_LOCKED",
  "EXAM_EXISTS",
  "EXAM_NOT_READY",
  "EXAM_HAS_ATTEMPTS",
  "SCORE_OUT_OF_RANGE",
  "EXCUSE_REASON_REQUIRED",
  "OVERRIDE_REASON_REQUIRED",
  "NOTHING_TO_EXPORT",
  "CERTIFICATES_DISABLED",
  "INVALID_ATTEMPT_GRANT",
  "COURSE_FEATURE_DISABLED",
  // team and roles
  "USER_NOT_FOUND",
  "INVALID_ROLE",
  "PERMISSION_ESCALATION",
  "LAST_OWNER",
  "ROLE_LOCKED",
  "ROLE_IN_USE",
  "ROLE_KEY_TAKEN",
  "INVALID_ROLE_KEY",
  "INVALID_PERMISSIONS",
  // attendance import
  "INVALID_CSV",
] as const;

export function apiErrorKey(code: string): string {
  return (KNOWN_API_ERRORS as readonly string[]).includes(code) ? code : "FAILED";
}
