import sharp from "sharp";
import avatarSvg from "../assets/avatar-mini.svg?raw";
import globalCss from "../styles/global.css?raw";
import { resolveSvgColors } from "./icons";

// The day theme's page background, so the touch icon matches the old committed copy
const pageBackground = resolveSvgColors(
  /--color-bg:\s*(oklch\([^)]*\))/.exec(globalCss)?.[1] ?? "#fff",
);

/** The nav avatar as a square PNG, `size` pixels wide. */
export async function avatarPng(
  size: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const svg = Buffer.from(resolveSvgColors(avatarSvg));
  return new Uint8Array(
    await sharp(svg, { density: 300 }).resize(size, size).png().toBuffer(),
  );
}

/**
 * The avatar inset on the page background, for `apple-touch-icon.png`: iOS paints transparent
 * pixels black and rounds the corners itself.
 */
export async function touchIconPng(
  size: number,
): Promise<Uint8Array<ArrayBuffer>> {
  const inset = Math.round(size * 0.07);
  const face = await avatarPng(size - inset * 2);
  return new Uint8Array(
    await sharp(face)
      .extend({
        top: inset,
        bottom: inset,
        left: inset,
        right: inset,
        background: pageBackground,
      })
      .flatten({ background: pageBackground })
      .png()
      .toBuffer(),
  );
}
