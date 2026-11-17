// lib/enrollment/service.ts
// Database layer for enrolling in and withdrawing from courses.
//
// A student has exactly one enrollment row per course. Withdrawing flips it to WITHDRAWN and
// keeps every attendance record, submission and grade; re-enrolling flips it back.

// ADJUST this import to your generator `output` path (same as the other files).
import type { PrismaClient } from "@/generated/prisma/client";
import { TX_OPTIONS } from "../eligibility/loader";
import { GradingError } from "../grading/grading";
import { decideEnrollment } from "./enrollment";

const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "P2002";

export async function enrollInCourse(
  db: PrismaClient,
  args: { userId: string; courseId: string; now?: Date },
) {
  const { userId, courseId } = args;
  const now = args.now ?? new Date();

  try {
    return await db.$transaction(async (tx) => {
      const course = await tx.course.findUnique({
        where: { id: courseId },
        select: { status: true, enrollmentOpen: true },
      });
      if (!course) throw new GradingError("NOT_FOUND");

      const existing = await tx.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId } },
      });

      const action = decideEnrollment({
        courseStatus: course.status,
        enrollmentOpen: course.enrollmentOpen,
        existing: existing?.status ?? null,
      });
      if (action === "NOOP") return { outcome: "ALREADY_ENROLLED" as const, enrollment: existing! };

      const enrollment =
        action === "CREATE"
          ? await tx.enrollment.create({ data: { userId, courseId, enrolledAt: now } })
          : await tx.enrollment.update({
              where: { id: existing!.id },
              data: { status: "ACTIVE", withdrawnAt: null },
            });

      await tx.notification.create({
        data: { userId, type: "enrollment.confirmed", payload: { courseId } },
      });

      return {
        outcome: (action === "CREATE" ? "ENROLLED" : "REENROLLED") as "ENROLLED" | "REENROLLED",
        enrollment,
      };
    }, TX_OPTIONS);
  } catch (e) {
    // Two tabs enrolling at once collide on the unique (userId, courseId): treat as success
    if (isUniqueViolation(e)) {
      const enrollment = await db.enrollment.findUnique({
        where: { userId_courseId: { userId, courseId } },
      });
      if (enrollment?.status === "ACTIVE") return { outcome: "ALREADY_ENROLLED" as const, enrollment };
    }
    throw e;
  }
}

export async function withdrawFromCourse(
  db: PrismaClient,
  args: { userId: string; courseId: string; now?: Date },
) {
  const { userId, courseId } = args;
  const existing = await db.enrollment.findUnique({
    where: { userId_courseId: { userId, courseId } },
  });
  if (!existing) throw new GradingError("NOT_ENROLLED");
  if (existing.status === "WITHDRAWN") {
    return { outcome: "ALREADY_WITHDRAWN" as const, enrollment: existing };
  }
  const enrollment = await db.enrollment.update({
    where: { id: existing.id },
    data: { status: "WITHDRAWN", withdrawnAt: args.now ?? new Date() },
  });
  return { outcome: "WITHDRAWN" as const, enrollment };
}
