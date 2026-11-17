import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { enforceRateLimit } from "@/lib/ratelimit/ratelimit";
import { requirePermission } from "@/lib/auth/permissions";
import { route, uuidParam } from "@/lib/api/handler";
import { courseIdOfCertificateExport } from "@/lib/api/resolve";
import { getCertificateExportCsv } from "@/lib/staff/queues";

/** The stored snapshot as CSV (UTF-8 with BOM, formulas neutralized). Audit-logged. */
export const GET = route<{ exportId: string }>(async (_req, { params }) => {
  const user = await requireUser();
  await enforceRateLimit(db, { scope: "export-download", subject: user.id, limit: 10, windowSeconds: 60 });
  const exportId = uuidParam(params.exportId);
  await requirePermission(user, "certificate.export", await courseIdOfCertificateExport(exportId));
  const { csv, filename } = await getCertificateExportCsv(db, { exportId, actorId: user.id });
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "private, no-store",
    },
  });
});
