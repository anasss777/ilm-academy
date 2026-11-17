import { z } from "zod";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { json, parseJson, route } from "@/lib/api/handler";
import { markRead } from "@/lib/notifications/service";

const body = z
  .object({
    ids: z.array(z.string().uuid()).max(100).optional(),
    all: z.boolean().optional(),
  })
  .strict();

/** Mark some (ids) or all of the signed-in person's notifications as read. */
export const POST = route(async (req) => {
  const user = await requireUser();
  const input = await parseJson(req, body);
  return json(await markRead(db, { userId: user.id, ids: input.ids, all: input.all }));
});
