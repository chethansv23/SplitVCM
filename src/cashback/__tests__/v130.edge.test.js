// Retest of version 1.3.0 across the combinations the features can meet:
// round-off with caps, pools, refunds, reward points and old data; duplicate
// rules in every direction; parser edge cases; backups and card linking.
import { exportBackup, parseBackup } from "../backup";
import { cashbackFor, computeCycle, describeMethod, fromRoundOff, previewCashback, ROUNDING, toRoundOff, withComputed } from "../compute";
import { isDuplicate } from "../dedupe";
import { addTransaction, moveTransaction } from "../groups";
import { ingestMany } from "../inbox";
import { migrateGroupV0 } from "../migration";
import { parseNotification } from "../parser";
import { applyTemplateToGroup, buildTemplate, createCycleGroup, trackGroupWithCard } from "../templates";
import { liveplusState, NOW } from "./helpers";

const B = ROUNDING.PER_BLOCK_SPENT;
const tx = (id, amount, categoryId = "a", day = 1) => ({
  id, amount, categoryId, occurredAt: `2026-10-${String(day).padStart(2, "0")}T10:00:00.000Z`,
});

describe("round-off: every value and combination", () => {
  test.each([
    // [value, amount, rate, expected]
    [1, 325.5, 10, 32],
    [1, 9.99, 10, 0],
    [10, 325.5, 10, 32], // 320 counted
    [100, 325.5, 10, 30],
    [120, 325.5, 10, 24],
    [150, 325.5, 10, 30],
    [500, 325.5, 10, 0],
    [0.5, 10.75, 10, 1], // 10.5 counted → 1.05 → 1
    [100, 1000, 1.5, 15],
    [150, 1000, 3.3, 29], // 900 counted → 29.7 → 29
  ])("per ₹%p: %p at %p%% → %p", (per, amount, rate, expected) => {
    const m = fromRoundOff(true, per);
    expect(cashbackFor(amount, rate, m.rounding, 1, m.blockSize)).toBe(expected);
  });

  test("no round-off keeps paise and never shows float noise", () => {
    expect(cashbackFor(325.5, 10, ROUNDING.NONE)).toBe(32.55);
    expect(cashbackFor(0.1 + 0.2, 100, ROUNDING.NONE)).toBe(0.3);
  });

  test("per ₹1 matches the original HSBC rounding for whole-rupee spends", () => {
    for (const amount of [1, 99, 120, 899, 6000, 12345]) {
      const perOne = fromRoundOff(true, 1);
      expect(cashbackFor(amount, 10, perOne.rounding, 1, perOne.blockSize))
        .toBe(Math.floor((amount * 10) / 100));
    }
  });

  test("blocks with a category cap and a shared pool", () => {
    const g = {
      rounding: B,
      blockSize: 150,
      categories: [{ id: "a", percentage: 10, cap: 50 }, { id: "b", percentage: 10 }],
      capPools: [{ id: "p", name: "Pool", cap: 60, categoryIds: ["a", "b"] }],
      transactions: [tx("1", 320, "a", 1), tx("2", 320, "a", 2), tx("3", 320, "b", 3)],
    };
    const r = computeCycle(g);
    // 30 + 20 (category cap 50) + 10 (pool cap 60)
    expect(Object.values(r.perTransaction).map((t) => t.cashback)).toEqual([30, 20, 10]);
    expect(r.byCapPool.p.remaining).toBe(0);
  });

  test("blocks with reward points (₹0.25 per point)", () => {
    const r = computeCycle({ rounding: B, blockSize: 100, rewardValue: 0.25, categories: [{ id: "a", percentage: 10 }], transactions: [tx("1", 1000)] });
    expect(r.total).toBe(25);
  });

  test("a refund under blocks claws back by the same blocks", () => {
    const r = computeCycle({
      rounding: B, blockSize: 100,
      categories: [{ id: "a", percentage: 10 }],
      transactions: [tx("1", 320, "a", 1), tx("r", -320, "a", 2)],
    });
    expect(r.perTransaction.r.cashback).toBe(-30);
    expect(r.total).toBe(0);
  });

  test("cycle-total rounding from before 1.3.0 still works and is shown in words", () => {
    const r = computeCycle({ rounding: ROUNDING.CYCLE_TOTAL_FLOOR, categories: [{ id: "a", percentage: 1.5 }], transactions: [tx("1", 99), tx("2", 99, "a", 2)] });
    expect(r.total).toBe(2);
    expect(describeMethod(ROUNDING.CYCLE_TOTAL_FLOOR).label).toBe("Cycle total rounded down");
    expect(toRoundOff(ROUNDING.CYCLE_TOTAL_FLOOR)).toEqual({ roundOff: true, per: 1, cycleTotal: true });
  });

  test("old groups with no round-off fields use per ₹1, as before", () => {
    const g = migrateGroupV0({ id: 1, name: "Old", categories: [{ name: "A", percentage: 10 }], transactions: [{ id: 2, amount: 325.5, category: "A" }] });
    expect(g.totalCashback).toBe(32);
    expect(describeMethod(g.rounding, g.blockSize).label).toBe("Round off per ₹1");
    const noFields = withComputed({ categories: [{ id: "a", percentage: 10 }], transactions: [tx("1", 325.5)] });
    expect(noFields.totalCashback).toBe(32);
  });

  test("a bad stored block size falls back to ₹100 instead of breaking", () => {
    for (const blockSize of [0, -5, "abc", null, undefined]) {
      expect(cashbackFor(320, 10, B, 1, blockSize)).toBe(30);
    }
  });

  test("preview and moving a transaction use each group's own round-off", () => {
    const { state, template, group } = liveplusState();
    const blocks = { ...createCycleGroup(template, "2026-10-14", NOW), rounding: B, blockSize: 150 };
    const groups = addTransaction([...state.groups, blocks], group.id, { name: "X", amount: 325.5, categoryId: "grocery-10", occurredAt: "2026-09-20T10:00:00Z" }).groups;
    expect(groups[0].totalCashback).toBe(32);
    expect(previewCashback(blocks, { amount: 325.5, categoryId: "grocery-10", occurredAt: "2026-10-20T10:00:00Z" }).cashback).toBe(30);
    const moved = moveTransaction(groups, group.id, groups[0].transactions[0].id, blocks.id, "grocery-10");
    expect(moved[1].totalCashback).toBe(30);
  });
});

