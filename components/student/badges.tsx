import { useTranslations } from "next-intl";

export function LectureStateBadge({ state }: { state: "UPCOMING" | "LIVE" | "ENDED" }) {
  const t = useTranslations("student");
  if (state === "LIVE") return <span className="badge-success">{t("live")}</span>;
  if (state === "UPCOMING") return <span className="badge-primary">{t("upcoming")}</span>;
  return <span className="badge-muted">{t("ended")}</span>;
}

/** null = staff have not recorded it; only worth saying once the lecture is over. */
export function AttendanceBadge({ status, ended }: { status: string | null; ended: boolean }) {
  const t = useTranslations("lectures");
  if (!status) return ended ? <span className="badge-muted">{t("attendanceNotRecorded")}</span> : null;
  const tone =
    status === "PRESENT" ? "badge-success" : status === "PARTIAL" ? "badge-warning" : status === "EXCUSED" ? "badge-info" : "badge-danger";
  return <span className={tone}>{t(`attendance.${status}`)}</span>;
}

export function QuestionStatusBadge({ status }: { status: "NOT_SUBMITTED" | "SUBMITTED" | "GRADED" }) {
  const t = useTranslations("lectures");
  const tone = status === "GRADED" ? "badge-success" : status === "SUBMITTED" ? "badge-info" : "badge-warning";
  return <span className={tone}>{t(`questionStatus.${status}`)}</span>;
}
