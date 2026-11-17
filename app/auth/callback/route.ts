// Landing page for every Supabase email link (confirm signup, reset password).
// Not locale-prefixed on purpose: the link in the email must stay stable.
//   /auth/callback?code=...&next=/my-courses&enroll=<courseId>
// `next` is a locale-less internal path; the user's saved language is added on redirect.

import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { createSupabaseServerClient } from "@/lib/auth/session";
import { parseUuid, safeNextPath } from "@/lib/auth/params";
import { enrollInCourse } from "@/lib/enrollment/service";
import { GradingError } from "@/lib/grading/grading";
import { routing } from "@/i18n/routing";

export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const base = process.env.APP_ORIGIN ?? origin;
  const go = (path: string) => NextResponse.redirect(new URL(path, base));

  const code = searchParams.get("code");
  if (!code) return go(`/${routing.defaultLocale}/login?error=callback`);

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return go(`/${routing.defaultLocale}/login?error=callback`);

  const { data } = await supabase.auth.getUser();
  const userId = data.user?.id;
  if (!userId) return go(`/${routing.defaultLocale}/login?error=callback`);

  const profile = await db.user.findUnique({ where: { id: userId }, select: { locale: true } });
  const locale = (routing.locales as readonly string[]).includes(profile?.locale ?? "")
    ? (profile!.locale as string)
    : routing.defaultLocale;

  const next = safeNextPath(searchParams.get("next"));
  const enrollCourseId = parseUuid(searchParams.get("enroll"));

  // Signed up from a course page: enroll now that the email is verified
  if (enrollCourseId) {
    try {
      await enrollInCourse(db, { userId, courseId: enrollCourseId });
      return go(`/${locale}${next ?? `/my-courses/${enrollCourseId}`}`);
    } catch (e) {
      const reason = e instanceof GradingError ? e.code : "FAILED";
      return go(`/${locale}/my-courses?enroll_error=${reason}`);
    }
  }
  return go(`/${locale}${next ?? "/my-courses"}`);
}
