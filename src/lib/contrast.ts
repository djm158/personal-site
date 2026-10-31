// WCAG 2 contrast for the theme's oklch() colour tokens.
// Linear sRGB channels (0–1, clamped to the gamut) are what luminance is computed from.
export type LinearRgb = [number, number, number];

export type Oklch = { l: number; c: number; h: number; alpha: number };

/** Parses `oklch(L C H)` or `oklch(L C H / A)`, with L as a number or a percentage. */
export function parseOklch(value: string): Oklch | null {
  const match = value
    .trim()
    .match(
      /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+)(%?))?\s*\)$/,
    );
  if (!match) return null;
  const [, l, lPercent, c, h, alpha, alphaPercent] = match;
  return {
    l: Number(l) / (lPercent ? 100 : 1),
    c: Number(c),
    h: Number(h),
    alpha: alpha === undefined ? 1 : Number(alpha) / (alphaPercent ? 100 : 1),
  };
}

/** OKLCH to linear sRGB (Björn Ottosson's matrices), clamped to the sRGB gamut. */
export function toLinearRgb({ l, c, h }: Oklch): LinearRgb {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const rgb: LinearRgb = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return rgb.map((v) => Math.min(1, Math.max(0, v))) as LinearRgb;
}

const encode = (v: number) =>
  v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
const decode = (v: number) =>
  v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;

/** A translucent colour over an opaque one, blended in gamma-encoded sRGB as browsers do. */
export function over(
  top: LinearRgb,
  alpha: number,
  bottom: LinearRgb,
): LinearRgb {
  return top.map((v, i) =>
    decode(alpha * encode(v) + (1 - alpha) * encode(bottom[i])),
  ) as LinearRgb;
}

export function luminance([r, g, b]: LinearRgb): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio, from 1 to 21. */
export function contrastRatio(a: LinearRgb, b: LinearRgb): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
