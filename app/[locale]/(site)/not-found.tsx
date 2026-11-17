import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

export default function NotFound() {
  const t = useTranslations("notFound");
  return (
    <div className="container-page section">
      <div className="empty-state">
        <h1 className="title-section">{t("title")}</h1>
        <p>{t("body")}</p>
        <Link href="/courses" className="btn-primary">
          {t("back")}
        </Link>
      </div>
    </div>
  );
}
