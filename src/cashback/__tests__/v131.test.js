// Issues reported on 3 Oct 2026 after installing 1.3.0 (fixed in 1.3.1).
import { explainCapture } from "../captureDiagnostics";
import { ingestMany } from "../inbox";
import { parseNotification } from "../parser";
import { NOW } from "./helpers";

const SMS_APP = "com.google.android.apps.messaging";
// Real alerts from the phone (card digits, references and phone numbers changed).
const REAL_SPENDS = [
  {
    name: "HSBC 'used at … for INR'",
    title: "VM-HSBCIN-S",
    text: "HSBC Credit Card xx1111 used at VISHAL MEGA MART for INR 1585.87 on 03/10/26. Avl limit INR 282112.21; due INR 3887.79. Call +910000000000 to report fraud.",
    expected: { amount: 1585.87, cardLastFour: "1111", merchant: "VISHAL MEGA MART" },
  },
  {
    name: "SBI 'ending with … via UPI (Ref No. …)'",
    title: "JD-SBICRD-S",
    text: "Rs.420.00 spent on your SBI Credit Card ending with 2222 at PADMASHREEFUELS on 03-10-26 via UPI (Ref No. 790200000001). Trxn. not done by you? Report at https://sbicard.com/Dispute",
    expected: { amount: 420, cardLastFour: "2222", merchant: "PADMASHREEFUELS", reference: "790200000001" },
  },
  {
    name: "HSBC 'Rs … spent … through UPI'",
    title: "VM-HSBCIN-S",
    text: "HSBC: Rs 3549.0 spent on your HSBC Credit Card ending 3333 at MANIPAL HEALTH ENTERPRISES PRIVATE LIMITED on 03 Oct 2026 through UPI: 316000000002. Trxn. not done by you? Call 18002673456.",
    expected: { amount: 3549, cardLastFour: "3333", merchant: "MANIPAL HEALTH ENTERPRISES PRIVATE LIMITED", reference: "316000000002" },
  },
];

const CRED_REWARD = [
  "CRED",
  "Your shopping trip unlocked something exclusive.",
  "You've earned ₹75 CRED cashback on your recent Apparel purchase.",
  "",
  "Use it to reduce your next credit card or utility bill payment.",
  "",
  "Tap below and claim it in the next 7 days.",
].join("\n");

describe("1. real spends are read", () => {
  test.each(REAL_SPENDS.map((s) => [s.name, s]))("%s", (_, sms) => {
    const p = parseNotification({ title: sms.title, text: sms.text, postedAt: new Date(2026, 9, 3, 11, 0).toISOString() });
    expect(p).toMatchObject({ kind: "debit", accountType: "card", ...sms.expected });
    expect(p.dateFromText).toBe(true);
  });

  test("text that also carries Android's hidden-content placeholder is still read", () => {
    // The listener now joins every field; one may be the placeholder.
    const sms = REAL_SPENDS[2];
    const p = parseNotification({ title: sms.title, text: `Sensitive notification content hidden\n${sms.text}` });
    expect(p).toMatchObject({ kind: "debit", amount: 3549, cardLastFour: "3333" });
  });

  test("a notification with only the placeholder is not a spend", () => {
    expect(parseNotification({ text: "Sensitive notification content hidden" }).kind).toBe("ignore");
  });

  test("all three are recorded, none dropped or merged", () => {
    const state = { groups: [], templates: [], candidates: [], settings: {} };
    const raws = REAL_SPENDS.map((s, i) => ({
      title: s.title, text: s.text, sourceApp: SMS_APP, postedAt: new Date(2026, 9, 3, 9 + i, 0).toISOString(),
    }));
    const { state: next, summary } = ingestMany(state, raws, NOW);
    expect(summary.ignored).toBe(0);
    expect(summary.duplicate).toBe(0);
    expect(next.candidates).toHaveLength(3);
  });
});

describe("2. rewards and cashback offers are not spends", () => {
  test("the CRED cashback message is ignored", () => {
    expect(parseNotification({ text: CRED_REWARD })).toMatchObject({ kind: "ignore", ignoreReason: "cashback-posting" });
  });

  test.each([
    "Congrats! You won ₹50 cashback on your last purchase. Claim now.",
    "Claim your reward of Rs 100 on your recent purchase before it expires.",
    "You have earned 250 reward points worth Rs 62.50 on your Credit Card XX1234 purchase.",
    "Scratch card unlocked: Rs 25 cashback for your transaction. Tap to claim.",
  ])("%s → ignored", (text) => {
    expect(parseNotification({ text }).kind).toBe("ignore");
  });

  test.each([
    ["spend that also earns points", "Rs 500.00 spent on HDFC Bank Card x1234 at AMAZON on 03-10-26. You earned 10 reward points.", 500],
    ["spend with a cashback note", "INR 899.00 debited from your Credit Card XX1234 at BIGBASKET on 03-10-26. Cashback will be credited in your statement.", 899],
    ["used-at with rewards", "HSBC Credit Card xx1234 used at CAFE for INR 120.00 on 03/10/26. Earn rewards on every spend.", 120],
  ])("a real %s is still a spend", (_, text, amount) => {
    expect(parseNotification({ text })).toMatchObject({ kind: "debit", amount });
  });
});

describe("3. Capture status", () => {
  const on = { captureEnabled: true, consentAcceptedAt: "2026-10-03T00:00:00Z" };

  test("after Reset counters, notifications seen prove the listener is connected", () => {
    const r = explainCapture({
      available: true, granted: true, settings: on,
      diagnostics: { connectedCount: 0, postedCount: 9, queuedCount: 0 },
    });
    expect(r.steps.find((s) => s.label === "Listener connected by Android").ok).toBe(true);
  });

  test("hidden text is reported with what to do", () => {
    const r = explainCapture({
      available: true, granted: true, settings: on,
      diagnostics: { connectedCount: 1, postedCount: 9, hiddenCount: 2, queuedCount: 0 },
    });
    const step = r.steps.find((s) => s.label === "Text hidden by Android: 2");
    expect(step.ok).toBe(false);
    expect(r.verdict).toMatch(/Paste an alert to test/);
  });
});