describe("round-off travels with cards, cycles, linking and backups", () => {
  test("applying a card to its open cycles copies the round-off", () => {
    const t = { ...buildTemplate("hsbc-live-plus", {}, NOW), rounding: B, blockSize: 150 };
    const g = { ...createCycleGroup(buildTemplate("hsbc-live-plus", {}, NOW), "2026-10-14", NOW), transactions: [tx("1", 325.5, "grocery-10", 14)] };
    const next = applyTemplateToGroup(t, g);
    expect([next.rounding, next.blockSize, next.totalCashback]).toEqual([B, 150, 30]);
  });

  test("linking a manual group keeps its round-off on the new card", () => {
    const g = { ...migrateGroupV0({ id: 1, name: "SBI", categories: [{ name: "A", percentage: 10 }], transactions: [] }), rounding: B, blockSize: 150 };
    const r = trackGroupWithCard({ groups: [g], templates: [], candidates: [], settings: {} }, g.id, { cardLastFour: "1111", cycle: { mode: "calendar-month" } }, NOW);
    expect([r.template.rounding, r.template.blockSize]).toEqual([B, 150]);
  });

  test("backup export and import keep the round-off", () => {
    const { state } = liveplusState();
    const s = { ...state, groups: state.groups.map((g) => ({ ...g, rounding: B, blockSize: 150 })) };
    const back = parseBackup(exportBackup(s, { now: NOW }));
    expect([back.groups[0].rounding, back.groups[0].blockSize]).toEqual([B, 150]);
  });
});

