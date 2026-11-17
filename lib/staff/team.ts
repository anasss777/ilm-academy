// lib/staff/team.ts
// Who is on the team, which roles exist, and who may do what.
//
// Safety rules enforced here (not just in the screens):
//   - you can only grant or revoke a role whose permissions you hold yourself
//   - you can only put permissions into a role that you hold yourself
//   - the last organization-wide owner cannot be removed
//   - the "owner" role cannot be edited, system roles cannot be deleted or renamed,
//     and a role that people hold cannot be deleted
//   - a published course always keeps at least one listed instructor

// ADJUST this import to your generator `output` path (same as the other files).
import type { PrismaClient } from "@/generated/prisma/client";
import { ApiError } from "../api/errors";
import { audit, inTx, isUniqueViolation } from "./common";
import {
  SYSTEM_ROLE_KEYS,
  diffPermissions,
  isLastOwner,
  isValidCustomRoleKey,
  missingPermissions,
  unknownPermissions,
} from "./team-rules";

type PermSet = ReadonlySet<string>;

const rolePermissionKeys = (r: { permissions: { permission: { key: string } }[] }) =>
  r.permissions.map((p) => p.permission.key);

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** Accounts matching a name or email, for the "add a team member" picker. */
export async function searchUsers(db: PrismaClient, args: { q: string; limit?: number }) {
  const q = args.q.trim();
  if (q.length < 2) return [];
  return db.user.findMany({
    where: {
      deletedAt: null,
      status: "ACTIVE",
      OR: [
        { email: { contains: q, mode: "insensitive" } },
        { fullName: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { fullName: "asc" },
    take: args.limit ?? 10,
    select: { id: true, fullName: true, email: true },
  });
}

/** Does this person hold the permission in ANY scope (organization-wide or in some course)? */
export async function hasPermissionAnywhere(db: PrismaClient, userId: string, key: string) {
  const row = await db.userRole.findFirst({
    where: { userId, role: { permissions: { some: { permission: { key } } } } },
    select: { id: true },
  });
  return row != null;
}

export async function listRoles(db: PrismaClient) {
  const rows = await db.role.findMany({
    select: {
      id: true,
      key: true,
      name: true,
      isSystem: true,
      permissions: { select: { permission: { select: { key: true } } } },
      _count: { select: { userRoles: true } },
    },
  });
  const order = (key: string) => {
    const i = (SYSTEM_ROLE_KEYS as readonly string[]).indexOf(key);
    return i === -1 ? SYSTEM_ROLE_KEYS.length : i;
  };
  return rows
    .map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      isSystem: r.isSystem,
      permissions: rolePermissionKeys(r).sort(),
      members: r._count.userRoles,
    }))
    .sort((a, b) => order(a.key) - order(b.key) || a.name.localeCompare(b.name));
}

/** Role assignments (not "student"), for the whole platform or one course. */
export async function listAssignments(db: PrismaClient, args: { courseId?: string } = {}) {
  return db.userRole.findMany({
    where: { role: { key: { not: "student" } }, ...(args.courseId ? { courseId: args.courseId } : {}) },
    orderBy: { createdAt: "asc" },
    take: 500,
    select: {
      id: true,
      createdAt: true,
      user: { select: { id: true, fullName: true, email: true, status: true } },
      role: { select: { id: true, key: true, name: true } },
      course: { select: { id: true, titleAr: true, titleEn: true } },
    },
  });
}

// ---------------------------------------------------------------------------
// Granting and revoking roles
// ---------------------------------------------------------------------------

