// lib/validation/team.ts
import { z } from "zod";

const uuid = z.string().uuid();

export const searchUsersQuery = z.object({ q: z.string().trim().min(2).max(100) });

export const grantRoleSchema = z
  .object({ userId: uuid, roleId: uuid, courseId: uuid.nullish() })
  .strict();

const permissionList = z.array(z.string().max(60)).max(64);

export const createRoleSchema = z
  .object({
    key: z.string().trim().min(3).max(30),
    name: z.string().trim().min(2).max(60),
    permissions: permissionList,
  })
  .strict();

export const updateRoleSchema = z
  .object({
    name: z.string().trim().min(2).max(60).optional(),
    permissions: permissionList.optional(),
  })
  .strict()
  .refine((v) => v.name !== undefined || v.permissions !== undefined, { message: "Nothing to update" });
