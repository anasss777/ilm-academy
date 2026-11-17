// lib/enrollment/enrollment.ts
// Pure enrollment rules.
//
//  - A draft course does not exist as far as students are concerned (NOT_FOUND).
//  - Someone already enrolled is never affected by the course being closed or archived.
//  - New enrollments, and re-enrollments after withdrawal, need a PUBLISHED course that is
//    open for enrollment. Archived courses accept nobody new.
//  - Re-enrolling reactivates the same row, so attendance and grades are never lost.

import { GradingError } from "../grading/grading";

export type CourseStatus = "DRAFT" | "PUBLISHED" | "ARCHIVED";
export type EnrollmentStatus = "ACTIVE" | "WITHDRAWN";
export type EnrollmentAction = "CREATE" | "REACTIVATE" | "NOOP";

export function decideEnrollment(args: {
  courseStatus: CourseStatus;
  enrollmentOpen: boolean;
  existing: EnrollmentStatus | null;
}): EnrollmentAction {
  const { courseStatus, enrollmentOpen, existing } = args;
  if (courseStatus === "DRAFT") throw new GradingError("NOT_FOUND");
  if (existing === "ACTIVE") return "NOOP";
  if (courseStatus !== "PUBLISHED" || !enrollmentOpen) throw new GradingError("ENROLLMENT_CLOSED");
  return existing === "WITHDRAWN" ? "REACTIVATE" : "CREATE";
}
