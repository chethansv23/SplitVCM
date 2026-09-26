// Date helpers. Cycle boundaries are local calendar dates ("YYYY-MM-DD"),
// compared as strings; transaction times are ISO strings.

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

const pad = (n) => String(n).padStart(2, "0");

export const daysInMonth = (year, monthIndex) =>
  new Date(year, monthIndex + 1, 0).getDate();

export const toDateKey = (date) => {
  const d = date instanceof Date ? date : new Date(date);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const fromDateKey = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
};

export const addDays = (key, days) => {
  const d = fromDateKey(key);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
};

export const isDateKeyInRange = (key, start, end) =>
  Boolean(start && end) && key >= start && key <= end;

// "10 Sep–09 Oct 2026"; the start year is shown only when it differs.
export const formatRange = (start, end) => {
  const s = fromDateKey(start);
  const e = fromDateKey(end);
  const startYear = s.getFullYear() !== e.getFullYear() ? ` ${s.getFullYear()}` : "";
  return `${pad(s.getDate())} ${MONTHS[s.getMonth()]}${startYear}–${pad(
    e.getDate()
  )} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
};

export const formatDateTime = (iso) => {
  if (!iso) return "";
  const d = new Date(iso);
  return `${pad(d.getDate())} ${MONTHS[d.getMonth()]} ${d.getFullYear()} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
};

// Editable "YYYY-MM-DD HH:mm" text <-> ISO string.
export const toEditableDateTime = (iso) => {
  const d = iso ? new Date(iso) : new Date();
  return `${toDateKey(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const parseEditableDateTime = (text) => {
  const m = /^\s*(\d{4})-(\d{2})-(\d{2})(?:\s+(\d{1,2}):(\d{2}))?\s*$/.exec(
    text || ""
  );
  if (!m) return null;
  const [, y, mo, d, h = "0", mi = "0"] = m;
  const date = new Date(+y, +mo - 1, +d, +h, +mi);
  if (date.getMonth() !== +mo - 1 || date.getDate() !== +d) return null;
  return date.toISOString();
};

export const MONTH_NAMES = MONTHS;
