import { decideAssignment } from "../matcher";
import { ingestNotification, pendingCandidates, recheckPending } from "../inbox";
import { migrateGroupV0 } from "../migration";
import { parseNotification } from "../parser";
import { trackGroupWithCard } from "../templates";
import { liveplusState, NOW } from "./helpers";

// A manual group like "Bbb" in the app: one 10% category capped at ₹250 and
// a transaction from December 2025, with no card behind it.
const manualState = () => {
  const group = migrateGroupV0({
    id: 1765718220000,
    name: "Bbb",
    groupCap: "",
    categories: [{ name: "Vv", percentage: 10, cap: 250 }],
    transactions: [{ id: 1765718220001, name: "Ccc", amount: 888, category: "Vv" }],
  });
  return { groups: [group], templates: [], candidates: [], settings: {} };
};
const SMS = {
  text: "HSBC Credit Card xx7342 used at VV STORE for INR 500.00 on 26/09/26 at 14:10.",
  sourceApp: "com.google.android.apps.messaging",
};

test("a manual group cannot receive alerts: no card to match", () => {
  const s = manualState();
  expect(decideAssignment(parseNotification(SMS), s).reasons).toContain("no-card-match");
});

test("tracking turns the group into a card and makes it the current cycle", () => {
  const s = manualState();
  const r = trackGroupWithCard(s, s.groups[0].id, { cardLastFour: "7342", cycle: { mode: "billing-cycle", startDay: 10 } }, NOW);
  expect(r.template).toMatchObject({ name: "Bbb", cardLastFour: "7342", cycle: { mode: "billing-cycle", startDay: 10 } });
  expect(r.template.categories.map((c) => [c.name, c.percentage, c.cap])).toEqual([
    ["Vv", 10, 250],
    ["0% / excluded", 0, null],
  ]);
  const g = r.state.groups[0];
  expect(g).toMatchObject({ templateId: r.template.id, cycleStart: "2026-09-10", cycleEnd: "2026-10-09", status: "open" });
  // The December 2025 transaction stays, and is reported as outside the cycle.
  expect(g.transactions).toHaveLength(1);
  expect(r.outsideCycle).toBe(1);
  expect(g.totalCashback).toBe(88);
});

test("after tracking, a matching alert finds the card and the group", () => {
  const s = manualState();
  const { state } = trackGroupWithCard(s, s.groups[0].id, { cardLastFour: "7342", cycle: { mode: "billing-cycle", startDay: 10 } }, NOW);
  const d = decideAssignment(parseNotification(SMS), state);
  expect(d.suggestion.groupId).toBe(s.groups[0].id);
  expect(d.suggestion.categoryId).toBe("cat-vv"); // first category becomes the default suggestion
  // Manual categories have no merchant keywords yet, so the first alert asks.
  expect(d.reasons).toEqual(["unknown-merchant"]);
});

test("with a keyword on the category, alerts are added automatically", () => {
  const s = manualState();
  let { state } = trackGroupWithCard(s, s.groups[0].id, { cardLastFour: "7342", cycle: { mode: "calendar-month" } }, NOW);
  state = {
    ...state,
    groups: state.groups.map((g) => ({ ...g, categories: g.categories.map((c) => (c.name === "Vv" ? { ...c, keywords: ["vv store"] } : c)) })),
  };
  const r = ingestNotification(state, SMS, NOW);
  expect(r.outcome).toBe("assigned");
  expect(r.state.groups[0].transactions.at(-1)).toMatchObject({ name: "VV STORE", amount: 500, cashback: 50 });
});

test("an alert waiting in review is picked up once the group is tracked", () => {
  const s = manualState();
  const waiting = ingestNotification(s, SMS, NOW).state;
  expect(pendingCandidates(waiting)[0].reviewReasons).toContain("no-card-match");
  const { state } = trackGroupWithCard(waiting, s.groups[0].id, { cardLastFour: "7342", cycle: { mode: "calendar-month" } }, NOW);
  const after = recheckPending(state, NOW).state;
  expect(pendingCandidates(after)[0]).toMatchObject({ reviewReasons: ["unknown-merchant"], suggestedGroupId: s.groups[0].id });
});

describe("rejected without changing anything", () => {
  const cycle = { mode: "billing-cycle", startDay: 10 };
  test.each([
    ["missing digits", { cardLastFour: "", cycle }, "last four digits"],
    ["three digits", { cardLastFour: "734", cycle }, "last four digits"],
    ["letters", { cardLastFour: "73a2", cycle }, "last four digits"],
    ["no start day", { cardLastFour: "7342", cycle: { mode: "billing-cycle", startDay: null } }, "start day"],
    ["start day 32", { cardLastFour: "7342", cycle: { mode: "billing-cycle", startDay: 32 } }, "start day"],
  ])("%s", (_, input, message) => {
    const s = manualState();
    const before = JSON.stringify(s);
    expect(() => trackGroupWithCard(s, s.groups[0].id, input, NOW)).toThrow(message);
    expect(JSON.stringify(s)).toBe(before);
  });

  test("digits already used by another card", () => {
    const { state } = liveplusState();
    const s = { ...state, groups: [...state.groups, ...manualState().groups] };
    expect(() => trackGroupWithCard(s, manualState().groups[0].id, { cardLastFour: "5678", cycle }, NOW)).toThrow("HSBC Live+ already uses •••• 5678");
  });

  test("a group that is already linked, or does not exist", () => {
    const { state, group } = liveplusState();
    expect(() => trackGroupWithCard(state, group.id, { cardLastFour: "1111", cycle }, NOW)).toThrow("already linked");
    expect(() => trackGroupWithCard(state, "nope", { cardLastFour: "1111", cycle }, NOW)).toThrow("Group not found");
  });

  test("a group whose card was deleted can be linked again", () => {
    const { state, group } = liveplusState();
    const orphan = { ...state, templates: [] };
    expect(trackGroupWithCard(orphan, group.id, { cardLastFour: "5678", cycle }, NOW).template.cardLastFour).toBe("5678");
  });
});
