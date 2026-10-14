import { describe, expect, test } from "vitest";
import { formatDuration, formatRange, inclusiveMonths } from "./dates";
import type { YearMonth } from "./schema";

describe("inclusiveMonths", () => {
  test.each<[string, YearMonth, YearMonth, number]>([
    ["within the same year", "2026-01", "2026-09", 9],
    ["across different years", "2025-01", "2026-09", 21],
    ["across a year boundary", "2025-12", "2026-01", 2],
    ["exactly one year", "2025-01", "2025-12", 12],
    ["the same month", "2023-01", "2023-01", 1],
  ])("%s: %s to %s is %i", (_name, start, end, expected) => {
    expect(inclusiveMonths(start, end)).toBe(expected);
  });
});

describe("formatRange", () => {
  test.each<[string, YearMonth, YearMonth | undefined, string]>([
    ["no end date", "2026-01", undefined, "Jan 2026 — Present"],
    ["end date", "2026-01", "2026-09", "Jan 2026 — Sep 2026"],
    ["across years", "2025-03", "2026-07", "Mar 2025 — Jul 2026"],
  ])("%s", (_name, start, end, expected) => {
    expect(formatRange(start, end)).toBe(expected);
  });
});

describe("formatDuration", () => {
  test.each([
    [12, "1 yr"],
    [24, "2 yrs"],
    [1, "1 mo"],
    [8, "8 mos"],
    [25, "2 yrs 1 mo"],
    [0, ""],
  ])("%i months is '%s'", (numMonths, expected) => {
    expect(formatDuration(numMonths)).toBe(expected);
  });
});
