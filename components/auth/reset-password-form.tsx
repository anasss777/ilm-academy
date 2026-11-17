"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { supabaseErrorKey } from "@/lib/auth/supabase-errors";
import { registerSchema } from "@/lib/validation/account";
import { AuthCard } from "./auth-card";
import { TextField } from "./field";

export function ResetPasswordForm() {
  const t = useTranslations("auth");
  const router = useRouter();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);

    if (!registerSchema.shape.password.safeParse(password).success) {
      setError(t("fields.password"));
      return;
    }
    if (password !== confirm) {
      setError(t("errors.mismatch"));
      return;
    }

    setBusy(true);
    const supabase = createSupabaseBrowserClient();
    const { error: authError } = await supabase.auth.updateUser({ password });
    if (authError) {
      setError(t(`errors.${supabaseErrorKey(authError)}`));
      setBusy(false);
      return;
    }
    router.replace("/my-courses");
    router.refresh();
  }

  return (
    <AuthCard title={t("reset.title")} subtitle={t("reset.subtitle")}>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextField
          id="password"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          label={t("reset.password")}
          hint={t("register.passwordHint")}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <TextField
          id="confirm"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          label={t("reset.confirm")}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          required
        />
        {error ? (
          <p role="alert" className="alert-error">
            {error}
          </p>
        ) : null}
        <button type="submit" className="btn-primary btn-block" disabled={busy}>
          {busy ? t("reset.submitting") : t("reset.submit")}
        </button>
      </form>
    </AuthCard>
  );
}