describe("duplicates: every direction", () => {
  const base = { amount: 100, direction: "debit", cardLastFour: "1234", occurredAt: "2026-10-02T08:00:00Z", dateFromText: true, timeFromText: false };
  test.each([
    ["same reference", { reference: "111111" }, { reference: "111111", merchant: "Other" }, true],
    ["different references", { reference: "111111" }, { reference: "222222" }, false],
    ["one has a reference, same merchant", { reference: "111111", merchant: "AMINAREDDY" }, { merchant: "Aminareddy" }, true],
    ["merchant written two ways", { merchant: "Swiggy" }, { merchant: "SWIGGY INSTAMART" }, true],
    ["different merchants", { merchant: "Pani Puri Corner" }, { merchant: "AMINAREDDY" }, false],
    ["no merchants, same day", {}, { occurredAt: "2026-10-02T14:00:00Z" }, true], // 19:30 IST
    ["no merchants, different day", {}, { occurredAt: "2026-10-03T08:00:00Z" }, false],
    ["20:00 UTC is already the next day in India", {}, { occurredAt: "2026-10-02T20:00:00Z" }, false],
    ["same reference, different card", { reference: "111111" }, { reference: "111111", cardLastFour: "9999" }, false],
    ["same reference, different amount", { reference: "111111" }, { reference: "111111", amount: 101 }, false],
    ["same reference, debit vs refund", { reference: "111111" }, { reference: "111111", direction: "credit" }, false],
  ])("%s", (_, a, b, expected) => {
    expect(isDuplicate({ ...base, ...a }, { ...base, ...b })).toBe(expected);
  });

  test("the same SMS delivered twice (same arrival time) is one spend", () => {
    const { state } = liveplusState();
    const sms = {
      text: "HSBC: Rs 100.0 spent on your HSBC Credit Card ending 5678 at SHOP A on 14 Sep 2026.",
      sourceApp: "com.google.android.apps.messaging",
      postedAt: new Date(2026, 8, 14, 8, 0).toISOString(),
    };
    expect(ingestMany(state, [sms, { ...sms }], NOW).summary.duplicate).toBe(1);
  });

  test("three ₹100 SMS on one day from the same app are three spends, even two identical ones", () => {
    const { state } = liveplusState();
    const sms = (shop, h) => ({
      text: `HSBC: Rs 100.0 spent on your HSBC Credit Card ending 5678 at ${shop} on 14 Sep 2026.`,
      sourceApp: "com.google.android.apps.messaging",
      postedAt: new Date(2026, 8, 14, h, 0).toISOString(),
    });
    const { state: next, summary } = ingestMany(state, [sms("SHOP A", 8), sms("SHOP B", 12), sms("SHOP A", 18)], NOW);
    expect(summary.duplicate).toBe(0);
    expect(next.candidates).toHaveLength(3);
  });
});

describe("parser: references and offers", () => {
  test.each([
    ["UPI: 615200079966", "615200079966"],
    ["UPI Ref 123456789012", "123456789012"],
    ["UPI Ref No. 123456", "123456"],
    ["Ref No 1234567", "1234567"],
    ["RRN 987654321098", "987654321098"],
    ["Ref# 555555", "555555"],
    ["Call 18002673456", null],
    ["UPI Ref 1234", null],
  ])("%s → %p", (snippet, expected) => {
    expect(parseNotification({ text: `Rs 10 spent on Card XX1234 at SHOP on 02-10-26. ${snippet}` }).reference).toBe(expected);
  });

  test("an 'Avl limit' footer on a real spend is not mistaken for a limit offer", () => {
    const p = parseNotification({ text: "HSBC Credit Card xx5678 used at CAFE for INR 120.00 on 02/10/26. Avl limit INR 281245.21; due INR 4754.79." });
    expect(p).toMatchObject({ kind: "debit", amount: 120, merchant: "CAFE" });
  });

  test("a spend alert that mentions a loan elsewhere in a bundle is not dropped when split", () => {
    // The listener now sends each bundled message separately; the spend
    // message on its own is a normal spend.
    const p = parseNotification({ text: "Rs 500.0 spent on your HSBC Credit Card ending 5678 at STORE on 02 Oct 2026." });
    expect(p.kind).toBe("debit");
  });
});
