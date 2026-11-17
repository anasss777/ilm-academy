import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Logo } from "./logo";

export async function SiteFooter() {
  const t = await getTranslations("footer");
  const year = String(new Date().getFullYear());
  return (
    <footer className="site-footer">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 sm:flex-row sm:items-center sm:justify-between sm:px-6 lg:px-8">
        <div className="stack gap-2">
          <Logo />
          <p>{t("tagline")}</p>
        </div>
        <div className="stack items-start gap-2 sm:items-end">
          <Link href="/courses" className="link">
            {t("browse")}
          </Link>
          <p>{t("copyright", { year })}</p>
        </div>
      </div>
    </footer>
  );
}
