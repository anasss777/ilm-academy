// lib/notifications/service.ts
// Reading and managing a student's own notifications.
// Every function takes the userId of the SIGNED-IN user from the session: a person can only ever
// read or mark their own notifications.

// ADJUST this import to your generator `output` path (same as the other files).
import type { PrismaClient } from "@/generated/prisma/client";

export async function listNotifications(
  db: PrismaClient,
  args: { userId: string; page: number; pageSize: number },
) {
  const { userId, page, pageSize } = args;
  const [total, unread, items] = await Promise.all([
    db.notification.count({ where: { userId } }),
    db.notification.count({ where: { userId, readAt: null } }),
    db.notification.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: { id: true, type: true, payload: true, readAt: true, createdAt: true },
    }),
  ]);
  return { total, unread, items };
}

export const countUnread = (db: PrismaClient, userId: string) =>
  db.notification.count({ where: { userId, readAt: null } });

/** Mark some (or all) of the person's notifications as read. Others' ids are simply ignored. */
export async function markRead(
  db: PrismaClient,
  args: { userId: string; ids?: string[]; all?: boolean; now?: Date },
) {
  const { userId } = args;
  const readAt = args.now ?? new Date();
  if (!args.all && (!args.ids || args.ids.length === 0)) return { updated: 0 };
  const result = await db.notification.updateMany({
    where: { userId, readAt: null, ...(args.all ? {} : { id: { in: args.ids } }) },
    data: { readAt },
  });
  return { updated: result.count };
}

export const setEmailPreference = (db: PrismaClient, args: { userId: string; enabled: boolean }) =>
  db.user.update({
    where: { id: args.userId },
    data: { emailNotifications: args.enabled },
    select: { emailNotifications: true },
  });

/** Old notifications are not kept forever: read ones for 90 days, anything for 180. */
export async function purgeOldNotifications(db: PrismaClient, now: Date = new Date()) {
  const day = 24 * 60 * 60 * 1000;
  const [read, any] = await Promise.all([
    db.notification.deleteMany({ where: { readAt: { not: null }, createdAt: { lt: new Date(now.getTime() - 90 * day) } } }),
    db.notification.deleteMany({ where: { createdAt: { lt: new Date(now.getTime() - 180 * day) } } }),
  ]);
  return { deleted: read.count + any.count };
}
