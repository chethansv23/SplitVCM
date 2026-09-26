import { exportBackup, parseBackup } from "../backup";
import { migrateGroupV0 } from "../migration";
import { liveplusState, NOW } from "./helpers";

// Shape written by the original CreateCashbackGroup / CashbackGroupDetails.
const v0Group = {
  id: 1758600000000,
  name: "Credit Card A",
  groupCap: "",
  totalCashback: 999, // stale cache
  categories: [
    { name: "Recharge", percentage: 10, cap: 100, totalCashback: 100, totalSpent: 0 },
    { name: "Other", percentage: 1, cap: null, totalCashback: 5, totalSpent: 0 },
  ],
  transactions: [
    { id: 1758600001000, name: "Airtel", amount: 800, category: "Recharge", cashback: 80 },
    { id: 1758600002000, name: "Jio", amount: 800, category: "Recharge", cashback: 20 },
    { id: 1758600003000, name: "Misc", amount: 500, category: "Other", cashback: 5 },
  ],
};

describe("migrateGroupV0", () => {
  const g = migrateGroupV0(v0Group);

  test("gives categories stable ids and links transactions by id", () => {
    expect(g.categories.map((c) => c.id)).toEqual(["cat-recharge", "cat-other"]);
    expect(g.transactions.map((t) => t.categoryId)).toEqual(["cat-recharge", "cat-recharge", "cat-other"]);
    expect(g.transactions[0]).not.toHaveProperty("category");
  });

  test("converts ids and timestamps", () => {
    expect(g.id).toBe("1758600000000");
    expect(g.createdAt).toBe(new Date(1758600000000).toISOString());
    expect(g.transactions[0].occurredAt).toBe(new Date(1758600001000).toISOString());
  });

  test("marks it as a manual open group and recomputes totals", () => {
    expect(g).toMatchObject({ templateId: null, status: "open", groupCap: null });
    expect(g.transactions.map((t) => t.cashback)).toEqual([80, 20, 5]);
    expect(g.totalCashback).toBe(105);
  });

  test("duplicate category names get distinct ids", () => {
    const d = migrateGroupV0({ ...v0Group, categories: [{ name: "A", percentage: 1 }, { name: "A", percentage: 2 }], transactions: [] });
    expect(new Set(d.categories.map((c) => c.id)).size).toBe(2);
  });

  test("unknown category name leaves the transaction uncategorised", () => {
    const d = migrateGroupV0({ ...v0Group, transactions: [{ id: 1, amount: 10, category: "Gone" }] });
    expect(d.transactions[0].categoryId).toBeNull();
    expect(d.transactions[0].cashback).toBe(0);
  });
});

describe("backup", () => {
  test("round trip without captured text by default", () => {
    const { state } = liveplusState();
    const s = { ...state, candidates: [{ id: "c", rawText: "secret", duplicateSources: [{ rawText: "x" }] }] };
    const json = exportBackup(s, { now: NOW });
    const restored = parseBackup(json);
    expect(restored.groups[0].id).toBe(state.groups[0].id);
    expect(restored.templates[0].id).toBe(state.templates[0].id);
    expect(restored.candidates[0].rawText).toBeNull();
    expect(json).not.toContain("secret");
  });

  test("can include captured text when asked", () => {
    const { state } = liveplusState();
    const s = { ...state, candidates: [{ id: "c", rawText: "secret" }] };
    expect(parseBackup(exportBackup(s, { includeCapturedText: true })).candidates[0].rawText).toBe("secret");
  });

  test.each([
    ["not json", "{", "not valid JSON"],
    ["other app", JSON.stringify({ app: "X" }), "not a SplitVCM backup"],
    ["wrong version", JSON.stringify({ app: "SplitVCM", schemaVersion: 99 }), "Unsupported"],
    ["missing arrays", JSON.stringify({ app: "SplitVCM", schemaVersion: 1 }), "missing"],
  ])("rejects %s", (_, json, message) => {
    expect(() => parseBackup(json)).toThrow(message);
  });
});
