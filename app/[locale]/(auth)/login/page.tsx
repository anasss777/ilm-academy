import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/auth/session";
import { parseUuid, safeNextPath } from "@/lib/auth/params";
import { LoginForm } from "@/components/auth/login-form";

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const next = safeNextPath(sp.next);
  const enrollCourseId = parseUuid(sp.enroll);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (data.user) redirect({ href: next ?? "/my-courses", locale });

  return (
    <LoginForm
      next={next}
      enrollCourseId={enrollCourseId}
      linkError={sp.error === "callback"}
    />
  );
}
