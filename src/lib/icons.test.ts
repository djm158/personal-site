import { describe, expect, test } from "vitest";
import { oklchToHex, pngToIco, resolveSvgColors } from "./icons";

describe("oklchToHex", () => {
  test("white and black", () => {
    expect(oklchToHex(1, 0, 0)).toBe("#ffffff");
    expect(oklchToHex(0, 0, 0)).toBe("#000000");
  });

  test("pure sRGB red", () => {
    expect(oklchToHex(0.62796, 0.25768, 29.2339)).toBe("#ff0000");
  });

  test("clamps colours outside sRGB", () => {
    expect(oklchToHex(0.7, 0.4, 145)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("resolveSvgColors", () => {
  test("replaces a var() with its fallback, converted to hex", () => {
    expect(
      resolveSvgColors('<circle fill="var(--color-ink, oklch(0 0 0))"/>'),
    ).toBe('<circle fill="#000000"/>');
  });

  test("converts a bare oklch() and leaves other colours alone", () => {
    expect(
      resolveSvgColors('<a fill="oklch(1 0 0)"/><b fill="#123456"/>'),
    ).toBe('<a fill="#ffffff"/><b fill="#123456"/>');
  });

  test("keeps a plain var() fallback that isn't oklch", () => {
    expect(resolveSvgColors('<a fill="var(--x, #abcdef)"/>')).toBe(
      '<a fill="#abcdef"/>',
    );
  });
});

describe("pngToIco", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]);

  test("wraps the PNG after a one-image ICO header", () => {
    const ico = pngToIco(png, 32);
    const view = new DataView(ico.buffer);
    expect(ico.length).toBe(22 + png.length);
    expect(view.getUint16(0, true)).toBe(0); // reserved
    expect(view.getUint16(2, true)).toBe(1); // type: icon
    expect(view.getUint16(4, true)).toBe(1); // one image
    expect(ico[6]).toBe(32); // width
    expect(ico[7]).toBe(32); // height
    expect(view.getUint16(10, true)).toBe(1); // colour planes
    expect(view.getUint16(12, true)).toBe(32); // bits per pixel
    expect(view.getUint32(14, true)).toBe(png.length);
    expect(view.getUint32(18, true)).toBe(22);
    expect([...ico.slice(22)]).toEqual([...png]);
  });

  test("writes 256px as 0", () => {
    const ico = pngToIco(png, 256);
    expect(ico[6]).toBe(0);
    expect(ico[7]).toBe(0);
  });
});
