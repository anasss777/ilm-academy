// lib/staff/team-rules.ts
// The rules of who may grant what. Pure (no database), so they are unit-tested.
//
// The principle: you can never hand out, or take away, more than you hold yourself.
// Otherwise a person who may manage staff could make themselves (or a friend) an owner.

import { PERMISSION_KEYS } from "../auth/permission-keys";

/** Roles created by the seed. They cannot be deleted, and "owner" cannot be edited at all. */
export const SYSTEM_ROLE_KEYS = ["owner", "instructor", "assistant", "student"] as const;

const ROLE_KEY_PATTERN = /^[a-z][a-z0-9_-]{2,29}$/;

/** A key for a NEW custom role: lowercase, 3-30 characters, and not one of the system keys. */
export const isValidCustomRoleKey = (key: string) =>
  ROLE_KEY_PATTERN.test(key) && !(SYSTEM_ROLE_KEYS as readonly string[]).includes(key);

/** Anything in `keys` that is not a real permission. */
export function unknownPermissions(keys: readonly string[]): string[] {
  const known = new Set<string>(PERMISSION_KEYS);
  return keys.filter((k) => !known.has(k));
}

/** The permissions in `wanted` that the actor does not hold (empty = allowed). */
export function missingPermissions(actorPerms: ReadonlySet<string>, wanted: readonly string[]): string[] {
  return wanted.filter((p) => !actorPerms.has(p));
}

export function diffPermissions(current: readonly string[], next: readonly string[]) {
  const cur = new Set(current);
  const nxt = new Set(next);
  return {
    added: [...nxt].filter((p) => !cur.has(p)),
    removed: [...cur].filter((p) => !nxt.has(p)),
  };
}

/** True when removing one more organization-wide owner would leave nobody in charge. */
export const isLastOwner = (ownerAssignmentCount: number) => ownerAssignmentCount <= 1;

/** Roles the actor may hand out: never "student" (it carries nothing), and nothing above their own rights. */
export function grantableRoles<T extends { key: string; permissions: readonly string[] }>(
  roles: readonly T[],
  actorPerms: ReadonlySet<string>,
): T[] {
  return roles.filter((r) => r.key !== "student" && missingPermissions(actorPerms, r.permissions).length === 0);
}
