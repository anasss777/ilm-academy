"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { TextField } from "./fields";
import { ErrorNote } from "./save-status";
import { useSave } from "./use-save";

/** Add an existing account to the course by email. */
export function AddStudentForm({ courseId }: { courseId: string }) {
  const t = useTranslations("admin.students");
  const tc = useTranslations("admin.common");
  const router = useRouter();
  const { busy, error, run } = useSave();
  const [email, setEmail] = useState("");
  const [note, setNote] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setNote(null);
    await run(
      () => apiRequest<{ outcome: "ENROLLED" | "REENROLLED" | "ALREADY_ENROLLED" }>("POST", `/api/admin/courses/${courseId}/students`, { email: email.trim() }),
      (d) => {
        setNote(d.outcome === "ALREADY_ENROLLED" ? t("alreadyEnrolled") : d.outcome === "REENROLLED" ? t("reactivated") : t("added"));
        setEmail("");
        router.refresh();
      },
    );
  }

  return (
    <form onSubmit={onSubmit} className="card stack gap-3" noValidate>
      <h2 className="title-card">{t("addTitle")}</h2>
      <div className="toolbar">
        <div className="min-w-64 flex-1">
          <TextField id="add-student" label={t("emailLabel")} hint={t("addHint")} type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="student@example.com" />
        </div>
        <button type="submit" className="btn-primary" disabled={busy || !email.trim()}>
          {busy ? tc("adding") : tc("add")}
        </button>
      </div>
      <ErrorNote error={error} />
      {note ? (
        <p role="status" className="text-sm text-success">
          {note}
        </p>
      ) : null}
    </form>
  );
}

/** Withdraw or reactivate one student. History is kept either way. */
export function StudentRowActions({
  courseId,
  userId,
  status,
}: {
  courseId: string;
  userId: string;
  status: "ACTIVE" | "WITHDRAWN";
}) {
  const t = useTranslations("admin.students");
  const router = useRouter();
  const { busy, error, run } = useSave();
  const next = status === "ACTIVE" ? "WITHDRAWN" : "ACTIVE";

  return (
    <div className="stack gap-1">
      <button
        type="button"
        className="btn-ghost btn-sm"
        disabled={busy}
        onClick={() =>
          run(
            () => apiRequest("PATCH", `/api/admin/courses/${courseId}/students/${userId}`, { status: next }),
            () => router.refresh(),
          )
        }
      >
        {status === "ACTIVE" ? t("withdraw") : t("reactivate")}
      </button>
      <ErrorNote error={error} />
    </div>
  );
}
