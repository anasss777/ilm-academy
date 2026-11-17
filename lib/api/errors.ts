// lib/api/errors.ts
// One place that turns thrown errors into HTTP responses.
// Clients receive a stable machine-readable `code` and translate it into Arabic/English
// themselves, so messages here are for developers and logs.

import { ZodError } from "zod";
import { GradingError, type GradingErrorCode } from "../grading/grading";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message?: string,
    public readonly details?: unknown,
    public readonly headers?: Record<string, string>,
  ) {
    super(message ?? code);
    this.name = "ApiError";
  }
}

// Record<GradingErrorCode, ...> makes the compiler flag any new code that is not mapped
const STATUS_BY_GRADING_CODE: Record<GradingErrorCode, number> = {
  NOT_FOUND: 404,
  QUESTION_NOT_AVAILABLE: 404,
  EXAM_NOT_AVAILABLE: 404,
  NOT_ENROLLED: 403,
  COURSE_FEATURE_DISABLED: 409,
  INVALID_ANSWER: 422,
  SCORE_OUT_OF_RANGE: 422,
  INVALID_PENALTY: 422,
  INVALID_DATE: 422,
  INVALID_ATTEMPT_GRANT: 422,
  EXCUSE_REASON_REQUIRED: 422,
  ALREADY_SUBMITTED: 409,
  ALREADY_GRADED: 409,
  DEADLINE_PASSED: 409,
  SUBMISSIONS_CLOSED: 409,
  EXAM_NOT_OPEN: 409,
  EXAM_CLOSED: 409,
  NO_ATTEMPTS_LEFT: 409,
  ATTEMPT_NOT_IN_PROGRESS: 409,
  ATTEMPT_CONFLICT: 409,
  ENROLLMENT_CLOSED: 409,
  INVALID_SLUG: 422,
  SLUG_TAKEN: 409,
  SLUG_LOCKED: 409,
  LECTURE_NUMBER_TAKEN: 409,
  INVALID_URL: 422,
  COURSE_NOT_READY: 422,
  INVALID_STATUS_TRANSITION: 409,
  INVALID_ATTENDANCE: 422,
  INVALID_SETTINGS: 422,
  INVALID_QUESTION: 422,
  QUESTION_LOCKED: 409,
  EXAM_EXISTS: 409,
  EXAM_NOT_READY: 422,
  EXAM_HAS_ATTEMPTS: 409,
  INVALID_UPLOAD: 422,
};

// Plain Errors thrown by the eligibility layer
const STATUS_BY_PLAIN_MESSAGE: Record<string, number> = {
  OVERRIDE_REASON_REQUIRED: 422,
  NOTHING_TO_EXPORT: 409,
  CERTIFICATES_DISABLED: 409,
  STORAGE_NOT_CONFIGURED: 503,
  STORAGE_FAILED: 502,
  NOT_ENROLLED: 403,
};

function body(
  status: number,
  code: string,
  message?: string,
  details?: unknown,
  headers?: Record<string, string>,
): Response {
  return Response.json(
    { error: { code, message, details } },
    { status, headers },
  );
}

export function toErrorResponse(e: unknown): Response {
  if (e instanceof ApiError)
    return body(e.status, e.code, e.message, e.details, e.headers);

  if (e instanceof GradingError) {
    return body(STATUS_BY_GRADING_CODE[e.code] ?? 400, e.code, e.message);
  }

  if (e instanceof ZodError) {
    return body(
      400,
      "VALIDATION_ERROR",
      "Invalid request",
      e.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
    );
  }

  if (e instanceof Error && e.message in STATUS_BY_PLAIN_MESSAGE) {
    return body(STATUS_BY_PLAIN_MESSAGE[e.message], e.message);
  }

  // Never leak internals (SQL, stack traces) to the client
  console.error("[api] unhandled error", e);
  return body(500, "INTERNAL_ERROR", "Something went wrong");
}
