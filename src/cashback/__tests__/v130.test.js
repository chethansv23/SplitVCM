// Issues reported on 2 Oct 2026 (version 1.3.0).
import { cashbackFor, computeCycle, describeMethod, fromRoundOff, ROUNDING, toRoundOff } from "../compute";
import { findDuplicateCandidate, isDuplicate } from "../dedupe";
import { ingestMany, ingestNotification } from "../inbox";
import { parseNotification } from "../parser";
import { buildTemplate } from "../templates";
import { liveplusState, NOW } from "./helpers";

const SMS_APP = "com.google.android.apps.messaging";
const at = (h, m) => new Date(2026, 9, 2, h, m).toISOString();
// Two real HSBC alerts, same card and amount on the same day (digits changed).
const PANI_PURI = {
  title: "VM-HSBCIN-S",
  text: "HSBC: Rs 100.0 spent on your HSBC Credit Card ending 5678 at MM Chalukya Bangarpete Pani Puri Corner on 02 Oct 2026 through UPI: 615200000001. Trxn. not done by you? Call 18002673456.",
  sourceApp: SMS_APP,
  postedAt: at(8, 5),
};
const AMINAREDDY = {
  title: "VM-HSBCIN-S",
  text: "HSBC: Rs 100.0 spent on your HSBC Credit Card ending 5678 at AMINAREDDY on 02 Oct 2026 through UPI: 799600000002. Trxn. not done by you? Call 18002673456.",
  sourceApp: SMS_APP,
  postedAt: at(19, 40),
};
const LOAN_EMAIL = [
  "Dear Customer,",
  "Thank you for your continued relationship with HDFC Bank and we hope you are enjoying the benefits of your Credit Card.",
  "Your HDFC Bank Credit Card xx1234 has an updated pre-approved loan limit of Rs.800000. You can view the details and proceed digitally in just a few clicks.",
  "This opportunity to avail an instant loan on your Credit Card brings with itself:",
  "Lowest Interest Rate",
  "Increased Loan Limit",
  "Relaxed EMI Repayment",
].join("\n");

describe("1. how cashback is calculated (block amount is editable)", () => {
  const B = ROUNDING.PER_BLOCK_SPENT;
  test.each([
    ["HSBC: round down each spend", ROUNDING.PER_TRANSACTION_FLOOR, undefined, 120, 10, 12],
    ["₹100 blocks: ₹120 → 1 block", B, 100, 120, 10, 10],
    ["₹100 blocks: ₹199 → 1 block", B, 100, 199, 10, 10],
    ["₹100 blocks: under ₹100 earns nothing", B, 100, 99, 10, 0],
    ["₹120 blocks: ₹320 → 2 blocks = 240 × 10%", B, 120, 320, 10, 24],
    ["₹150 blocks: ₹320 → 2 blocks = 300 × 10%", B, 150, 320, 10, 30],
    ["₹150 blocks: ₹149 earns nothing", B, 150, 149, 10, 0],
    ["₹150 blocks at 3.3%: 2 × 150 × 3.3% = 9.9 → 9", B, 150, 300, 3.3, 9],
    ["blank block falls back to ₹100", B, "", 250, 10, 20],
    ["No rounding keeps paise", ROUNDING.NONE, undefined, 125, 10, 12.5],
    ["Refund mirrors blocks", B, 100, -120, 10, -10],
  ])("%s", (_, rounding, block, amount, rate, expected) => {
    expect(cashbackFor(amount, rate, rounding, 1, block)).toBe(expected);
  });

  test("drafts saved as 'per-100-spent' still mean ₹100 blocks", () => {
    expect(cashbackFor(120, 10, "per-100-spent", 1, 999)).toBe(10);
  });

  test("the group's block amount is used across a cycle, with caps", () => {
    const r = computeCycle({
      rounding: B,
      blockSize: 150,
      categories: [{ id: "a", percentage: 10, cap: 40 }],
      transactions: [
        { id: "1", amount: 320, categoryId: "a", occurredAt: "2026-10-01T10:00:00Z" },
        { id: "2", amount: 160, categoryId: "a", occurredAt: "2026-10-02T10:00:00Z" },
      ],
    });
    expect(Object.values(r.perTransaction).map((t) => t.cashback)).toEqual([30, 10]);
  });

  test("describeMethod explains the round-off with a worked example on ₹325.50", () => {
    expect(describeMethod(B, 150)).toEqual({ label: "Round off per ₹150", example: "10% of ₹325.50 = ₹30 (counts ₹300)" });
    expect(describeMethod(B, 120).example).toBe("10% of ₹325.50 = ₹24 (counts ₹240)");
    expect(describeMethod(B, 100).example).toBe("10% of ₹325.50 = ₹30 (counts ₹300)");
    expect(describeMethod(ROUNDING.PER_TRANSACTION_FLOOR)).toEqual({ label: "Round off per ₹1", example: "10% of ₹325.50 = ₹32" });
    expect(describeMethod(ROUNDING.NONE)).toEqual({ label: "No round-off", example: "10% of ₹325.50 = ₹32.55" });
  });

  test("popup model: no round-off, or round off per ₹ value (1 = each spend)", () => {
    expect(fromRoundOff(false, "")).toMatchObject({ rounding: ROUNDING.NONE });
    expect(fromRoundOff(true, "1")).toEqual({ rounding: ROUNDING.PER_TRANSACTION_FLOOR, blockSize: 1 });
    expect(fromRoundOff(true, "100")).toEqual({ rounding: B, blockSize: 100 });
    expect(fromRoundOff(true, "150")).toEqual({ rounding: B, blockSize: 150 });
    expect(fromRoundOff(true, "0")).toBeNull();
    expect(fromRoundOff(true, "")).toBeNull();
    expect(toRoundOff(ROUNDING.PER_TRANSACTION_FLOOR)).toEqual({ roundOff: true, per: 1, cycleTotal: false });
    expect(toRoundOff(B, 150)).toEqual({ roundOff: true, per: 150 });
    expect(toRoundOff(ROUNDING.NONE)).toEqual({ roundOff: false, per: 1 });
  });

  test("PhonePe SBI cards use ₹100 blocks by default; HSBC rounds each spend", () => {
    const sbi = buildTemplate("phonepe-sbi", { variant: "PURPLE" }, NOW);
    expect([sbi.rounding, sbi.blockSize]).toEqual([B, 100]);
    expect(buildTemplate("hsbc-live-plus", {}, NOW).rounding).toBe(ROUNDING.PER_TRANSACTION_FLOOR);
  });

  test("a cycle created from a card keeps its block amount", () => {
    const { createCycleGroup } = require("../templates");
    const t = { ...buildTemplate("phonepe-sbi", { variant: "PURPLE" }, NOW), blockSize: 150 };
    expect(createCycleGroup(t, "2026-10-02", NOW).blockSize).toBe(150);
  });
});

