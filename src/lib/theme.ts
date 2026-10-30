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

/** The toast shown after switching to `theme`. */
export function toastFor(theme: Theme): string {
  return theme === "night"
    ? "Night ride unlocked — lights on."
    : "Back to daylight.";
}
