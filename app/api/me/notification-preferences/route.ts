import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { json, parseJson, route } from "@/lib/api/handler";
import { setEmailPreference } from "@/lib/notifications/service";

const body = z.object({ email: z.boolean() }).strict();

/** Turn email notifications on or off for the signed-in person. */
export const PUT = route(async (req) => {
  const user = await requireUser();
  const { email } = await parseJson(req, body);
  const row = await setEmailPreference(db, { userId: user.id, enabled: email });
  return json({ email: row.emailNotifications });
});
