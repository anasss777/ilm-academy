"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { supabaseErrorKey } from "@/lib/auth/supabase-errors";
import { loginSchema } from "@/lib/validation/account";
import { AuthCard } from "./auth-card";
import { TextField } from "./field";

export function ForgotPasswordForm() {
  const t = useTranslations("auth");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    const parsed = loginSchema.shape.email.safeParse(email);
    if (!parsed.success) {
      setError(t("fields.email"));
      return;
    }

    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
    });
    setBusy(false);

    if (authError && supabaseErrorKey(authError) === "rateLimited") {
      setError(t("errors.rateLimited"));
      return;
    }
    // Same message whether or not the account exists, so the form cannot be used to probe emails
    setSent(true);
  }

  if (sent) {
    return (
      <AuthCard title={t("forgot.sentTitle")} subtitle={t("forgot.sentBody")}>
        <Link href="/login" className="link">
          {t("forgot.back")}
        </Link>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t("forgot.title")}
      subtitle={t("forgot.subtitle")}
      footer={
        <Link href="/login" className="link">
          {t("forgot.back")}
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextField
          id="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          label={t("forgot.email")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        {error ? (
          <p role="alert" className="alert-error">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn-primary btn-block" disabled={busy}>
          {busy ? t("forgot.submitting") : t("forgot.submit")}
        </button>
      </form>
    </AuthCard>
  );
}
