export type Theme = "day" | "night";

// localStorage key; the inline script in Layout.astro reads the same key before first paint
export const THEME_KEY = "theme";

export const POKES_TO_TOGGLE = 5;

/** One click on the avatar: the new count, and whether this click flips the theme. */
export function poke(count: number): { count: number; toggle: boolean } {
  const next = count + 1;
  return next >= POKES_TO_TOGGLE
    ? { count: 0, toggle: true }
    : { count: next, toggle: false };
}

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

/** The toast shown after switching to `theme`. */
export function toastFor(theme: Theme): string {
  return theme === "night"
    ? "Night ride unlocked — lights on."
    : "Back to daylight.";
}

/** The line under the avatar after `count` pokes: hints[0] after the first, none at zero. */
export function hintFor(count: number, hints: readonly string[]): string {
  return count > 0 ? (hints[count - 1] ?? "") : "";
}
