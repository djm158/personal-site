import { describe, expect, it } from "vitest";
import { pupilOffset } from "./avatar";

describe("pupilOffset", () => {
  it("stays centred when the cursor is on the eyes", () => {
    expect(pupilOffset(0, 0)).toEqual({ x: 0, y: 0 });
  });

  it("moves the full 4.5 units once the cursor is 260px away or more", () => {
    expect(pupilOffset(260, 0)).toEqual({ x: 4.5, y: 0 });
    expect(pupilOffset(0, -1000)).toEqual({ x: 0, y: -4.5 });
  });

  it("moves in proportion to the distance when the cursor is closer", () => {
    expect(pupilOffset(130, 0)).toEqual({ x: 2.25, y: 0 });
  });

  it("points along the direction of the cursor", () => {
    const { x, y } = pupilOffset(300, 400);
    expect(x).toBeCloseTo(2.7);
    expect(y).toBeCloseTo(3.6);
  });
});