export async function grantRole(
  db: PrismaClient,
  args: { actorId: string; actorPerms: PermSet; userId: string; roleId: string; courseId: string | null },
) {
  const { actorId, actorPerms, userId, roleId, courseId } = args;

  const role = await db.role.findUnique({
    where: { id: roleId },
    select: { id: true, key: true, permissions: { select: { permission: { select: { key: true } } } } },
  });
  if (!role) throw new ApiError(404, "NOT_FOUND");
  if (role.key === "student") throw new ApiError(422, "INVALID_ROLE");
  if (missingPermissions(actorPerms, rolePermissionKeys(role)).length > 0) {
    throw new ApiError(403, "PERMISSION_ESCALATION");
  }

  const target = await db.user.findFirst({ where: { id: userId, deletedAt: null, status: "ACTIVE" }, select: { id: true } });
  if (!target) throw new ApiError(404, "USER_NOT_FOUND");
  if (courseId) {
    const course = await db.course.findUnique({ where: { id: courseId }, select: { id: true } });
    if (!course) throw new ApiError(404, "NOT_FOUND");
  }

  const run = () =>
    inTx(db, async (tx) => {
      const existing = await tx.userRole.findFirst({ where: { userId, roleId, courseId }, select: { id: true } });
      const id = existing
        ? existing.id
        : (await tx.userRole.create({ data: { userId, roleId, courseId, grantedById: actorId }, select: { id: true } })).id;

      // An instructor of a course is also listed on its public page
      if (courseId && role.key === "instructor") {
        const listed = await tx.courseInstructor.findUnique({ where: { courseId_userId: { courseId, userId } } });
        if (!listed) {
          const max = await tx.courseInstructor.aggregate({ where: { courseId }, _max: { displayOrder: true } });
          await tx.courseInstructor.create({
            data: { courseId, userId, displayOrder: (max._max.displayOrder ?? -1) + 1 },
          });
        }
      }
      if (!existing) {
        await audit(tx, {
          actorId, action: "user.role.grant", entityType: "User", entityId: userId,
          metadata: { roleKey: role.key, courseId },
        });
      }
      return { outcome: existing ? ("ALREADY_ASSIGNED" as const) : ("GRANTED" as const), id };
    });

  try {
    return await run();
  } catch (e) {
    // Two people granting the same role at the same moment: the second one just finds it there
    if (!isUniqueViolation(e)) throw e;
    const existing = await db.userRole.findFirst({ where: { userId, roleId, courseId }, select: { id: true } });
    if (!existing) throw e;
    return { outcome: "ALREADY_ASSIGNED" as const, id: existing.id };
  }
}

export async function revokeRole(
  db: PrismaClient,
  args: { actorId: string; actorPerms: PermSet; assignmentId: string },
) {
  const { actorId, actorPerms, assignmentId } = args;

  const a = await db.userRole.findUnique({
    where: { id: assignmentId },
    select: {
      id: true,
      userId: true,
      courseId: true,
      role: { select: { key: true, permissions: { select: { permission: { select: { key: true } } } } } },
    },
  });
  if (!a) throw new ApiError(404, "NOT_FOUND");
  if (missingPermissions(actorPerms, rolePermissionKeys(a.role)).length > 0) {
    throw new ApiError(403, "PERMISSION_ESCALATION");
  }

  return inTx(db, async (tx) => {
    if (a.role.key === "owner" && a.courseId === null) {
      const owners = await tx.userRole.count({ where: { courseId: null, role: { key: "owner" } } });
      if (isLastOwner(owners)) throw new ApiError(409, "LAST_OWNER");
    }

    // Taking an instructor off a course also takes them off its public page
    if (a.courseId && a.role.key === "instructor") {
      const listed = await tx.courseInstructor.findUnique({
        where: { courseId_userId: { courseId: a.courseId, userId: a.userId } },
      });
      if (listed) {
        const course = await tx.course.findUnique({ where: { id: a.courseId }, select: { status: true } });
        const listedCount = await tx.courseInstructor.count({ where: { courseId: a.courseId } });
        if (course?.status === "PUBLISHED" && listedCount <= 1) {
          throw new ApiError(422, "COURSE_NOT_READY", "instructor");
        }
        await tx.courseInstructor.delete({ where: { courseId_userId: { courseId: a.courseId, userId: a.userId } } });
      }
    }

    await tx.userRole.delete({ where: { id: a.id } });
    await audit(tx, {
      actorId, action: "user.role.revoke", entityType: "User", entityId: a.userId,
      metadata: { roleKey: a.role.key, courseId: a.courseId },
    });
    return { id: a.id };
  });
}

// ---------------------------------------------------------------------------
// Roles and their permissions
// ---------------------------------------------------------------------------

