// lib/i18n-content.ts
// Pick the right language for bilingual content columns (titleAr / titleEn, ...).
// Arabic is the primary language, so it is the fallback for English.

export function localized(
  locale: string,
  ar: string | null | undefined,
  en: string | null | undefined,
): string {
  return (locale === "en" ? en || ar : ar || en) ?? "";
}
