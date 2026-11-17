import { setRequestLocale } from "next-intl/server";
import { redirect } from "@/i18n/navigation";
import { createSupabaseServerClient } from "@/lib/auth/session";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";

// Reached from the password-reset email via /auth/callback, which signs the user in first.
export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect({ href: "/forgot-password", locale });

  return <ResetPasswordForm />;
}
