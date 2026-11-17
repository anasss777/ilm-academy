// lib/theme.ts
// Light/dark theme. The theme lives in the `data-theme` attribute on <html>:
//   - THEME_INIT_SCRIPT runs in <head> BEFORE the page is painted (no flash of the wrong theme):
//     it uses the visitor's saved choice, or their system setting when they have not chosen.
//   - ThemeToggle flips the attribute and saves the choice in localStorage.
// The colors for each theme are in globals.css (:root and :root[data-theme="dark"]).

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "theme";

export function resolveTheme(stored: string | null, systemPrefersDark: boolean): Theme {
  if (stored === "light" || stored === "dark") return stored;
  return systemPrefersDark ? "dark" : "light";
}

// Plain string (not a function) so it is not touched by the bundler; keep it in sync with resolveTheme.
export const THEME_INIT_SCRIPT =
  `(function(){try{var t=localStorage.getItem("${THEME_STORAGE_KEY}");` +
  `if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}` +
  `document.documentElement.setAttribute("data-theme",t)}` +
  `catch(e){document.documentElement.setAttribute("data-theme","light")}})();`;
