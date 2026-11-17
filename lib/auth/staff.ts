// lib/auth/staff.ts
// Which people see the admin area, and for which courses. A role assignment with no course
// applies to every course; one with a course applies to that course only.
// (Pages still check the exact permission they need; this only decides who sees the area.)

import { cache } from "react";
import { db } from "@/lib/db";

export const getStaffScope = cache(async (userId: string) => {
  // Only roles that actually carry permissions count (the "student" role carries none)
  const rows = await db.userRole.findMany({
    where: { userId, role: { permissions: { some: {} } } },
    select: { courseId: true },
  });
  if (rows.length === 0) return { isStaff: false, allCourses: false, courseIds: [] as string[] };
  const allCourses = rows.some((r) => r.courseId === null);
  return {
    isStaff: true,
    allCourses,
    courseIds: allCourses ? [] : [...new Set(rows.map((r) => r.courseId as string))],
  };
});
