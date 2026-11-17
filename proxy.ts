// src/proxy.ts   (Next.js 15: rename this file to middleware.ts and the function to `middleware`)
//
// Runs before every page request and does two jobs:
//   1. next-intl: redirects "/" to "/ar" and resolves the locale from the URL.
//   2. Supabase: refreshes the auth token and writes the new cookies. Server Components
//      cannot set cookies, so without this a session expires while the user is still browsing.
//
// API routes and /auth/* are excluded by the matcher; they handle their own sessions.

import createIntlMiddleware from "next-intl/middleware";
import { createServerClient } from "@supabase/ssr";
import type { NextRequest } from "next/server";
import { routing } from "./i18n/routing";

const handleI18n = createIntlMiddleware(routing);

export async function proxy(request: NextRequest) {
  const response = handleI18n(request);

  const supabase = createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (list) => {
          for (const { name, value } of list) request.cookies.set(name, value);
          for (const { name, value, options } of list)
            response.cookies.set(name, value, options);
        },
      },
    },
  );
  // Validates the token with Supabase and refreshes it if needed
  await supabase.auth.getUser();

  return response;
}

export const config = {
  matcher: ["/((?!api|auth|trpc|_next|_vercel|.*\\..*).*)"],
};
