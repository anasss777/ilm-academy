// scripts/smoke-team.ts
//
// Tests the team and role rules against your development database:
//   searching accounts, granting and revoking roles (platform-wide and per course), the
//   "you cannot grant what you do not hold" rule, the instructor listing, the last-owner
//   protection, and creating / editing / deleting custom roles.
//
// It creates throwaway users, a throwaway course and roles whose keys start with "smoke-", and
// removes them at the end. It never changes your real users or roles.
//
// Run:      npx tsx scripts/smoke-team.ts
// Clean up after a crashed run:   npx tsx scripts/smoke-team.ts --cleanup

import "dotenv/config";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
// ADJUST this import if your generator output differs
import { PrismaClient } from "@/generated/prisma/client";
import { ApiError } from "@/lib/api/errors";
import {
  createRole,
  deleteRole,
  grantRole,
  hasPermissionAnywhere,
  listAssignments,
  listRoles,
  revokeRole,
  searchUsers,
  updateRole,
} from "@/lib/staff/team";

// lib/db.ts reads DATABASE_URL; scripts normally only have DIRECT_URL
process.env.DATABASE_URL ??= process.env.DIRECT_URL;

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DIRECT_URL! }),
});

let passed = 0;
let failed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.log(
      `  FAIL  ${name}${detail !== undefined ? `  -> ${String(detail)}` : ""}`,
    );
  }
}
const section = (title: string) => console.log(`\n== ${title}`);

/** The call must fail with exactly this API error code. */
async function expectCode(
  name: string,
  code: string,
  fn: () => Promise<unknown>,
) {
  try {
    await fn();
    check(name, false, "it succeeded");
  } catch (e) {
    check(
      name,
      e instanceof ApiError && e.code === code,
      e instanceof ApiError ? e.code : String(e),
    );
  }
}

async function cleanup() {
  const users = await prisma.user.findMany({
    where: { email: { startsWith: "smoke-team-" } },
    select: { id: true },
  });
  const userIds = users.map((u) => u.id);
  const courses = await prisma.course.findMany({
    where: { slug: { startsWith: "smoke-team-" } },
    select: { id: true },
  });
  if (courses.length)
    await prisma.course.deleteMany({
      where: { id: { in: courses.map((c) => c.id) } },
    });
  if (userIds.length) {
    await prisma.auditLog.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } }); // role assignments cascade
    for (const id of userIds)
      await prisma.$executeRaw`DELETE FROM auth.users WHERE id = ${id}::uuid`;
  }
  await prisma.$executeRaw`DELETE FROM auth.users WHERE email LIKE 'smoke-team-%@example.test'`;
  // Roles last: they can only be deleted once nobody holds them
  await prisma.role.deleteMany({
    where: { key: { startsWith: "smoke-" }, isSystem: false },
  });
  console.log(
    `Cleaned up ${courses.length} course(s), ${userIds.length} user(s).`,
  );
}

async function createUser(label: string, fullName = `Smoke ${label}`) {
  const id = randomUUID();
  const email = `smoke-team-${label}-${Date.now()}@example.test`;
  const meta = JSON.stringify({
    full_name: fullName,
    phone: "+21600000000",
    country: "TN",
    locale: "ar",
    data_sharing_consent: true,
  });
  await prisma.$executeRaw`
    INSERT INTO auth.users (id, aud, role, email, raw_user_meta_data)
    VALUES (${id}::uuid, 'authenticated', 'authenticated', ${email}, ${meta}::jsonb)`;
  return { id, email };
}

