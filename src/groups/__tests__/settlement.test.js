import { calculateSettlements, calculateTotals, formatSettlements } from "../settlement";

const item = (payer, amount, deleted = false) => ({ name: "x", payer, amount: String(amount), deleted });

test("totals skip deleted items", () => {
  expect(calculateTotals([item("A", 100), item("B", 50.5), item("A", 999, true)])).toEqual({
    total: 150.5,
    paidBy: { A: 100, B: 50.5 },
  });
});

test("two people: the one who paid less pays the difference", () => {
  expect(calculateSettlements(["A", "B"], [item("A", 300), item("B", 100)])).toEqual([
    { from: "B", to: "A", amount: "100.00" },
  ]);
});

test("uneven split (100 among 3) terminates and adds up exactly", () => {
  const s = calculateSettlements(["A", "B", "C"], [item("A", 100)]);
  expect(s).toEqual([
    { from: "B", to: "A", amount: "33.33" },
    { from: "C", to: "A", amount: "33.33" },
  ]);
  // A's share is 33.34 (gets the leftover paisa); 33.33 + 33.33 + 33.34 = 100.
});

test("decimal amounts that break floating-point equality still settle", () => {
  const s = calculateSettlements(["A", "B", "C"], [item("A", 0.1), item("B", 0.2), item("C", 0.3)]);
  expect(s).toEqual([{ from: "A", to: "C", amount: "0.10" }]);
  expect(s.every((x) => x.amount !== "0.00")).toBe(true);
});

test("members who paid nothing and payers who are not members", () => {
  const s = calculateSettlements(["A", "B"], [item("A", 50), item("A", 50)]);
  expect(s).toEqual([{ from: "B", to: "A", amount: "50.00" }]);
  expect(calculateSettlements([], [item("A", 10)])).toEqual([]);
});

test("everyone square", () => {
  const s = calculateSettlements(["A", "B"], [item("A", 50), item("B", 50)]);
  expect(s).toEqual([]);
  expect(formatSettlements(s)).toMatch(/square/);
  expect(formatSettlements([{ from: "B", to: "A", amount: "10.00" }])).toBe("B pays A ₹10.00");
});
