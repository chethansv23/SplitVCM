import { computeCycle, previewCashback, ROUNDING, withComputed } from "../compute";

const cat = (id, percentage, cap = null, extra = {}) => ({ id, name: id, percentage, cap, ...extra });
const tx = (id, amount, categoryId, day) => ({
  id,
  amount,
  categoryId,
  occurredAt: `2026-09-${String(day).padStart(2, "0")}T10:00:00.000Z`,
});

describe("computeCycle", () => {
  test("applies rate and per-transaction floor", () => {
    const r = computeCycle({ categories: [cat("a", 5)], transactions: [tx("1", 199, "a", 1)] });
    expect(r.perTransaction["1"].cashback).toBe(9); // 9.95 floored
    expect(r.total).toBe(9);
    expect(r.totalSpent).toBe(199);
  });

  test("category cap clips later transactions", () => {
    const r = computeCycle({
      categories: [cat("a", 10, 100)],
      transactions: [tx("1", 800, "a", 1), tx("2", 800, "a", 2)],
    });
    expect(r.perTransaction["1"].cashback).toBe(80);
    expect(r.perTransaction["2"].cashback).toBe(20);
    expect(r.perTransaction["2"].capped).toBe(true);
    expect(r.byCategory.a.remaining).toBe(0);
  });

  test("result is independent of insertion order (late arrivals)", () => {
    const base = { categories: [cat("a", 10, 100)] };
    const inOrder = computeCycle({ ...base, transactions: [tx("1", 800, "a", 1), tx("2", 800, "a", 2)] });
    const late = computeCycle({ ...base, transactions: [tx("2", 800, "a", 2), tx("1", 800, "a", 1)] });
    expect(late.perTransaction).toEqual(inOrder.perTransaction);
  });

  test("deleting a transaction gives cap room back to clipped ones", () => {
    const g = { categories: [cat("a", 10, 100)], transactions: [tx("1", 800, "a", 1), tx("2", 800, "a", 2)] };
    const after = computeCycle({ ...g, transactions: [g.transactions[1]] });
    expect(after.perTransaction["2"].cashback).toBe(80);
  });

  test("shared cap pool across categories (Airtel Axis food apps)", () => {
    const r = computeCycle({
      categories: [cat("swiggy", 10), cat("zomato", 10), cat("bb", 10)],
      capPools: [{ id: "food", cap: 500, categoryIds: ["swiggy", "zomato", "bb"] }],
      transactions: [tx("1", 3000, "swiggy", 1), tx("2", 3000, "zomato", 2)],
    });
    expect(r.perTransaction["1"].cashback).toBe(300);
    expect(r.perTransaction["2"].cashback).toBe(200);
    expect(r.byCapPool.food.remaining).toBe(0);
  });

  test("group cap applies after category caps", () => {
    const r = computeCycle({
      groupCap: 50,
      categories: [cat("a", 10), cat("b", 10)],
      transactions: [tx("1", 400, "a", 1), tx("2", 400, "b", 2)],
    });
    expect(r.perTransaction["2"].cashback).toBe(10);
    expect(r.groupRemaining).toBe(0);
  });

  test("group cap of 0 or empty string means no cap (legacy data)", () => {
    for (const groupCap of [0, "", "0", null]) {
      const r = computeCycle({ groupCap, categories: [cat("a", 10)], transactions: [tx("1", 1000, "a", 1)] });
      expect(r.total).toBe(100);
    }
  });

  test("excluded categories and unknown rates earn nothing", () => {
    const r = computeCycle({
      categories: [cat("x", 5, null, { excluded: true }), cat("u", null)],
      transactions: [tx("1", 1000, "x", 1), tx("2", 1000, "u", 2)],
    });
    expect(r.total).toBe(0);
    expect(r.perTransaction["2"].rateUnknown).toBe(true);
    expect(r.perTransaction["1"].rateUnknown).toBe(false);
  });

  test("refund claws back cashback and frees cap room", () => {
    const r = computeCycle({
      categories: [cat("a", 10, 100)],
      transactions: [tx("1", 800, "a", 1), tx("r", -800, "a", 2), tx("2", 800, "a", 3)],
    });
    expect(r.perTransaction.r.cashback).toBe(-80);
    expect(r.perTransaction["2"].cashback).toBe(80);
    expect(r.total).toBe(80);
  });

  test("refund cannot claw back more than was earned", () => {
    const r = computeCycle({
      categories: [cat("a", 10, 50)],
      transactions: [tx("1", 1000, "a", 1), tx("r", -1000, "a", 2)],
    });
    expect(r.perTransaction.r.cashback).toBe(-50);
    expect(r.total).toBe(0);
  });

  test("cycle-total-floor rounding floors only the total", () => {
    const r = computeCycle({
      rounding: ROUNDING.CYCLE_TOTAL_FLOOR,
      categories: [cat("a", 1.5)],
      transactions: [tx("1", 99, "a", 1), tx("2", 99, "a", 2)],
    });
    expect(r.perTransaction["1"].cashback).toBe(1.49); // 1.485 → 2dp
    expect(r.total).toBe(2); // floor(2.97)
  });

  test("reward value multiplies points to rupees", () => {
    const r = computeCycle({ rewardValue: 0.25, categories: [cat("a", 10)], transactions: [tx("1", 1000, "a", 1)] });
    expect(r.total).toBe(25);
  });
});

test("withComputed writes caches for list screens", () => {
  const g = withComputed({ categories: [cat("a", 10)], transactions: [tx("1", 1000, "a", 1)] });
  expect(g.totalCashback).toBe(100);
  expect(g.totalSpent).toBe(1000);
  expect(g.categories[0].totalCashback).toBe(100);
  expect(g.transactions[0].cashback).toBe(100);
});

test("previewCashback shows cashback and remaining caps", () => {
  const g = {
    categories: [cat("a", 10, 100)],
    capPools: [{ id: "p", name: "Pool", cap: 150, categoryIds: ["a"] }],
    transactions: [tx("1", 500, "a", 1)],
  };
  const p = previewCashback(g, { amount: 800, categoryId: "a", occurredAt: "2026-09-05T10:00:00.000Z" });
  expect(p.cashback).toBe(50);
  expect(p.capped).toBe(true);
  expect(p.categoryRemaining).toBe(0);
  expect(p.pools).toEqual([{ name: "Pool", remaining: 50 }]);
});