describe("2. two spends of the same amount on the same day are not duplicates", () => {
  test("parser reads the UPI reference", () => {
    expect(parseNotification(PANI_PURI).reference).toBe("615200000001");
    expect(parseNotification({ text: "Rs 10 debited via UPI Ref No 123456789 on 02-10-26" }).reference).toBe("123456789");
    expect(parseNotification({ text: "Rs 10 spent on Card XX1111 at X on 02-10-26. Call 18002673456" }).reference).toBeNull();
  });

  test("the reported pair: different merchants and references → two spends", () => {
    expect(isDuplicate(parseNotification(PANI_PURI), parseNotification(AMINAREDDY))).toBe(false);
  });

  test("both are recorded when they arrive", () => {
    const { state } = liveplusState();
    const { state: next, summary } = ingestMany(state, [PANI_PURI, AMINAREDDY], NOW);
    expect(summary.duplicate).toBe(0);
    expect(next.candidates).toHaveLength(2);
  });

  test("different references alone mean different spends", () => {
    const a = parseNotification(PANI_PURI);
    const b = { ...a, reference: "999999999999" };
    expect(isDuplicate(a, b)).toBe(false);
  });

  test("the same reference from SMS and email is one spend", () => {
    const sms = parseNotification(PANI_PURI);
    const email = parseNotification({
      text: "Rs.100.00 was spent on your HSBC Credit Card ending 5678 towards MM Chalukya Pani Puri on 02 Oct 2026. UPI Ref 615200000001",
      postedAt: at(9, 30),
    });
    expect(isDuplicate(sms, email)).toBe(true);
  });

  test("an SMS and a later email without references still merge when the merchant matches", () => {
    const { state } = liveplusState();
    const text = "Rs.100.00 was spent on your HSBC Credit Card ending 5678 at AMINAREDDY on 02 Oct 2026.";
    const { summary } = ingestMany(state, [
      { text, sourceApp: SMS_APP, postedAt: at(8, 0) },
      { text, sourceApp: "com.google.android.gm", postedAt: at(12, 0) },
    ], NOW);
    expect(summary.duplicate).toBe(1);
  });

  test("two different SMS from the same app are two spends, even with no reference or merchant difference", () => {
    const { state } = liveplusState();
    const one = { text: "Rs 100.0 spent on your HSBC Credit Card ending 5678 at CAFE on 02 Oct 2026.", sourceApp: SMS_APP, postedAt: at(8, 0) };
    const two = { ...one, text: one.text + " ", postedAt: at(18, 0) };
    expect(ingestMany(state, [one, two], NOW).summary.duplicate).toBe(0);
  });

  test("the exact same SMS text queued twice is still one spend", () => {
    const { state } = liveplusState();
    const r = ingestNotification(state, PANI_PURI, NOW);
    expect(findDuplicateCandidate(parseNotification(PANI_PURI), r.state.candidates, 10, {
      sourceApp: SMS_APP,
      rawText: [PANI_PURI.title, PANI_PURI.text].join("\n"),
    })).toBeTruthy();
  });
});

describe("3. loan and limit offers are not spends", () => {
  test.each([
    ["the reported email", LOAN_EMAIL],
    ["loan line without 'pre-approved'", "Your HDFC Bank Credit Card xx1234 has an updated loan limit of Rs.800000."],
    ["instant loan offer", "Get an instant loan of Rs 2,00,000 on your Credit Card XX1234. Amount used: none."],
    ["limit increase", "Your credit limit has been increased to Rs 3,00,000 on Card XX1234. Not used yet."],
  ])("%s → ignored", (_, text) => {
    expect(parseNotification({ text, postedAt: NOW.toISOString() })).toMatchObject({ kind: "ignore", ignoreReason: "promotional" });
  });

  test("a loan line next to a clear spend is kept (a missed spend is worse than an extra review)", () => {
    const p = parseNotification({ text: "Your HDFC Bank Credit Card xx1234 has an updated loan limit of Rs.800000. Rs 500 spent at STORE." });
    expect(p.kind).toBe("debit");
  });

  test("a real spend that mentions EMI is still a spend", () => {
    const p = parseNotification({
      text: "Rs.25,000.00 spent on HDFC Bank Card x1234 at CROMA on 2026-10-02:11:20:00. This transaction is eligible for EMI conversion.",
    });
    expect(p).toMatchObject({ kind: "debit", amount: 25000, merchant: "CROMA" });
  });
});
