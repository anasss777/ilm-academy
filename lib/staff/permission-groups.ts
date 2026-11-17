// lib/staff/permission-groups.ts
// How permissions are grouped on the roles screen. Pure. A test makes sure every permission
// belongs to exactly one group, so adding a permission without placing it fails the tests.

export const PERMISSION_GROUPS: { id: string; keys: readonly string[] }[] = [
  { id: "course", keys: ["course.create", "course.edit", "course.publish", "course.archive"] },
  { id: "lectures", keys: ["lecture.create", "lecture.edit", "lecture.delete", "recording.manage", "material.manage"] },
  { id: "attendance", keys: ["attendance.view", "attendance.edit", "attendance.import"] },
  { id: "questions", keys: ["question.create", "question.edit", "submission.view", "submission.grade", "submission.extend"] },
  { id: "exams", keys: ["exam.create", "exam.edit", "exam.grade", "exam.reopen"] },
  { id: "students", keys: ["student.view", "enrollment.manage"] },
  { id: "certificates", keys: ["certificate.view", "certificate.review", "certificate.export", "certificate.configure"] },
  { id: "insights", keys: ["report.view", "audit.view"] },
  { id: "admin", keys: ["user.manage", "role.manage", "settings.manage"] },
];

/** "course.edit" -> "course_edit": message keys cannot contain dots. */
export const permissionMessageKey = (key: string) => key.replace(/\./g, "_");
