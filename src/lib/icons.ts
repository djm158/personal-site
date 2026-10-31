// Helpers for rendering the favicon and touch icon from the avatar SVG at build time.

/** An OKLCH colour as an sRGB hex string, clamped to the sRGB gamut. */
export function oklchToHex(l: number, c: number, h: number): string {
  const rad = (h * Math.PI) / 180;
  const a = c * Math.cos(rad);
  const b = c * Math.sin(rad);

  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];

  return (
    "#" +
    linear
      .map((x) => {
        const v = x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
        const byte = Math.round(Math.min(1, Math.max(0, v)) * 255);
        return byte.toString(16).padStart(2, "0");
      })
      .join("")
  );
}

/**
 * librsvg (sharp's SVG renderer) understands neither `var()` nor `oklch()`, and paints those
 * fills black. Swap each `var(--token, fallback)` for its fallback and each `oklch()` for hex.
 */
export function resolveSvgColors(svg: string): string {
  return svg
    .replace(/var\(--[\w-]+,\s*((?:[^()]|\([^()]*\))+)\)/g, "$1")
    .replace(/oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*\)/g, (_, l, c, h) =>
      oklchToHex(Number(l), Number(c), Number(h)),
    );
}

/** A single-image ICO file holding a square PNG (supported by every current browser). */
export function pngToIco(
  png: Uint8Array,
  size: number,
): Uint8Array<ArrayBuffer> {
  const headerLength = 6 + 16;
  const ico = new Uint8Array(headerLength + png.length);
  const view = new DataView(ico.buffer);
  const dimension = size >= 256 ? 0 : size;

  view.setUint16(0, 0, true); // reserved
  view.setUint16(2, 1, true); // type: icon
  view.setUint16(4, 1, true); // image count
  view.setUint8(6, dimension); // width
  view.setUint8(7, dimension); // height
  view.setUint8(8, 0); // palette size
  view.setUint8(9, 0); // reserved
  view.setUint16(10, 1, true); // colour planes
  view.setUint16(12, 32, true); // bits per pixel
  view.setUint32(14, png.length, true); // image size
  view.setUint32(18, headerLength, true); // image offset
  ico.set(png, headerLength);

  return ico;
}
