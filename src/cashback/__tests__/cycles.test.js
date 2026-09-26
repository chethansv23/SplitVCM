import { cycleForDate, cycleGroupName, isCycleConfigured, nextCycle } from "../cycles";
import { parseEditableDateTime, toDateKey, toEditableDateTime } from "../dates";

const billing = (startDay) => ({ mode: "billing-cycle", startDay });

describe("cycleForDate", () => {
  test("HSBC Live+ 10th-to-10th: 14 Sep falls in 10 Sep–09 Oct", () => {
    expect(cycleForDate(billing(10), "2026-09-14")).toEqual({ start: "2026-09-10", end: "2026-10-09" });
  });

  test("a date before the start day belongs to the previous cycle", () => {
    expect(cycleForDate(billing(10), "2026-09-09")).toEqual({ start: "2026-08-10", end: "2026-09-09" });
  });

  test("the start day itself begins a new cycle", () => {
    expect(cycleForDate(billing(15), "2026-09-15").start).toBe("2026-09-15");
  });

  test("crosses the year boundary", () => {
    expect(cycleForDate(billing(12), "2027-01-05")).toEqual({ start: "2026-12-12", end: "2027-01-11" });
  });

  test("calendar month", () => {
    expect(cycleForDate({ mode: "calendar-month" }, "2026-02-14")).toEqual({ start: "2026-02-01", end: "2026-02-28" });
    expect(cycleForDate({ mode: "calendar-month" }, "2028-02-29")).toEqual({ start: "2028-02-01", end: "2028-02-29" });
  });

  test("start day 31 clamps to the end of short months", () => {
    expect(cycleForDate(billing(31), "2026-03-15")).toEqual({ start: "2026-02-28", end: "2026-03-30" });
    expect(cycleForDate(billing(31), "2026-03-31")).toEqual({ start: "2026-03-31", end: "2026-04-29" });
  });

  test("uses local time: 00:30 IST on the 10th is in the new cycle", () => {
    // 2026-09-09T19:00Z is 00:30 on 10 Sep in IST.
    expect(cycleForDate(billing(10), "2026-09-09T19:00:00.000Z").start).toBe("2026-09-10");
  });

  test("unconfigured billing cycle returns null", () => {
    expect(isCycleConfigured(billing(null))).toBe(false);
    expect(cycleForDate(billing(null), "2026-09-14")).toBeNull();
  });
});

test("nextCycle follows on from the current end", () => {
  const current = cycleForDate(billing(10), "2026-09-14");
  expect(nextCycle(billing(10), current)).toEqual({ start: "2026-10-10", end: "2026-11-09" });
});

test("cycleGroupName makes the period explicit", () => {
  expect(cycleGroupName("HSBC Live+", { start: "2026-09-10", end: "2026-10-09" })).toBe(
    "HSBC Live+ · 10 Sep–09 Oct 2026"
  );
  expect(cycleGroupName("Airtel Axis", { start: "2026-12-12", end: "2027-01-11" })).toBe(
    "Airtel Axis · 12 Dec 2026–11 Jan 2027"
  );
});

test("editable date-time round trip and validation", () => {
  const iso = parseEditableDateTime("2026-09-23 10:30");
  expect(toEditableDateTime(iso)).toBe("2026-09-23 10:30");
  expect(toDateKey(iso)).toBe("2026-09-23");
  expect(parseEditableDateTime("2026-02-30")).toBeNull();
  expect(parseEditableDateTime("23/09/2026")).toBeNull();
});
