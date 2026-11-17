"use client";

import { useTranslations } from "next-intl";
import { apiErrorKey } from "@/lib/ui/errors";
import type { SaveError } from "./use-save";

const READINESS = ["titleAr", "shortDescAr", "descriptionAr", "instructor", "certificateRequirement"];

/** A translated API error. "Course not ready" also lists what is missing. */
export function ErrorNote({ error }: { error: SaveError | null }) {
  const te = useTranslations("apiErrors");
  const tr = useTranslations("admin.status.readiness");
  if (!error) return null;

  if (error.code === "COURSE_NOT_READY" && error.message) {
    const missing = error.message
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    return (
      <div role="alert" className="alert-warning stack gap-1">
        <p className="font-semibold">{te("COURSE_NOT_READY")}</p>
        <ul className="list-disc ps-5">
          {missing.map((m) => (
            <li key={m}>{READINESS.includes(m) ? tr(m) : m}</li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <p role="alert" className="alert-error">
      {te(apiErrorKey(error.code))}
    </p>
  );
}

export function SavedNote({ saved, text }: { saved: boolean; text?: string }) {
  const t = useTranslations("admin.common");
  return saved ? (
    <p role="status" className="text-sm text-success">
      {text ?? t("saved")}
    </p>
  ) : null;
}
