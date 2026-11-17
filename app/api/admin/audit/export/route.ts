import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { requirePermission } from "@/lib/auth/permissions";
import { route } from "@/lib/api/handler";
import { parseAuditFilter } from "@/lib/staff/audit-filter";
import { buildAuditCsv } from "@/lib/staff/audit-log";
import { audit } from "@/lib/staff/common";

/** The audit log with the screen's current filters, as CSV. Downloading it is itself logged. */
export const GET = route(async (req) => {
  const user = await requireUser();
  await requirePermission(user, "audit.view");

  const params = Object.fromEntries(new URL(req.url).searchParams) as Record<string, string>;
  const { filter, query } = parseAuditFilter(params, user.timezone);
  const { csv, count } = await buildAuditCsv(db, filter, 5000);

  await audit(db, {
    actorId: user.id,
    action: "audit.export",
    entityType: "AuditLog",
    entityId: user.id,
    metadata: { rows: count, filters: query },
  });

  const day = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="audit-log-${day}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
});
