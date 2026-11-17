"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { enrollRequest } from "@/lib/client/enroll";

const KNOWN_ERRORS = ["ENROLLMENT_CLOSED", "NOT_FOUND"];

/**
 * The "Enroll for Free" call to action for the public course page.
 *  - already enrolled -> link to the course
 *  - signed in        -> enrolls with one click
 *  - signed out       -> sign-up (or sign-in) that carries the course along, so the student is
 *                        enrolled automatically once the account exists
 */
export function EnrollButton({
  courseId,
  signedIn,
  enrolled,
}: {
  courseId: string;
  signedIn: boolean;
  enrolled: boolean;
}) {
  const t = useTranslations("enroll");
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (enrolled) {
    return (
      <Link href={`/my-courses/${courseId}`} className="btn-primary btn-lg btn-block">
        {t("goToCourse")}
      </Link>
    );
  }

  if (!signedIn) {
    return (
      <div className="stack gap-3">
        <Link href={{ pathname: "/register", query: { enroll: courseId } }} className="btn-primary btn-lg btn-block">
          {t("cta")}
        </Link>
        <Link
          href={{ pathname: "/login", query: { enroll: courseId } }}
          className="link text-center text-sm"
        >
          {t("haveAccount")}
        </Link>
      </div>
    );
  }

  async function onClick() {
    setBusy(true);
    setError(null);
    const result = await enrollRequest(courseId);
    if (!result.ok) {
      setError(t(`errors.${KNOWN_ERRORS.includes(result.code) ? result.code : "FAILED"}`));
      setBusy(false);
      return;
    }
    router.push(`/my-courses/${courseId}`);
    router.refresh();
  }

  return (
    <div className="stack gap-2">
      <button type="button" onClick={onClick} disabled={busy} className="btn-primary btn-lg btn-block">
        {busy ? t("enrolling") : t("cta")}
      </button>
      {error ? (
        <p role="alert" className="field-error">
          {error}
        </p>
      ) : null}
    </div>
  );
}
