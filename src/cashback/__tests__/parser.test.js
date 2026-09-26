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
