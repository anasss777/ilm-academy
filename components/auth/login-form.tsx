"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { supabaseErrorKey } from "@/lib/auth/supabase-errors";
import { loginSchema } from "@/lib/validation/account";
import { enrollRequest } from "@/lib/client/enroll";
import { AuthCard } from "./auth-card";
import { TextField } from "./field";

export function LoginForm({
  next,
  enrollCourseId,
  linkError,
}: {
  next: string | null;
  enrollCourseId: string | null;
  linkError: boolean;
}) {
  const t = useTranslations("auth");
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(linkError ? t("errors.linkInvalid") : null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(t("errors.invalidCredentials"));
      return;
    }

    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.signInWithPassword(parsed.data);
    if (authError) {
      setError(t(`errors.${supabaseErrorKey(authError)}`));
      setBusy(false);
      return;
    }

    // Came from a course page: enroll now that they are signed in
    if (enrollCourseId) {
      const result = await enrollRequest(enrollCourseId);
      if (!result.ok) {
        router.replace(`/my-courses?enroll_error=${result.code}`);
        router.refresh();
        return;
      }
    }
    router.replace(next ?? (enrollCourseId ? `/my-courses/${enrollCourseId}` : "/my-courses"));
    router.refresh();
  }

  const registerQuery: Record<string, string> = {};
  if (next) registerQuery.next = next;
  if (enrollCourseId) registerQuery.enroll = enrollCourseId;

  return (
    <AuthCard
      title={t("login.title")}
      subtitle={t("login.subtitle")}
      footer={
        <>
          {t("login.noAccount")}{" "}
          <Link
            href={{ pathname: "/register", query: registerQuery }}
            className="link"
          >
            {t("login.createAccount")}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextField
          id="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          label={t("login.email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <TextField
          id="password"
          type="password"
          dir="ltr"
          autoComplete="current-password"
          label={t("login.password")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {error ? (
          <p role="alert" className="alert-error">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn-primary btn-block" disabled={busy}>
          {busy ? t("login.submitting") : t("login.submit")}
        </button>
        <p className="text-center text-sm">
          <Link href="/forgot-password" className="link">
            {t("login.forgot")}
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}
