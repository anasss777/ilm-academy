// lib/auth/session.ts
// Resolve the signed-in user on the server.
//
// Uses supabase.auth.getUser(), which validates the token with Supabase on every call.
// (getSession() only reads the cookie and must not be trusted for authorization.)
// Requires: npm i @supabase/ssr @supabase/supabase-js
// Env: SUPABASE_URL and SUPABASE_ANON_KEY
//      (if your project uses the newer "publishable key", point the second variable at it)

import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { ApiError } from "@/lib/api/errors";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            for (const { name, value, options } of list)
              cookieStore.set(name, value, options);
          } catch {
            // Called from a Server Component: cookies are read-only there. Safe to ignore.
          }
        },
      },
    },
  );
}

export interface SessionUser {
  id: string;
  email: string;
  fullName: string;
  locale: string;
  timezone: string;
  dataSharingConsentAt: Date | null;
}

/** 401 when signed out, 403 when the account has no profile row or is disabled. */
export async function requireUser(): Promise<SessionUser> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new ApiError(401, "UNAUTHENTICATED");

  const user = await db.user.findUnique({
    where: { id: data.user.id },
    select: {
      id: true,
      email: true,
      fullName: true,
      locale: true,
      timezone: true,
      status: true,
      deletedAt: true,
      dataSharingConsentAt: true,
    },
  });
  if (!user) throw new ApiError(403, "PROFILE_NOT_FOUND");
  if (user.deletedAt || user.status !== "ACTIVE")
    throw new ApiError(403, "ACCOUNT_DISABLED");

  const { status: _status, deletedAt: _deletedAt, ...session } = user;
  return session;
}

/**
 * For pages that work signed out (course page, lecture page): the user if there is one,
 * otherwise null. Only "not signed in" and "account disabled" count as null: real errors
 * (database down, ...) still throw.
 */
export async function getOptionalUser(): Promise<SessionUser | null> {
  try {
    return await requireUser();
  } catch (e) {
    if (e instanceof ApiError && (e.status === 401 || e.status === 403))
      return null;
    throw e;
  }
}
