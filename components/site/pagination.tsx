import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

/** Previous / next links that keep the current search in the URL. Renders nothing for one page. */
export async function Pagination({
  pathname,
  page,
  pageSize,
  total,
  query = {},
}: {
  pathname: string;
  page: number;
  pageSize: number;
  total: number;
  query?: Record<string, string>;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const t = await getTranslations("catalog");

  const href = (p: number) => ({ pathname, query: { ...query, ...(p > 1 ? { page: String(p) } : {}) } });

  return (
    <nav className="pager" aria-label={t("pagination")}>
      {page > 1 ? (
        <Link href={href(page - 1)} className="btn-outline btn-sm" rel="prev">
          {t("previous")}
        </Link>
      ) : (
        <span className="btn-outline btn-sm pointer-events-none opacity-50" aria-disabled>
          {t("previous")}
        </span>
      )}
      <span>{t("pageOf", { page: String(page), pages: String(pages) })}</span>
      {page < pages ? (
        <Link href={href(page + 1)} className="btn-outline btn-sm" rel="next">
          {t("next")}
        </Link>
      ) : (
        <span className="btn-outline btn-sm pointer-events-none opacity-50" aria-disabled>
          {t("next")}
        </span>
      )}
    </nav>
  );
}
