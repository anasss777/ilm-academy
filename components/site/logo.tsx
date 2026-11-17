import { useTranslations } from "next-intl";

/** Letter mark + name. Swap the <span> for an <img>/<svg> when there is a real logo. */
export function Logo() {
  const t = useTranslations("common");
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="logo-mark">
        <span
          className="font-aref-ruqaa bg-linear-to-r from-[#A67C00] via-[#FFF3A3] to-[#A67C00] bg-clip-text text-transparent"
          aria-hidden
        >
          عِلْمٌ
        </span>
      </span>
      <span className="text-lg font-bold text-ink">{t("appName")}</span>
    </span>
  );
}
