import { toDateKey } from "../dates";
import { extractDate, merchantFromVpa, parseNotification } from "../parser";
import { CREDIT_ALERTS, DEBIT_ALERTS, IGNORED_ALERTS } from "./fixtures/alerts";

const POSTED = "2026-09-25T06:00:00.000Z";

describe("parseNotification — debit fixtures", () => {
  test.each(DEBIT_ALERTS.map((a) => [a.name, a]))("%s", (_, alert) => {
    const p = parseNotification({ text: alert.text, title: alert.title, postedAt: POSTED });
    expect(p.kind).toBe("debit");
    const { day, ...fields } = alert.expected;
    expect(p).toMatchObject(fields);
    expect(toDateKey(p.occurredAt)).toBe(day);
    expect(p.dateFromText).toBe(true);
  });
});

describe("parseNotification — credits", () => {
  test.each(CREDIT_ALERTS.map((a) => [a.name, a]))("%s", (_, alert) => {
    const p = parseNotification({ text: alert.text, postedAt: POSTED });
    expect(p.kind).toBe("credit");
    expect(p).toMatchObject(alert.expected);
  });
});

describe("parseNotification — ignored", () => {
  test.each(IGNORED_ALERTS.map((a) => [a.reason, a]))("%s", (reason, alert) => {
    const p = parseNotification({ text: alert.text, postedAt: POSTED });
    expect(p.kind).toBe("ignore");
    expect(p.ignoreReason).toBe(reason);
  });

  test("cash withdrawals are kept when enabled", () => {
    const text = IGNORED_ALERTS.find((a) => a.reason === "cash-withdrawal").text;
    const p = parseNotification({ text, postedAt: POSTED, includeCashWithdrawals: true });
    expect(p.kind).toBe("debit");
    expect(p.amount).toBe(2000);
  });
});

describe("parseNotification — edge cases", () => {
  test("falls back to notification time when the text has no date, with lower confidence", () => {
    const p = parseNotification({ text: "Rs.100 spent on Card XX1111 at CAFE COFFEE", postedAt: POSTED });
    expect(p.occurredAt).toBe(POSTED);
    expect(p.dateFromText).toBe(false);
    expect(p.confidence).toBe("medium");
  });

  test("missing amount is reported as null", () => {
    const p = parseNotification({ text: "Your card XX1111 was used at STORE on 01-09-26", postedAt: POSTED });
    expect(p.kind).toBe("debit");
    expect(p.amount).toBeNull();
  });

  test("bank-account debits are kept when enabled", () => {
    const text = "Rs 2,000.00 debited from A/c XX4455 on 20-09-26 to VPA friend@okaxis. UPI Ref 1234";
    const p = parseNotification({ text, postedAt: POSTED, includeBankAccountDebits: true });
    expect(p).toMatchObject({ kind: "debit", accountType: "account", channel: "upi" });
  });

  test("email addresses are not mistaken for UPI handles", () => {
    const p = parseNotification({
      text: "Rs.100 spent on Card XX1111 at STORE on 01-09-26. Queries: support@gmail.com",
      postedAt: POSTED,
    });
    expect(p.channel).toBe("card");
  });

  test("extractDate handles am/pm and rejects impossible dates", () => {
    expect(extractDate("on 05-Sep-2026 at 07:15 pm").getHours()).toBe(19);
    expect(extractDate("on 31/02/26")).toBeNull();
  });

  test("merchantFromVpa maps known handles and strips digits", () => {
    expect(merchantFromVpa("zomato-order@hdfcbank")).toBe("Zomato");
    expect(merchantFromVpa("localshop123@ybl")).toBe("localshop");
  });
});

describe("review fixes", () => {
  test('a transaction ending "Never share your OTP" is kept', () => {
    const p = parseNotification({
      text: "Rs.450.00 spent on HDFC Bank Card x1234 at ZOMATO on 2026-09-20:13:05:00. Never share your OTP with anyone. Call 18002586161",
      postedAt: POSTED,
    });
    expect(p.kind).toBe("debit");
    expect(p.merchant).toBe("ZOMATO");
  });

  test.each([
    "482913 is your OTP for txn of Rs 999 at AMAZON on card XX1234",
    "OTP is 4829 for your transaction of Rs.999 at AMAZON",
    "Use verification code 99812 to complete payment of INR 120",
  ])("OTP deliveries are ignored: %s", (text) => {
    expect(parseNotification({ text, postedAt: POSTED }).ignoreReason).toBe("otp");
  });

  test("HDFC-style 2026-09-23:10:30:00 reads 10:30, not 23:10", () => {
    const p = parseNotification({
      text: "Rs.1,250.00 spent on HDFC Bank Card x1234 at SWIGGY on 2026-09-23:10:30:00",
      postedAt: POSTED,
    });
    const d = new Date(p.occurredAt);
    expect([d.getHours(), d.getMinutes()]).toEqual([10, 30]);
    expect(p.timeFromText).toBe(true);
  });

  test("a time is not taken from inside a date like 23-09-26", () => {
    const d = extractDate("spent on 23-09-26 at STORE");
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([23, 0, 0]);
  });

  test("date-only alerts are flagged as having no time", () => {
    const p = parseNotification({ text: "INR 450.50 spent on Axis Bank Card XX4321 on 13-09-26 at ZOMATO.", postedAt: POSTED });
    expect(p).toMatchObject({ dateFromText: true, timeFromText: false });
  });
});
