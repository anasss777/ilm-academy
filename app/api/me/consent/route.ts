import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { json, parseJson, route } from "@/lib/api/handler";

const body = z.object({ granted: z.boolean() });

/** Grant or withdraw consent to share data with the third-party certificate organization. */
export const PUT = route(async (req) => {
  const user = await requireUser();
  const { granted } = await parseJson(req, body);

  const updated = await db.$transaction(async (tx) => {
    const row = await tx.user.update({
      where: { id: user.id },
      data: { dataSharingConsentAt: granted ? new Date() : null },
      select: { dataSharingConsentAt: true },
    });
    // Consent is a privacy decision: keep a record of every change
    await tx.auditLog.create({
      data: {
        actorId: user.id,
        action: granted ? "user.consent.grant" : "user.consent.withdraw",
        entityType: "User",
        entityId: user.id,
        metadata: {},
      },
    });
    return row;
  });
  return json({ granted: updated.dataSharingConsentAt != null, at: updated.dataSharingConsentAt });
});
