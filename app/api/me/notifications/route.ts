import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { PRIVATE, json, route } from "@/lib/api/handler";
import { countUnread } from "@/lib/notifications/service";

/** The signed-in person's unread count (for anything that wants to poll it). */
export const GET = route(async () => {
  const user = await requireUser();
  return json({ unread: await countUnread(db, user.id) }, 200, PRIVATE);
});
