import { addDays, daysInMonth, formatRange, fromDateKey, toDateKey } from "./dates";

// Start date of the cycle that begins in the given month. Start days past
// the end of a short month clamp to its last day.
const cycleStartInMonth = (startDay, year, monthIndex) => {
  const day = Math.min(startDay, daysInMonth(year, monthIndex));
  return toDateKey(new Date(year, monthIndex, day));
};

export const isCycleConfigured = (cycle) =>
  Boolean(cycle) &&
  (cycle.mode === "calendar-month" ||
    (cycle.mode === "billing-cycle" &&
      Number.isInteger(cycle.startDay) &&
      cycle.startDay >= 1 &&
      cycle.startDay <= 31));

// Returns { start, end } (inclusive local date keys) for the cycle containing
// `date`. The end is always the day before the next cycle starts.
export const cycleForDate = (cycle, date) => {
  if (!isCycleConfigured(cycle)) return null;
  const d =
    date instanceof Date
      ? date
      : /^\d{4}-\d{2}-\d{2}$/.test(date)
      ? fromDateKey(date)
      : new Date(date);
  const year = d.getFullYear();
  const month = d.getMonth();
  const startDay = cycle.mode === "calendar-month" ? 1 : cycle.startDay;

  let start = cycleStartInMonth(startDay, year, month);
  if (toDateKey(d) < start) {
    const prev = new Date(year, month - 1, 1);
    start = cycleStartInMonth(startDay, prev.getFullYear(), prev.getMonth());
  }
  const [sy, sm] = start.split("-").map(Number);
  const next = new Date(sy, sm, 1); // first of the following month
  const nextStart = cycleStartInMonth(startDay, next.getFullYear(), next.getMonth());
  return { start, end: addDays(nextStart, -1) };
};

export const nextCycle = (cycle, current) =>
  cycleForDate(cycle, addDays(current.end, 1));

export const cycleGroupName = (templateName, range) =>
  `${templateName} · ${formatRange(range.start, range.end)}`;
