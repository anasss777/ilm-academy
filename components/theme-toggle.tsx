"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Moon, Sun } from "@/components/ui/icons";
import { THEME_STORAGE_KEY, resolveTheme, type Theme } from "@/lib/theme";

/**
 * Light/dark switch. The icon is chosen by CSS from the <html data-theme> attribute (so there is
 * no hydration mismatch); React state only drives the accessible label.
 */
export function ThemeToggle() {
  const t = useTranslations("theme");
  const [theme, setTheme] = useState<Theme | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.dataset.theme === "dark" ? "dark" : "light");

    // Follow the system setting live, but only while the visitor has not made a choice
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      let stored: string | null = null;
      try {
        stored = localStorage.getItem(THEME_STORAGE_KEY);
      } catch {
        /* storage blocked: treat as no choice */
      }
      if (stored === "light" || stored === "dark") return;
      const next = resolveTheme(null, media.matches);
      document.documentElement.dataset.theme = next;
      setTheme(next);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  function toggle() {
    const next: Theme = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* storage blocked: the choice lasts for this page view only */
    }
    setTheme(next);
  }

  const label = theme === null ? t("toggle") : theme === "dark" ? t("toLight") : t("toDark");

  return (
    <button type="button" onClick={toggle} className="btn-ghost btn-icon" aria-label={label} title={label}>
      <Moon className="icon dark:hidden" />
      <Sun className="icon hidden dark:block" />
    </button>
  );
}
