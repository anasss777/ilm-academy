import { useTranslations } from "next-intl";

export function ZoomCard({ zoom }: { zoom: { url: string; meetingId: string | null; password: string | null } }) {
  const t = useTranslations("student");
  return (
    <div className="panel stack gap-3">
      <p className="font-semibold text-ink">{t("zoomTitle")}</p>
      <div className="cluster">
        <a href={zoom.url} target="_blank" rel="noopener noreferrer" className="btn-primary">
          {t("joinZoom")}
        </a>
      </div>
      {zoom.meetingId || zoom.password ? (
        <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          {zoom.meetingId ? (
            <div>
              <dt className="text-muted">{t("meetingId")}</dt>
              <dd dir="ltr" className="text-start font-medium">{zoom.meetingId}</dd>
            </div>
          ) : null}
          {zoom.password ? (
            <div>
              <dt className="text-muted">{t("meetingPassword")}</dt>
              <dd dir="ltr" className="text-start font-medium">{zoom.password}</dd>
            </div>
          ) : null}
        </dl>
      ) : null}
    </div>
  );
}
