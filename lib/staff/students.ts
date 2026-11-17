// lib/staff/students.ts
// The course's student list and manual enrollment. Routes verify student.view / enrollment.manage.

// ADJUST this import to your generator `output` path (same as the other files).
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { GradingError } from "../grading/grading";
import { audit, inTx, safeSync } from "./common";

export async function listCourseStudents(
  db: PrismaClient,
  args: { courseId: string; q?: string; status?: "ACTIVE" | "WITHDRAWN"; page: number; pageSize: number },
) {
  const { courseId, q, status, page, pageSize } = args;
  const ci = "insensitive" as const;
  const where = {
    courseId,
    ...(status ? { status } : {}),
    ...(q ? { user: { OR: [{ fullName: { contains: q, mode: ci } }, { email: { contains: q, mode: ci } }] } } : {}),
  };
  const [total, rows] = await Promise.all([
    db.enrollment.count({ where }),
    db.enrollment.findMany({
      where,
      orderBy: { user: { fullName: "asc" } },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        userId: true, status: true, enrolledAt: true, withdrawnAt: true,
        user: { select: { fullName: true, email: true, phone: true, country: true, dataSharingConsentAt: true } },
      },
    }),
  ]);
  return {
    total,
    page,
    pageSize,
    items: rows.map((r) => ({
      userId: r.userId,
      fullName: r.user.fullName,
      email: r.user.email,
      phone: r.user.phone,
      country: r.user.country,
      dataSharingConsent: r.user.dataSharingConsentAt != null,
      status: r.status,
      enrolledAt: r.enrolledAt,
      withdrawnAt: r.withdrawnAt,
    })),
  };
}

/**
 * Enroll an existing account by email. Staff may enroll regardless of whether the course is
 * open for self-enrollment, but the person must already have registered.
 */
export async function staffEnrollStudent(
  db: PrismaClient,
  args: { courseId: string; email: string; actorId: string },
) {
  const { courseId, email, actorId } = args;

  const result = await inTx(db, async (tx) => {
    const course = await tx.course.findUnique({ where: { id: courseId }, select: { id: true } });
    if (!course) throw new GradingError("NOT_FOUND");

    // Case-insensitive: the address is typed by a person
    const user = await tx.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" }, deletedAt: null, status: "ACTIVE" },
      select: { id: true },
    });
    if (!user) throw new GradingError("NOT_FOUND", "No account with this email");

    const existing = await tx.enrollment.findUnique({
      where: { userId_courseId: { userId: user.id, courseId } },
    });
    if (existing?.status === "ACTIVE") {
      return { outcome: "ALREADY_ENROLLED" as const, userId: user.id };
    }

    if (existing) {
      await tx.enrollment.update({ where: { id: existing.id }, data: { status: "ACTIVE", withdrawnAt: null } });
    } else {
      await tx.enrollment.create({ data: { userId: user.id, courseId } });
    }
    await tx.notification.create({
      data: { userId: user.id, type: "enrollment.confirmed", payload: { courseId } },
    });
    await audit(tx, {
      actorId, action: "enrollment.staff_add", entityType: "Course", entityId: courseId,
      metadata: { studentId: user.id, reactivated: !!existing },
    });
    return { outcome: (existing ? "REENROLLED" : "ENROLLED") as "REENROLLED" | "ENROLLED", userId: user.id };
  });

  if (result.outcome !== "ALREADY_ENROLLED") await safeSync(db, courseId, [result.userId]);
  return result;
}

/** Withdraw or reactivate one student. History (attendance, grades) is always kept. */
export async function staffSetEnrollment(
  db: PrismaClient,
  args: { courseId: string; userId: string; status: "ACTIVE" | "WITHDRAWN"; actorId: string },
) {
  const { courseId, userId, status, actorId } = args;

  const changed = await inTx(db, async (tx) => {
    const existing = await tx.enrollment.findUnique({
      where: { userId_courseId: { userId, courseId } },
    });
    if (!existing) throw new GradingError("NOT_FOUND");
    if (existing.status === status) return false;

    await tx.enrollment.update({
      where: { id: existing.id },
      data: status === "ACTIVE" ? { status, withdrawnAt: null } : { status, withdrawnAt: new Date() },
    });
    await audit(tx, {
      actorId, action: status === "ACTIVE" ? "enrollment.staff_reactivate" : "enrollment.staff_withdraw",
      entityType: "Course", entityId: courseId, metadata: { studentId: userId },
    });
    return true;
  });

  // Only reactivation needs a review row; withdrawn students stay out of certificate lists
  if (changed && status === "ACTIVE") await safeSync(db, courseId, [userId]);
  return { status };
}
