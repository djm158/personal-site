import { describe, expect, test } from "vitest";
import { releaseVelocity, shouldDismiss } from "./sheet-drag";

describe("releaseVelocity", () => {
  test("no samples or one sample is no velocity", () => {
    expect(releaseVelocity([])).toBe(0);
    expect(releaseVelocity([{ y: 10, t: 0 }])).toBe(0);
  });

  test("measures px per ms across the recent samples", () => {
    const samples = [
      { y: 0, t: 0 },
      { y: 20, t: 20 },
      { y: 60, t: 40 },
    ];
    expect(releaseVelocity(samples)).toBe(1.5);
  });

  test("ignores samples older than the window before the last one", () => {
    const samples = [
      { y: 0, t: 0 },
      { y: 200, t: 50 },
      // a pause, then a slow last bit
      { y: 200, t: 300 },
      { y: 210, t: 350 },
    ];
    expect(releaseVelocity(samples)).toBe(0.2);
  });

  test("a finger held still before release has no velocity", () => {
    const samples = [
      { y: 0, t: 0 },
      { y: 200, t: 50 },
      { y: 200, t: 400 },
    ];
    expect(releaseVelocity(samples)).toBe(0);
  });

  test("upward movement is negative", () => {
    const samples = [
      { y: 100, t: 0 },
      { y: 50, t: 50 },
    ];
    expect(releaseVelocity(samples)).toBe(-1);
  });
});

describe("shouldDismiss", () => {
  test("a short slow drag snaps back", () => {
    expect(shouldDismiss(50, 600, 0.1)).toBe(false);
  });

  test("past a quarter of the height closes", () => {
    expect(shouldDismiss(151, 600, 0)).toBe(true);
    expect(shouldDismiss(150, 600, 0)).toBe(false);
  });

  test("a fast downward flick closes even when short", () => {
    expect(shouldDismiss(30, 600, 0.8)).toBe(true);
  });

  test("a fast upward flick snaps back", () => {
    expect(shouldDismiss(30, 600, -0.8)).toBe(false);
  });

  test("a flick that hasn't moved the sheet snaps back", () => {
    expect(shouldDismiss(0, 600, 1)).toBe(false);
  });
});
