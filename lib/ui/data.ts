// lib/ui/data.ts
// Request-scoped loaders for the student area. The course layout and each page ask for the same
// data; React's cache() makes it a single database round trip per request.

import { cache } from "react";
import { notFound } from "next/navigation";
import { redirect } from "@/i18n/navigation";
import { db } from "@/lib/db";
import { getStudentEligibility } from "@/lib/eligibility/loader";
import { GradingError } from "@/lib/grading/grading";
import { getCourseDashboard, getLecturesForStudent } from "@/lib/read/service";

export const loadDashboard = cache((userId: string, courseId: string) =>
  getCourseDashboard(db, { userId, courseId }),
);
export const loadLectures = cache((userId: string, courseId: string) =>
  getLecturesForStudent(db, { userId, courseId }),
);
export const loadEligibility = cache((userId: string, courseId: string) =>
  getStudentEligibility(db, courseId, userId),
);

/**
 * Await a student-area query, and turn "not enrolled" into a redirect to the course list and
 * "not found" into a 404, instead of an error page.
 */
export async function orLeave<T>(promise: Promise<T>, locale: string): Promise<T> {
  try {
    return await promise;
  } catch (e) {
    if (e instanceof GradingError) {
      if (e.code === "NOT_ENROLLED") redirect({ href: "/my-courses", locale });
      if (e.code === "NOT_FOUND" || e.code === "QUESTION_NOT_AVAILABLE" || e.code === "EXAM_NOT_AVAILABLE") {
        notFound();
      }
    }
    throw e;
  }
}
