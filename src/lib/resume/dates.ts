import type { YearMonth } from "./schema";

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

export const currentYearMonth = (d: Date): YearMonth => {
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

export const formatDuration = (numMonths: number): string => {
  const years = Math.floor(numMonths / 12);
  const months = numMonths % 12;

  const yearsPart = years ? `${years} ${years > 1 ? "yrs" : "yr"}` : "";

  const monthsPart = months ? `${months} ${months > 1 ? "mos" : "mo"}` : "";

  return [yearsPart, monthsPart].filter(Boolean).join(" ");
};
