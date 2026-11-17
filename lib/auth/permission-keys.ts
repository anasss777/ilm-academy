// lib/auth/permission-keys.ts
// The list of permissions, in a module with no imports so pure rules and tests can use it.
// Keep in sync with the PERMISSIONS map in prisma/seed.ts.

export const PERMISSION_KEYS = [
  "course.create", "course.edit", "course.publish", "course.archive",
  "lecture.create", "lecture.edit", "lecture.delete",
  "recording.manage", "material.manage",
  "attendance.view", "attendance.edit", "attendance.import",
  "question.create", "question.edit",
  "submission.view", "submission.grade", "submission.extend",
  "exam.create", "exam.edit", "exam.grade", "exam.reopen",
  "student.view", "enrollment.manage",
  "certificate.view", "certificate.review", "certificate.export", "certificate.configure",
  "report.view", "audit.view",
  "user.manage", "role.manage", "settings.manage",
] as const;

export type PermissionKey = (typeof PERMISSION_KEYS)[number];
