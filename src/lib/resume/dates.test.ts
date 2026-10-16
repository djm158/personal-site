import { describe, expect, test } from "vitest";
import {
  formatDuration,
  formatRange,
  formatYearSpan,
  inclusiveMonths,
  resumeSpan,
  roleMonths,
  toYearMonth,
  type Span,
} from "./dates";
import type { Role, YearMonth } from "./schema";

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

describe("formatYearSpan", () => {
  test.each<[string, YearMonth, YearMonth | undefined, string]>([
    ["within one year", "2026-01", "2026-09", "2026"],
    ["across years", "2022-03", "2025-11", "2022–25"],
    ["across a decade", "2019-06", "2021-02", "2019–21"],
    ["no end date", "2024-05", undefined, "2024–Present"],
  ])("%s", (_name, start, end, expected) => {
    expect(formatYearSpan(start, end)).toBe(expected);
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

describe("toYearMonth", () => {
  // new Date(year, monthIndex, day) is local time with a 0-based month, matching
  // the local getters toYearMonth reads
  test.each<[string, Date, YearMonth]>([
    ["January", new Date(2026, 0, 15), "2026-01"],
    ["December", new Date(2025, 11, 31), "2025-12"],
    ["a two-digit month", new Date(2026, 9, 1), "2026-10"],
  ])("%s", (_name, date, expected) => {
    expect(toYearMonth(date)).toBe(expected);
  });
});

describe("roleMonths", () => {
  const today: YearMonth = "2026-10";

  test.each<[string, Pick<Role, "start" | "end">, number]>([
    ["an ended role ignores today", { start: "2025-01", end: "2025-06" }, 6],
    [
      "a current role runs until today",
      { start: "2026-01", end: undefined },
      10,
    ],
    ["a role within one month", { start: "2023-01", end: "2023-01" }, 1],
  ])("%s", (_name, role, expected) => {
    expect(roleMonths(role, today)).toBe(expected);
  });
});

describe("resumeSpan", () => {
  const today: YearMonth = "2026-10";

  test.each<[string, Pick<Role, "start" | "end">[], Span]>([
    [
      "roles out of order",
      [
        { start: "2020-09", end: "2022-06" },
        { start: "2018-01", end: "2018-09" },
        { start: "2025-04", end: "2025-12" },
      ],
      { start: "2018-01", end: "2025-12", isCurrent: false },
    ],
    [
      "a current role ends today",
      [
        { start: "2018-01", end: "2018-09" },
        { start: "2026-01", end: undefined },
      ],
      { start: "2018-01", end: today, isCurrent: true },
    ],
    [
      "a single role",
      [{ start: "2023-01", end: "2023-01" }],
      { start: "2023-01", end: "2023-01", isCurrent: false },
    ],
    [
      "a role inside a longer one",
      [
        { start: "2020-01", end: "2024-12" },
        { start: "2022-03", end: "2022-08" },
      ],
      { start: "2020-01", end: "2024-12", isCurrent: false },
    ],
  ])("%s", (_name, roles, expected) => {
    expect(resumeSpan(roles, today)).toEqual(expected);
  });
});