async function run() {
  const { loadPermissions } = await import("@/lib/auth/permissions");

  section("Setup");
  const owner = await createUser("owner");
  const X = await createUser("x", "Smoke Xavier");
  const Y = await createUser("y");
  const Z = await createUser("z");
  const limited = await createUser("limited");
  const W = await createUser("w"); // holds ONLY the custom role, so its permissions are not masked by another role

  const roles = await listRoles(prisma);
  const role = (key: string) => roles.find((r) => r.key === key)!;
  check(
    "the four built-in roles exist (run `npx prisma db seed` if not)",
    ["owner", "instructor", "assistant", "student"].every((k) =>
      roles.some((r) => r.key === k),
    ),
  );

  // The throwaway owner holds the owner role platform-wide
  await prisma.userRole.create({
    data: { userId: owner.id, roleId: role("owner").id, courseId: null },
  });
  const ownerPerms = await loadPermissions(owner.id);
  check(
    "an owner holds every permission",
    role("owner").permissions.every((p) => ownerPerms.has(p)),
  );

  const course = await prisma.course.create({
    data: {
      slug: `smoke-team-${Date.now()}`,
      titleAr: "دورة الفريق",
      titleEn: "Team course",
      status: "PUBLISHED",
      settings: {
        create: {
          partialWeight: 1,
          allowLateSubmissions: true,
          defaultPenaltyType: "NONE",
          defaultPenaltyValue: 0,
        },
      },
    },
  });
  const otherCourse = await prisma.course.create({
    data: {
      slug: `smoke-team-other-${Date.now()}`,
      titleAr: "دورة أخرى",
      status: "DRAFT",
      settings: {
        create: {
          partialWeight: 1,
          allowLateSubmissions: true,
          defaultPenaltyType: "NONE",
          defaultPenaltyValue: 0,
        },
      },
    },
  });
  const grant = (
    userId: string,
    roleId: string,
    courseId: string | null,
    perms: ReadonlySet<string> = ownerPerms,
  ) =>
    grantRole(prisma, {
      actorId: owner.id,
      actorPerms: perms,
      userId,
      roleId,
      courseId,
    });

  // ------------------------------------------------------------------
  section("Searching accounts");
  check(
    "a name fragment finds the account",
    (await searchUsers(prisma, { q: "Xavier" })).some((u) => u.id === X.id),
  );
  check(
    "an email fragment finds it, in any letter case",
    (await searchUsers(prisma, { q: X.email.slice(0, 18).toUpperCase() })).some(
      (u) => u.id === X.id,
    ),
  );
  check(
    "one character is too short: nothing is returned",
    (await searchUsers(prisma, { q: "x" })).length === 0,
  );
  await prisma.user.update({
    where: { id: Z.id },
    data: { deletedAt: new Date() },
  });
  check(
    "a deleted account is never offered",
    !(await searchUsers(prisma, { q: Z.email.slice(0, 18) })).some(
      (u) => u.id === Z.id,
    ),
  );

  // ------------------------------------------------------------------
  section("Granting a course role");
  const g1 = await grant(X.id, role("instructor").id, course.id);
  check(
    "the instructor role is granted for the course",
    g1.outcome === "GRANTED",
  );
  check(
    "the instructor is now listed on the course's public page",
    (await prisma.courseInstructor.count({
      where: { courseId: course.id, userId: X.id },
    })) === 1,
  );
  const g2 = await grant(X.id, role("instructor").id, course.id);
  check(
    "granting it again changes nothing",
    g2.outcome === "ALREADY_ASSIGNED" && g2.id === g1.id,
  );
  check(
    "...and does not list the person twice",
    (await prisma.courseInstructor.count({
      where: { courseId: course.id, userId: X.id },
    })) === 1,
  );

  const xPerms = await loadPermissions(X.id, course.id);
  check(
    "the permissions apply to THAT course",
    xPerms.has("lecture.edit") && xPerms.has("exam.grade"),
  );
  check(
    "...and not to another course",
    !(await loadPermissions(X.id, otherCourse.id)).has("lecture.edit"),
  );
  check(
    "...and not platform-wide",
    !(await loadPermissions(X.id)).has("lecture.edit"),
  );
  check(
    "a course instructor does not get user.manage",
    !xPerms.has("user.manage"),
  );

  await expectCode("the student role cannot be granted", "INVALID_ROLE", () =>
    grant(Y.id, role("student").id, null),
  );
  await expectCode("an unknown account is refused", "USER_NOT_FOUND", () =>
    grant(randomUUID(), role("assistant").id, null),
  );
  await expectCode("a deleted account is refused", "USER_NOT_FOUND", () =>
    grant(Z.id, role("assistant").id, null),
  );
  await expectCode("an unknown course is refused", "NOT_FOUND", () =>
    grant(Y.id, role("assistant").id, randomUUID()),
  );
  await expectCode("an unknown role is refused", "NOT_FOUND", () =>
    grant(Y.id, randomUUID(), null),
  );

  // ------------------------------------------------------------------
  section("The rule: you cannot grant what you do not hold");
  const limitedRole = await createRole(prisma, {
    actorId: owner.id,
    actorPerms: ownerPerms,
    key: "smoke-limited",
    name: "Smoke limited",
    permissions: ["user.manage", "course.edit"],
  });
  await grant(limited.id, limitedRole.id, course.id);
  const limitedPerms = await loadPermissions(limited.id, course.id);
  check(
    "the limited manager can manage the team of this course only",
    limitedPerms.has("user.manage") &&
      !(await loadPermissions(limited.id, otherCourse.id)).has("user.manage"),
  );
  check(
    "hasPermissionAnywhere is true for a course-scoped manager",
    await hasPermissionAnywhere(prisma, limited.id, "user.manage"),
  );
  check(
    "...and false for someone who cannot manage users",
    !(await hasPermissionAnywhere(prisma, X.id, "user.manage")),
  );

  await expectCode(
    "they cannot grant the instructor role (it carries more than they hold)",
    "PERMISSION_ESCALATION",
    () => grant(Y.id, role("instructor").id, course.id, limitedPerms),
  );
  await expectCode(
    "they cannot grant the owner role",
    "PERMISSION_ESCALATION",
    () => grant(Y.id, role("owner").id, course.id, limitedPerms),
  );
  const own = await grant(Y.id, limitedRole.id, course.id, limitedPerms);
  check(
    "they CAN grant a role within their own rights",
    own.outcome === "GRANTED",
  );
  await expectCode(
    "they cannot revoke a role above their rights",
    "PERMISSION_ESCALATION",
    async () => {
      await revokeRole(prisma, {
        actorId: limited.id,
        actorPerms: limitedPerms,
        assignmentId: g1.id,
      });
    },
  );

  // ------------------------------------------------------------------
  section("Platform-wide roles and revoking");
  const org = await grant(Y.id, role("assistant").id, null);
  check(
    "an assistant role can be granted platform-wide",
    org.outcome === "GRANTED",
  );
  const all = await listAssignments(prisma);
  check(
    "the list shows platform-wide and course assignments",
    all.some((a) => a.id === org.id && a.course === null) &&
      all.some((a) => a.id === g1.id && a.course?.id === course.id),
  );
  check(
    "the course list shows only that course",
    (await listAssignments(prisma, { courseId: course.id })).every(
      (a) => a.course?.id === course.id,
    ),
  );
  check(
    "the student role never appears in the list",
    !all.some((a) => a.role.key === "student"),
  );

  await expectCode(
    "the last listed instructor of a published course cannot be removed",
    "COURSE_NOT_READY",
    () =>
      revokeRole(prisma, {
        actorId: owner.id,
        actorPerms: ownerPerms,
        assignmentId: g1.id,
      }),
  );
  const y2 = await grant(Y.id, role("instructor").id, course.id);
  await revokeRole(prisma, {
    actorId: owner.id,
    actorPerms: ownerPerms,
    assignmentId: g1.id,
  });
  check(
    "with a second instructor, the first can be removed",
    (await prisma.userRole.count({ where: { id: g1.id } })) === 0,
  );
  check(
    "...and is taken off the public page",
    (await prisma.courseInstructor.count({
      where: { courseId: course.id, userId: X.id },
    })) === 0,
  );
  check(
    "...and loses the course permissions",
    !(await loadPermissions(X.id, course.id)).has("lecture.edit"),
  );
  check(
    "the other instructor stays listed",
    (await prisma.courseInstructor.count({
      where: { courseId: course.id, userId: Y.id },
    })) === 1 && y2.outcome === "GRANTED",
  );
  await expectCode(
    "revoking an assignment that does not exist",
    "NOT_FOUND",
    () =>
      revokeRole(prisma, {
        actorId: owner.id,
        actorPerms: ownerPerms,
        assignmentId: randomUUID(),
      }),
  );

  section("The last owner");
  const ownerCount = await prisma.userRole.count({
    where: { courseId: null, role: { key: "owner" } },
  });
  const ownerAssignment = await prisma.userRole.findFirstOrThrow({
    where: { userId: owner.id, courseId: null, role: { key: "owner" } },
  });
  if (ownerCount >= 2) {
    await revokeRole(prisma, {
      actorId: owner.id,
      actorPerms: ownerPerms,
      assignmentId: ownerAssignment.id,
    });
    check(
      "with other owners present, an owner can be removed",
      (await prisma.userRole.count({ where: { id: ownerAssignment.id } })) ===
        0,
    );
    await prisma.userRole.create({
      data: { userId: owner.id, roleId: role("owner").id, courseId: null },
    });
  } else {
    await expectCode("the only owner cannot be removed", "LAST_OWNER", () =>
      revokeRole(prisma, {
        actorId: owner.id,
        actorPerms: ownerPerms,
        assignmentId: ownerAssignment.id,
      }),
    );
  }

  // ------------------------------------------------------------------
  section("Creating roles");
  const grader = await createRole(prisma, {
    actorId: owner.id,
    actorPerms: ownerPerms,
    key: "smoke-grader",
    name: "Grader",
    permissions: ["submission.view", "submission.grade"],
  });
  check(
    "a custom role is created with its permissions",
    (await listRoles(prisma))
      .find((r) => r.id === grader.id)
      ?.permissions.join() === "submission.grade,submission.view",
  );
  await expectCode("a reserved key is refused", "INVALID_ROLE_KEY", () =>
    createRole(prisma, {
      actorId: owner.id,
      actorPerms: ownerPerms,
      key: "owner",
      name: "x1",
      permissions: [],
    }),
  );
  await expectCode("a badly shaped key is refused", "INVALID_ROLE_KEY", () =>
    createRole(prisma, {
      actorId: owner.id,
      actorPerms: ownerPerms,
      key: "Bad Key",
      name: "x2",
      permissions: [],
    }),
  );
  await expectCode("a duplicate key is refused", "ROLE_KEY_TAKEN", () =>
    createRole(prisma, {
      actorId: owner.id,
      actorPerms: ownerPerms,
      key: "smoke-grader",
      name: "Again",
      permissions: [],
    }),
  );
  await expectCode(
    "an unknown permission is refused",
    "INVALID_PERMISSIONS",
    () =>
      createRole(prisma, {
        actorId: owner.id,
        actorPerms: ownerPerms,
        key: "smoke-bad",
        name: "Bad",
        permissions: ["made.up"],
      }),
  );
  await expectCode(
    "a role cannot carry permissions its creator lacks",
    "PERMISSION_ESCALATION",
    () =>
      createRole(prisma, {
        actorId: limited.id,
        actorPerms: limitedPerms,
        key: "smoke-esc",
        name: "Esc",
        permissions: ["exam.grade"],
      }),
  );

  // ------------------------------------------------------------------
  section("Editing roles");
  await grant(W.id, grader.id, course.id);
  await updateRole(prisma, {
    actorId: owner.id,
    actorPerms: ownerPerms,
    roleId: grader.id,
    permissions: ["submission.view", "submission.grade", "exam.grade"],
  });
  check(
    "adding a permission to a role reaches everyone who holds it",
    (await loadPermissions(W.id, course.id)).has("exam.grade"),
  );
  await updateRole(prisma, {
    actorId: owner.id,
    actorPerms: ownerPerms,
    roleId: grader.id,
    permissions: ["submission.view"],
  });
  check(
    "removing permissions takes effect too",
    !(await loadPermissions(W.id, course.id)).has("submission.grade") &&
      (await loadPermissions(W.id, course.id)).has("submission.view"),
  );
  await updateRole(prisma, {
    actorId: owner.id,
    actorPerms: ownerPerms,
    roleId: grader.id,
    name: "Senior grader",
  });
  check(
    "a custom role can be renamed",
    (await listRoles(prisma)).find((r) => r.id === grader.id)?.name ===
      "Senior grader",
  );
  await expectCode("the owner role cannot be edited", "ROLE_LOCKED", () =>
    updateRole(prisma, {
      actorId: owner.id,
      actorPerms: ownerPerms,
      roleId: role("owner").id,
      permissions: [],
    }),
  );
  await expectCode(
    "the student role cannot gain permissions",
    "ROLE_LOCKED",
    () =>
      updateRole(prisma, {
        actorId: owner.id,
        actorPerms: ownerPerms,
        roleId: role("student").id,
        permissions: ["course.edit"],
      }),
  );
  await expectCode("a built-in role cannot be renamed", "ROLE_LOCKED", () =>
    updateRole(prisma, {
      actorId: owner.id,
      actorPerms: ownerPerms,
      roleId: role("assistant").id,
      name: "Renamed",
    }),
  );
  await expectCode(
    "someone cannot add a permission they lack to a role",
    "PERMISSION_ESCALATION",
    () =>
      updateRole(prisma, {
        actorId: limited.id,
        actorPerms: limitedPerms,
        roleId: grader.id,
        permissions: ["submission.view", "certificate.export"],
      }),
  );
  await expectCode(
    "an unknown permission is refused when editing",
    "INVALID_PERMISSIONS",
    () =>
      updateRole(prisma, {
        actorId: owner.id,
        actorPerms: ownerPerms,
        roleId: grader.id,
        permissions: ["nope"],
      }),
  );

  // ------------------------------------------------------------------
  section("Deleting roles");
  await expectCode(
    "a role that people hold cannot be deleted",
    "ROLE_IN_USE",
    () => deleteRole(prisma, { actorId: owner.id, roleId: grader.id }),
  );
  await expectCode("a built-in role cannot be deleted", "ROLE_LOCKED", () =>
    deleteRole(prisma, { actorId: owner.id, roleId: role("assistant").id }),
  );
  const heldGrader = await prisma.userRole.findFirstOrThrow({
    where: { userId: W.id, roleId: grader.id },
  });
  await revokeRole(prisma, {
    actorId: owner.id,
    actorPerms: ownerPerms,
    assignmentId: heldGrader.id,
  });
  await deleteRole(prisma, { actorId: owner.id, roleId: grader.id });
  check(
    "once nobody holds it, a custom role can be deleted",
    (await prisma.role.count({ where: { id: grader.id } })) === 0,
  );

  // ------------------------------------------------------------------
  section("Audit trail");
  const grants = await prisma.auditLog.count({
    where: { actorId: owner.id, action: "user.role.grant" },
  });
  const revokes = await prisma.auditLog.count({
    where: { actorId: owner.id, action: "user.role.revoke" },
  });
  const roleEdits = await prisma.auditLog.count({
    where: {
      actorId: owner.id,
      action: { in: ["role.create", "role.update", "role.delete"] },
    },
  });
  check(
    "every grant, revoke and role change was recorded",
    grants >= 4 && revokes >= 2 && roleEdits >= 4,
    `grants=${grants} revokes=${revokes} roleEdits=${roleEdits}`,
  );
  check(
    "a repeated grant was NOT recorded twice",
    (await prisma.auditLog.count({
      where: { actorId: owner.id, action: "user.role.grant", entityId: X.id },
    })) === 1,
  );
}

async function main() {
  if (process.argv.includes("--cleanup")) {
    await cleanup();
    await prisma.$disconnect();
    return;
  }
  try {
    await run();
  } catch (e) {
    failed++;
    failures.push("crashed");
    console.error("\nThe test crashed:", e);
  } finally {
    await cleanup().catch((e) => console.error("cleanup failed:", e));
  }
  console.log(`\n${passed} passed, ${failed} failed`);
  if (failures.length) console.log("Failed:\n - " + failures.join("\n - "));
  await prisma.$disconnect();
  process.exit(failed ? 1 : 0);
}

main();
