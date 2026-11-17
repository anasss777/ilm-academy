// lib/staff/common.ts
// Helpers shared by the staff services.

// ADJUST this import to your generator `output` path (same as the other files).
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import { syncCertificateReviews, TX_OPTIONS } from "../eligibility/loader";

export type Db = PrismaClient | Prisma.TransactionClient;

export const inTx = <T>(db: PrismaClient, fn: (tx: Prisma.TransactionClient) => Promise<T>) =>
  db.$transaction(fn, TX_OPTIONS);

export const isUniqueViolation = (e: unknown) => (e as { code?: string } | null)?.code === "P2002";

export const validTimezone = (tz: string) => {
  try {
    new Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
};

/** Re-sync certificate reviews. A failure here must never fail the change that already succeeded. */
export async function safeSync(db: PrismaClient, courseId: string, userIds?: string[]) {
  if (userIds && userIds.length === 0) return;
  try {
    await syncCertificateReviews(db, courseId, userIds ? { userIds } : {});
  } catch (err) {
    console.error("[staff] certificate sync failed", { courseId, err });
  }
}

export async function audit(
  db: Db,
  e: { actorId: string; action: string; entityType: string; entityId: string; metadata?: Prisma.InputJsonValue },
) {
  await db.auditLog.create({
    data: {
      actorId: e.actorId,
      action: e.action,
      entityType: e.entityType,
      entityId: e.entityId,
      metadata: e.metadata ?? {},
    },
  });
}

const REQUIRED_TEXT = new Set(["titleAr", "language"]);

/**
 * Turn request fields into column values: undefined = untouched, blank strings = NULL
 * (except the required ones), everything else passes through.
 */
export function normalizeFields(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (typeof v === "string") out[k] = REQUIRED_TEXT.has(k) ? v.trim() : v.trim() || null;
    else out[k] = v;
  }
  return out;
}
