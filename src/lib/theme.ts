export type Theme = "day" | "night";

// localStorage key; the inline script in Layout.astro reads the same key before first paint
export const THEME_KEY = "theme";

/** The theme from a stored value; anything but "night" is day. */
export function readTheme(stored: string | null): Theme {
  return stored === "night" ? "night" : "day";
}

/**
 * The theme to show: a saved choice wins, otherwise the system's colour scheme.
 * The inline script in Layout.astro repeats this before first paint; keep the two in step.
 */
export function resolveTheme(
  stored: string | null,
  systemPrefersNight: boolean,
): Theme {
  if (stored === "day" || stored === "night") return stored;
  return systemPrefersNight ? "night" : "day";
}

// Fired on document whenever the theme changes, so every switch on the page can follow
export const THEME_EVENT = "themechange";

/** Show `theme`, tell the page's switches, and (unless `save` is false) remember it. */
export function setTheme(theme: Theme, { save = true } = {}): void {
  const root = document.documentElement;
  if (theme === "night") root.dataset.theme = "night";
  else delete root.dataset.theme;
  if (save) {
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // storage blocked: the switch still works for this page
    }
  }
  document.dispatchEvent(
    new CustomEvent<Theme>(THEME_EVENT, { detail: theme }),
  );
}
