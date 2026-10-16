import type { YearMonth, Role } from "./schema";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export const roleMonths = (
  role: Pick<Role, "start" | "end">,
  today: YearMonth,
): number => inclusiveMonths(role.start, role.end ?? today);

export type Span = { start: YearMonth; end: YearMonth; isCurrent: boolean };

// A role with no end runs until today, so a current role makes the span end today
export const resumeSpan = (
  roles: Pick<Role, "start" | "end">[],
  today: YearMonth,
): Span => {
  // YYYY-MM strings compare chronologically, so plain < and > find the extremes
  const start = roles
    .map((r) => r.start)
    .reduce((earliest, start) => (start < earliest ? start : earliest));
  const end = roles
    .map((r) => r.end ?? today)
    .reduce((latest, end) => (end > latest ? end : latest));
  const isCurrent = roles.some((r) => !r.end);

  return { start, end, isCurrent };
};

export const toYearMonth = (d: Date): YearMonth => {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` as YearMonth;
};

export const getYearAndMonth = (d: YearMonth): [number, number] => {
  const [year, month] = d.split("-").map(Number);
  return [year, month];
};

export const formatYearMonth = (d: YearMonth): string => {
  const [year, month] = getYearAndMonth(d);
  return `${MONTH_NAMES[month - 1].slice(0, 3)} ${year}`;
};

export const inclusiveMonths = (start: YearMonth, end: YearMonth): number => {
  const [startYear, startMonth] = getYearAndMonth(start);
  const [endYear, endMonth] = getYearAndMonth(end);

  const yearsDiff = endYear - startYear;
  const monthsDiff = endMonth - startMonth;

  return yearsDiff * 12 + monthsDiff + 1;
};

export const formatRange = (start: YearMonth, end?: YearMonth): string => {
  const formattedStart = formatYearMonth(start);
  const formattedEnd = end ? formatYearMonth(end) : "Present";

  return `${formattedStart} — ${formattedEnd}`;
};

// Compact years for the home page: "2026", "2022–25", or "2024–Present" for a current role
export const formatYearSpan = (start: YearMonth, end?: YearMonth): string => {
  const [startYear] = getYearAndMonth(start);
  if (!end) return `${startYear}–Present`;

  const [endYear] = getYearAndMonth(end);
  return startYear === endYear
    ? String(startYear)
    : `${startYear}–${String(endYear).slice(2)}`;
};

export const formatDuration = (numMonths: number): string => {
  const years = Math.floor(numMonths / 12);
  const months = numMonths % 12;

  const yearsPart = years ? `${years} ${years > 1 ? "yrs" : "yr"}` : "";

  const monthsPart = months ? `${months} ${months > 1 ? "mos" : "mo"}` : "";

  return [yearsPart, monthsPart].filter(Boolean).join(" ");
};
