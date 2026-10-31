import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";
import {
  contrastRatio,
  over,
  parseOklch,
  toLinearRgb,
  type LinearRgb,
} from "./contrast";

const white = toLinearRgb({ l: 1, c: 0, h: 0, alpha: 1 });
const black = toLinearRgb({ l: 0, c: 0, h: 0, alpha: 1 });

describe("parseOklch", () => {
  test("reads lightness, chroma, hue and an optional alpha", () => {
    expect(parseOklch("oklch(0.52 0.12 42)")).toEqual({
      l: 0.52,
      c: 0.12,
      h: 42,
      alpha: 1,
    });
    expect(parseOklch("oklch(25% 0.025 50 / 0.14)")).toEqual({
      l: 0.25,
      c: 0.025,
      h: 50,
      alpha: 0.14,
    });
  });

  test("rejects anything else", () => {
    expect(parseOklch("var(--color-accent)")).toBeNull();
    expect(parseOklch("#fff")).toBeNull();
  });
});

describe("contrastRatio", () => {
  test("is 21 for black on white and 1 for a colour on itself", () => {
    expect(contrastRatio(black, white)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, black)).toBeCloseTo(21, 5);
    expect(contrastRatio(white, white)).toBe(1);
  });

  test("matches a known sRGB value: #777 on white is about 4.48", () => {
    // #777777 is oklch(0.5693 0 0)
    const grey = toLinearRgb({ l: 0.5693, c: 0, h: 0, alpha: 1 });
    expect(contrastRatio(grey, white)).toBeCloseTo(4.48, 1);
  });
});

describe("over", () => {
  test("full alpha keeps the top colour, zero alpha the bottom one", () => {
    expect(over(black, 1, white)).toEqual(black);
    expect(over(black, 0, white)).toEqual(white);
  });

  test("blends in gamma-encoded space: 50% black on white is #808080, not linear 0.5", () => {
    const [r] = over(black, 0.5, white);
    expect(r).toBeCloseTo(0.214, 2);
  });
});

// The theme tokens in global.css, read as the browser would: day from @theme, night from
// the [data-theme="night"] overrides on top of it
const css = readFileSync(
  new URL("../styles/global.css", import.meta.url),
  "utf8",
);

function tokens(block: string): Record<string, string> {
  const found: Record<string, string> = {};
  for (const [, name, value] of block.matchAll(
    /--color-([\w-]+):\s*([^;]+);/g,
  )) {
    found[name] = value.trim();
  }
  return found;
}

const dayBlock = css.slice(
  css.indexOf("@theme {"),
  css.indexOf("@theme inline"),
);
const nightBlock = css.slice(
  css.indexOf('[data-theme="night"] {'),
  css.indexOf("}", css.indexOf('[data-theme="night"] {')),
);
const day = tokens(dayBlock);
const themes = { day, night: { ...day, ...tokens(nightBlock) } };

function colour(theme: Record<string, string>, name: string): LinearRgb {
  const parsed = parseOklch(theme[name] ?? "");
  if (!parsed) throw new Error(`--color-${name} isn't an oklch() value`);
  return toLinearRgb(parsed);
}

// [text, background, text opacity, minimum ratio, where]. 4.5 is AA for body text,
// 3 for large text (24px, or 18.66px bold)
const pairs: [string, string, number, number, string][] = [
  ["ink", "bg", 1, 4.5, "body text"],
  ["ink", "surface", 1, 4.5, "text on cards, soft chips and buttons"],
  ["muted", "bg", 1, 4.5, "muted text, eyebrows"],
  ["muted", "surface", 1, 4.5, "muted text on cards and the skill bar"],
  ["accent", "bg", 1, 4.5, "accent text, links on hover, form errors"],
  ["accent", "surface", 1, 4.5, "accent text in the skill picker"],
  ["onink", "ink", 1, 4.5, "filled buttons, pressed chips"],
  ["onink", "ink", 0.7, 4.5, "skill counts on pressed chips"],
  ["onink", "accent", 1, 4.5, "matched skill tags, selected text"],
  ["muted", "bg", 1, 4.5, "contact form placeholders"],
  ["onink", "moss", 1, 3, "the contact success tick (24px)"],
];

describe.each(Object.entries(themes))(
  "%s theme tokens meet WCAG AA",
  (_, theme) => {
    test.each(pairs)(
      "%s on %s at %d opacity ≥ %d (%s)",
      (text, bg, alpha, min) => {
        const background = colour(theme, bg);
        const foreground = over(colour(theme, text), alpha, background);
        expect(contrastRatio(foreground, background)).toBeGreaterThanOrEqual(
          min,
        );
      },
    );
  },
);
