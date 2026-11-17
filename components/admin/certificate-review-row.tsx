"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { apiRequest } from "@/lib/client/api";
import { TextField } from "./fields";
import { ErrorNote } from "./save-status";
import { useSave } from "./use-save";

type Live = "ELIGIBLE" | "NOT_ELIGIBLE" | "PENDING";
type Stored = "PENDING" | "AUTO_ELIGIBLE" | "AUTO_INELIGIBLE" | "APPROVED" | "REJECTED";

export type ReviewRowData = {
  userId: string;
  fullName: string;
  email: string;
  consent: boolean;
  stored: Stored | null;
  needsReReview: boolean;
  overrideReason: string | null;
  liveStatus: Live;
  attendanceText: string;
  questionsText: string;
  examText: string;
};

/**
 * One candidate: the live numbers, the stored decision, and Approve / Reject. A decision that
 * disagrees with the automatic result needs a written reason (the server enforces it too).
 */
export function CertificateReviewRow({ courseId, row, canReview }: { courseId: string; row: ReviewRowData; canReview: boolean }) {
  const t = useTranslations("admin.certificates");
  const router = useRouter();
  const { busy, error, run, fail } = useSave();
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState<"APPROVED" | "REJECTED" | null>(null);

  // Approving someone who is not eligible, or rejecting someone who is, contradicts the calculation
  const contradicts = (d: "APPROVED" | "REJECTED") =>
    d === "APPROVED" ? row.liveStatus !== "ELIGIBLE" : row.liveStatus !== "NOT_ELIGIBLE";

  async function decide(decision: "APPROVED" | "REJECTED") {
    if (contradicts(decision) && !reason.trim()) {
      setPending(decision);
      fail({ code: "OVERRIDE_REASON_REQUIRED" });
      return;
    }
    await run(
      () =>
        apiRequest("POST", `/api/courses/${courseId}/certificate-reviews/${row.userId}/decision`, {
          decision,
          reason: reason.trim() || null,
        }),
      () => {
        setPending(null);
        setReason("");
        router.refresh();
      },
    );
  }

  const liveTone = row.liveStatus === "ELIGIBLE" ? "badge-success" : row.liveStatus === "PENDING" ? "badge-warning" : "badge-muted";
  const storedTone = row.stored === "APPROVED" ? "badge-success" : row.stored === "REJECTED" ? "badge-danger" : "badge-muted";

  return (
    <tr>
      <td>
        <div className="font-medium text-ink" dir="auto">{row.fullName}</div>
        <div className="text-xs text-muted" dir="ltr">{row.email}</div>
        <span className={row.consent ? "badge-success mt-1" : "badge-muted mt-1"}>{row.consent ? t("consent") : t("noConsent")}</span>
      </td>
      <td>
        <div className="stack gap-1 text-sm">
          <span>{t("attendance")}: {row.attendanceText}</span>
          <span>{t("questions")}: {row.questionsText}</span>
          <span>{t("exam")}: {row.examText}</span>
        </div>
      </td>
      <td>
        <div className="stack items-start gap-1">
          <span className={liveTone}>{t(`liveStatus.${row.liveStatus}`)}</span>
          {row.stored ? <span className={storedTone}>{t(`statuses.${row.stored}`)}</span> : null}
          {row.needsReReview ? <span className="badge-warning">{t("reReview")}</span> : null}
          {row.overrideReason ? <span className="text-xs text-muted" dir="auto">{t("override", { reason: row.overrideReason })}</span> : null}
        </div>
      </td>
      <td>
        {canReview ? (
          <div className="stack gap-2">
            <div className="cluster gap-2">
              <button type="button" className="btn-primary btn-sm" disabled={busy} onClick={() => decide("APPROVED")}>
                {t("approve")}
              </button>
              <button type="button" className="btn-outline btn-sm" disabled={busy} onClick={() => decide("REJECTED")}>
                {t("reject")}
              </button>
            </div>
            {pending && contradicts(pending) ? (
              <div className="stack gap-1">
                <p className="text-xs text-muted">{t("reasonNeeded")}</p>
                <TextField id={`reason-${row.userId}`} label={t("reasonLabel")} dir="auto" value={reason} onChange={(e) => setReason(e.target.value)} />
                <div>
                  <button type="button" className="btn-primary btn-sm" disabled={busy || !reason.trim()} onClick={() => decide(pending)}>
                    {pending === "APPROVED" ? t("approve") : t("reject")}
                  </button>
                </div>
              </div>
            ) : null}
            <ErrorNote error={pending ? null : error} />
          </div>
        ) : null}
      </td>
    </tr>
  );
}
