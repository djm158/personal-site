import { readFileSync } from "node:fs";
import Color from "colorjs.io";
import postcss, { type Container } from "postcss";
import { expect, test } from "vitest";

// Day tokens come from @theme, night from the [data-theme="night"] rule layered on top
const root = postcss.parse(
  readFileSync(new URL("global.css", import.meta.url), "utf8"),
);
const colours = (node?: Container) => {
  const found: Record<string, string> = {};
  node?.walkDecls(/^--color-/, (d) => {
    found[d.prop.slice("--color-".length)] = d.value;
  });
  return found;
};
let dayRule: Container | undefined, nightRule: Container | undefined;
root.walkAtRules("theme", (r) => void (r.params === "" && (dayRule = r)));
root.walkRules('[data-theme="night"]', (r) => void (nightRule = r));
const day = colours(dayRule);
const themes = { day, night: { ...day, ...colours(nightRule) } };

// 4.5:1 is AA for body text, 3:1 for large text (24px, or 18.66px bold)
const pairs = [
  { fg: "ink", bg: "bg", min: 4.5 },
  { fg: "ink", bg: "surface", min: 4.5 },
  { fg: "muted", bg: "bg", min: 4.5 }, // also the contact form placeholders
  { fg: "muted", bg: "surface", min: 4.5 },
  { fg: "accent", bg: "bg", min: 4.5 },
  { fg: "accent", bg: "surface", min: 4.5 },
  { fg: "onink", bg: "ink", min: 4.5 }, // filled buttons, pressed chips
  { fg: "onink", bg: "ink", min: 4.5, alpha: 0.7 }, // counts on pressed chips
  { fg: "onink", bg: "accent", min: 4.5 }, // matched skill tags
  { fg: "onink", bg: "moss", min: 3 }, // the 24px contact success tick
];

test.each(
  Object.entries(themes).flatMap(([theme, t]) =>
    pairs.map((p) => ({ theme, t, alpha: 1, ...p })),
  ),
)(
  "$theme: $fg on $bg (alpha $alpha) ≥ $min",
  ({ theme, t, fg, bg, min, alpha }) => {
    const back = new Color(t[bg]!);
    // mix(x, 0.7) is 70% x; at alpha 1 it's the text colour itself
    const front = back.mix(t[fg]!, alpha, { space: "srgb" });
    const ratio = front.contrast(back, "WCAG21");
    expect(
      ratio,
      `${fg} (alpha ${alpha}) on ${bg} in ${theme} is ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(min);
  },
);