export async function createRole(
  db: PrismaClient,
  args: { actorId: string; actorPerms: PermSet; key: string; name: string; permissions: string[] },
) {
  const key = args.key.trim().toLowerCase();
  const permissions = [...new Set(args.permissions)];
  if (!isValidCustomRoleKey(key)) throw new ApiError(422, "INVALID_ROLE_KEY");
  if (unknownPermissions(permissions).length > 0) throw new ApiError(422, "INVALID_PERMISSIONS");
  if (missingPermissions(args.actorPerms, permissions).length > 0) throw new ApiError(403, "PERMISSION_ESCALATION");

  return inTx(db, async (tx) => {
    const rows = await tx.permission.findMany({ where: { key: { in: permissions } }, select: { id: true } });
    if (rows.length !== permissions.length) throw new ApiError(422, "INVALID_PERMISSIONS");
    let role;
    try {
      role = await tx.role.create({
        data: {
          key,
          name: args.name.trim(),
          isSystem: false,
          permissions: { create: rows.map((p) => ({ permissionId: p.id })) },
        },
        select: { id: true, key: true },
      });
    } catch (e) {
      if (isUniqueViolation(e)) throw new ApiError(409, "ROLE_KEY_TAKEN");
      throw e;
    }
    await audit(tx, {
      actorId: args.actorId, action: "role.create", entityType: "Role", entityId: role.id,
      metadata: { key, permissions },
    });
    return role;
  });
}

export async function updateRole(
  db: PrismaClient,
  args: { actorId: string; actorPerms: PermSet; roleId: string; name?: string; permissions?: string[] },
) {
  const role = await db.role.findUnique({
    where: { id: args.roleId },
    select: { id: true, key: true, isSystem: true, permissions: { select: { permission: { select: { key: true } } } } },
  });
  if (!role) throw new ApiError(404, "NOT_FOUND");
  // Owner always has everything; student must never gain permissions (every student holds it)
  if ((role.key === "owner" || role.key === "student") && args.permissions !== undefined) {
    throw new ApiError(409, "ROLE_LOCKED");
  }
  if (role.isSystem && args.name !== undefined) throw new ApiError(409, "ROLE_LOCKED");

  const current = rolePermissionKeys(role);
  const next = args.permissions ? [...new Set(args.permissions)] : null;
  if (next) {
    if (unknownPermissions(next).length > 0) throw new ApiError(422, "INVALID_PERMISSIONS");
    // Nobody may put into a role something they do not hold themselves
    if (missingPermissions(args.actorPerms, diffPermissions(current, next).added).length > 0) {
      throw new ApiError(403, "PERMISSION_ESCALATION");
    }
  }

  return inTx(db, async (tx) => {
    if (args.name !== undefined) {
      await tx.role.update({ where: { id: role.id }, data: { name: args.name.trim() } });
    }
    if (next) {
      const rows = await tx.permission.findMany({ where: { key: { in: next } }, select: { id: true } });
      if (rows.length !== next.length) throw new ApiError(422, "INVALID_PERMISSIONS");
      await tx.rolePermission.deleteMany({ where: { roleId: role.id } });
      if (rows.length) {
        await tx.rolePermission.createMany({ data: rows.map((p) => ({ roleId: role.id, permissionId: p.id })) });
      }
    }
    await audit(tx, {
      actorId: args.actorId, action: "role.update", entityType: "Role", entityId: role.id,
      metadata: { key: role.key, ...(next ? diffPermissions(current, next) : {}), ...(args.name !== undefined ? { name: args.name } : {}) },
    });
    return { id: role.id, permissions: next ?? current };
  });
}

export async function deleteRole(db: PrismaClient, args: { actorId: string; roleId: string }) {
  const role = await db.role.findUnique({
    where: { id: args.roleId },
    select: { id: true, key: true, isSystem: true, _count: { select: { userRoles: true } } },
  });
  if (!role) throw new ApiError(404, "NOT_FOUND");
  if (role.isSystem) throw new ApiError(409, "ROLE_LOCKED");
  if (role._count.userRoles > 0) throw new ApiError(409, "ROLE_IN_USE");

  return inTx(db, async (tx) => {
    await tx.role.delete({ where: { id: role.id } });
    await audit(tx, { actorId: args.actorId, action: "role.delete", entityType: "Role", entityId: role.id, metadata: { key: role.key } });
    return { id: role.id };
  });
}
