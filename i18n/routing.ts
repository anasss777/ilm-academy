import { defineRouting } from "next-intl/routing";

// Arabic first: "/" redirects to "/ar", and every page lives under a locale prefix.
export const routing = defineRouting({
  locales: ["ar", "en"],
  defaultLocale: "ar",
  localePrefix: "always",
});
