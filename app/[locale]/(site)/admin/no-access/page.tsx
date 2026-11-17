import { getTranslations, setRequestLocale } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export default async function NoAccessPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("admin.noAccess");
  return (
    <div className="container-page section">
      <div className="empty-state">
        <h1 className="title-section">{t("title")}</h1>
        <p>{t("body")}</p>
        <Link href="/" className="btn-primary">
          {t("back")}
        </Link>
      </div>
    </div>
  );
}
