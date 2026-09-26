import {
  addCategory,
  addTransaction,
  deleteCategory,
  deleteTransaction,
  findRefundMatches,
  isOutsideCycle,
  moveTransaction,
  reassignCategory,
  updateTransaction,
} from "../groups";
import { createCycleGroup } from "../templates";
import { liveplusState, NOW } from "./helpers";

const setup = () => {
  const { state, template, group } = liveplusState();
  const october = createCycleGroup(template, "2026-10-14", NOW);
  let groups = [...state.groups, october];
  const a = addTransaction(groups, group.id, {
    name: "Swiggy", amount: 6000, categoryId: "dining-10", occurredAt: "2026-09-12T10:00:00.000Z",
  });
  const b = addTransaction(a.groups, group.id, {
    name: "Blinkit", amount: 6000, categoryId: "grocery-10", occurredAt: "2026-09-13T10:00:00.000Z",
  });
  return { groups: b.groups, sep: group.id, oct: october.id, first: a.transaction, second: b.transaction };
};

const g = (groups, id) => groups.find((x) => x.id === id);

test("shared Live+ cap: second 10% spend is clipped", () => {
  const { groups, sep } = setup();
  expect(g(groups, sep).transactions.map((t) => t.cashback)).toEqual([600, 400]);
  expect(g(groups, sep).totalCashback).toBe(1000);
});

test("editing an amount recomputes the whole cycle", () => {
  const { groups, sep, first } = setup();
  const next = updateTransaction(groups, sep, first.id, { amount: "1000" });
  expect(g(next, sep).transactions.map((t) => t.cashback)).toEqual([100, 600]);
});

test("moving to another cycle frees cap room in the source", () => {
  const { groups, sep, oct, first } = setup();
  const next = moveTransaction(groups, sep, first.id, oct, "dining-10");
  expect(g(next, sep).transactions).toHaveLength(1);
  expect(g(next, sep).transactions[0].cashback).toBe(600);
  expect(g(next, oct).transactions[0]).toMatchObject({ id: first.id, cashback: 600 });
});

test("moving within a group changes category", () => {
  const { groups, sep, first } = setup();
  const next = moveTransaction(groups, sep, first.id, sep, "other-1-5");
  expect(g(next, sep).transactions.find((t) => t.id === first.id)).toMatchObject({
    categoryId: "other-1-5", cashback: 90,
  });
});

test("move requires a valid destination category", () => {
  const { groups, sep, oct, first } = setup();
  expect(() => moveTransaction(groups, sep, first.id, oct, "nope")).toThrow();
});

test("move keeps the audit fields", () => {
  const { groups, sep, oct } = setup();
  const withAuto = addTransaction(groups, sep, {
    name: "X", amount: 10, categoryId: "other-1-5", sourceCandidateId: "cand-1", assignmentMode: "automatic",
  });
  const next = moveTransaction(withAuto.groups, sep, withAuto.transaction.id, oct, "other-1-5");
  expect(g(next, oct).transactions[0]).toMatchObject({ sourceCandidateId: "cand-1", assignmentMode: "automatic" });
});

test("deleteTransaction recomputes", () => {
  const { groups, sep, first } = setup();
  const next = deleteTransaction(groups, sep, first.id);
  expect(g(next, sep).totalCashback).toBe(600);
});

test("isOutsideCycle warns for dates outside the group", () => {
  const { groups, sep } = setup();
  expect(isOutsideCycle(g(groups, sep), "2026-10-10T10:00:00.000Z")).toBe(true);
  expect(isOutsideCycle(g(groups, sep), "2026-10-09T10:00:00.000Z")).toBe(false);
  expect(isOutsideCycle({ cycleStart: null }, "2026-10-10T10:00:00.000Z")).toBe(false);
});

describe("categories", () => {
  test("cannot delete a category that has transactions", () => {
    const { groups, sep } = setup();
    const r = deleteCategory(g(groups, sep), "dining-10");
    expect(r).toMatchObject({ ok: false, count: 1 });
  });

  test("reassign then delete, and cap pools drop the id", () => {
    const { groups, sep } = setup();
    const moved = reassignCategory(g(groups, sep), "dining-10", "other-1-5");
    const r = deleteCategory(moved, "dining-10");
    expect(r.ok).toBe(true);
    expect(r.group.categories.some((c) => c.id === "dining-10")).toBe(false);
    expect(r.group.capPools[0].categoryIds).toEqual(["grocery-10"]);
  });

  test("addCategory parses numbers and blank rate", () => {
    const { groups, sep } = setup();
    const next = addCategory(g(groups, sep), { name: "Promo", percentage: "", cap: "200" });
    const c = next.categories.at(-1);
    expect(c).toMatchObject({ name: "Promo", percentage: null, cap: 200, active: true });
  });
});

test("findRefundMatches ranks same merchant and amount first", () => {
  const { groups } = setup();
  const matches = findRefundMatches(groups, { amount: 6000, merchant: "BLINKIT" });
  expect(matches[0].tx.name).toBe("Blinkit");
  expect(findRefundMatches(groups, { amount: 7000, merchant: "x" })).toHaveLength(0);
});
