import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/session";
import { json, parseJson, route } from "@/lib/api/handler";
import { profileUpdateSchema } from "@/lib/validation/account";

const select = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  country: true,
  locale: true,
  timezone: true,
  telegramUsername: true,
  dataSharingConsentAt: true,
} as const;

/** The signed-in user's own profile. */
export const GET = route(async () => {
  const user = await requireUser();
  return json(await db.user.findUniqueOrThrow({ where: { id: user.id }, select }));
});

/**
 * Update permitted profile fields only (schema is strict, so fields such as status or email
 * cannot be sent). Grades and attendance live in other tables and are never editable here.
 */
export const PATCH = route(async (req) => {
  const user = await requireUser();
  const input = await parseJson(req, profileUpdateSchema);
  const updated = await db.user.update({
    where: { id: user.id },
    data: {
      ...input,
      telegramUsername:
        input.telegramUsername === undefined
          ? undefined
          : input.telegramUsername?.replace(/^@/, "") || null,
    },
    select,
  });
  return json(updated);
});
