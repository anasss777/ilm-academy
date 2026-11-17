// lib/staff/audit-log.ts
// Reading the audit trail (it is only ever written by the application, never edited here).

// ADJUST this import to your generator `output` path (same as the other files).
import type { Prisma, PrismaClient } from "@/generated/prisma/client";
import type { AuditFilter } from "./audit-filter";
import { toCsv } from "./csv";

function buildWhere(f: AuditFilter): Prisma.AuditLogWhereInput {
  const and: Prisma.AuditLogWhereInput[] = [];
  if (f.area) and.push({ action: { startsWith: `${f.area}.` } });
  if (f.entityType) and.push({ entityType: f.entityType });
  if (f.entityId) and.push({ entityId: f.entityId });
  if (f.actorId) and.push({ actorId: f.actorId });
  if (f.from) and.push({ createdAt: { gte: f.from } });
  if (f.toExclusive) and.push({ createdAt: { lt: f.toExclusive } });
  if (f.q) {
    and.push({
      OR: [
        { action: { contains: f.q, mode: "insensitive" } },
        { entityId: { contains: f.q, mode: "insensitive" } },
        { actor: { is: { OR: [{ fullName: { contains: f.q, mode: "insensitive" } }, { email: { contains: f.q, mode: "insensitive" } }] } } },
      ],
    });
  }
  return and.length ? { AND: and } : {};
}

const SELECT = {
  id: true,
  createdAt: true,
  action: true,
  entityType: true,
  entityId: true,
  metadata: true,
  ip: true,
  actor: { select: { id: true, fullName: true, email: true } },
} satisfies Prisma.AuditLogSelect;

export async function listAuditLog(
  db: PrismaClient,
  args: { filter: AuditFilter; page: number; pageSize: number },
) {
  const where = buildWhere(args.filter);
  const [total, items] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (args.page - 1) * args.pageSize,
      take: args.pageSize,
      select: SELECT,
    }),
  ]);
  return { total, items };
}

/** The entity types that appear in the log, for the filter menu. */
export async function listAuditEntityTypes(db: PrismaClient): Promise<string[]> {
  const rows = await db.auditLog.groupBy({ by: ["entityType"], orderBy: { entityType: "asc" } });
  return rows.map((r) => r.entityType);
}

/** The filtered log as CSV (newest first), capped. Times are UTC ISO so the file is unambiguous. */
export async function buildAuditCsv(db: PrismaClient, filter: AuditFilter, limit = 5000) {
  const rows = await db.auditLog.findMany({
    where: buildWhere(filter),
    orderBy: { createdAt: "desc" },
    take: limit,
    select: SELECT,
  });
  const csv = toCsv(
    ["time_utc", "actor_name", "actor_email", "action", "entity_type", "entity_id", "ip", "details"],
    rows.map((r) => [
      r.createdAt.toISOString(),
      r.actor?.fullName ?? "",
      r.actor?.email ?? "",
      r.action,
      r.entityType,
      r.entityId,
      r.ip ?? "",
      JSON.stringify(r.metadata ?? {}).slice(0, 2000),
    ]),
  );
  return { csv, count: rows.length };
}
