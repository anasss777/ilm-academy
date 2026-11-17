"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { supabaseErrorKey } from "@/lib/auth/supabase-errors";
import { registerSchema } from "@/lib/validation/account";
import { countryOptions } from "@/lib/countries";
import { enrollRequest } from "@/lib/client/enroll";
import { AuthCard } from "./auth-card";
import { TextField } from "./field";

type FieldName = "fullName" | "email" | "phone" | "country" | "password";

export function RegisterForm({
  next,
  enrollCourseId,
}: {
  next: string | null;
  enrollCourseId: string | null;
}) {
  const t = useTranslations("auth");
  const locale = useLocale();
  const router = useRouter();
  const countries = useMemo(() => countryOptions(locale), [locale]);

  const [values, setValues] = useState({
    fullName: "",
    email: "",
    phone: "",
    country: "",
    password: "",
    consent: false,
  });
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  function set<K extends keyof typeof values>(key: K, value: (typeof values)[K]) {
    setValues((v) => ({ ...v, [key]: value }));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setFormError(null);

    const parsed = registerSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<FieldName, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as FieldName;
        if (!fieldErrors[key]) fieldErrors[key] = t(`fields.${key}`);
      }
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setBusy(true);

    // After email confirmation the user lands here; the callback signs them in and enrolls them
    const redirectTo = new URL("/auth/callback", window.location.origin);
    if (next) redirectTo.searchParams.set("next", next);
    if (enrollCourseId) redirectTo.searchParams.set("enroll", enrollCourseId);

    const { fullName, email, phone, country, password, consent } = parsed.data;
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectTo.toString(),
        // Read by the database trigger that creates the profile row
        data: {
          full_name: fullName,
          phone,
          country,
          locale,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          data_sharing_consent: consent,
        },
      },
    });

    if (error) {
      setFormError(t(`errors.${supabaseErrorKey(error)}`));
      setBusy(false);
      return;
    }

    // Email confirmation switched off in Supabase: the user is already signed in
    if (data.session) {
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
      return;
    }

    // Deliberately neutral: it is the same message whether or not the email already existed
    setSent(true);
    setBusy(false);
  }

  if (sent) {
    return (
      <AuthCard title={t("register.checkEmailTitle")} subtitle={t("register.checkEmailBody")}>
        <Link href="/login" className="link">
          {t("register.signIn")}
        </Link>
      </AuthCard>
    );
  }

  const loginQuery: Record<string, string> = {};
  if (next) loginQuery.next = next;
  if (enrollCourseId) loginQuery.enroll = enrollCourseId;

  return (
    <AuthCard
      title={t("register.title")}
      subtitle={enrollCourseId ? t("register.subtitleEnroll") : t("register.subtitle")}
      footer={
        <>
          {t("register.haveAccount")}{" "}
          <Link
            href={{ pathname: "/login", query: loginQuery }}
            className="link"
          >
            {t("register.signIn")}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <TextField
          id="fullName"
          autoComplete="name"
          label={t("register.fullName")}
          value={values.fullName}
          onChange={(e) => set("fullName", e.target.value)}
          error={errors.fullName}
          required
        />
        <TextField
          id="email"
          type="email"
          dir="ltr"
          autoComplete="email"
          label={t("register.email")}
          value={values.email}
          onChange={(e) => set("email", e.target.value)}
          error={errors.email}
          required
        />
        <TextField
          id="phone"
          type="tel"
          inputMode="tel"
          dir="ltr"
          autoComplete="tel"
          label={t("register.phone")}
          hint={t("register.phoneHint")}
          value={values.phone}
          onChange={(e) => set("phone", e.target.value)}
          error={errors.phone}
          required
        />

        <div>
          <label htmlFor="country" className="label">
            {t("register.country")}
          </label>
          <select
            id="country"
            className="select"
            value={values.country}
            onChange={(e) => set("country", e.target.value)}
            aria-invalid={errors.country ? true : undefined}
            aria-describedby={errors.country ? "country-error" : undefined}
            autoComplete="country"
            required
          >
            <option value="">{t("register.countryPlaceholder")}</option>
            {countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
          {errors.country ? (
            <p id="country-error" role="alert" className="field-error">
              {errors.country}
            </p>
          ) : null}
        </div>

        <TextField
          id="password"
          type="password"
          dir="ltr"
          autoComplete="new-password"
          label={t("register.password")}
          hint={t("register.passwordHint")}
          value={values.password}
          onChange={(e) => set("password", e.target.value)}
          error={errors.password}
          required
        />

        <div className="flex items-start gap-3">
          <input
            id="consent"
            type="checkbox"
            checked={values.consent}
            onChange={(e) => set("consent", e.target.checked)}
            className="checkbox mt-1"
          />
          <label htmlFor="consent" className="text-sm">
            {t("register.consent")}
            <span className="field-hint block">{t("register.consentHint")}</span>
          </label>
        </div>

        {formError ? (
          <p role="alert" className="alert-error">
            {formError}
          </p>
        ) : null}

        <button type="submit" className="btn-primary btn-block" disabled={busy}>
          {busy ? t("register.submitting") : t("register.submit")}
        </button>
      </form>
    </AuthCard>
  );
}
