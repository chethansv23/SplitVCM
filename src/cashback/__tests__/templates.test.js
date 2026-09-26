import {
  applyTemplateToGroup,
  CATALOGUE,
  buildTemplate,
  createCycleGroup,
  cyclesToOffer,
  deleteTemplateCategory,
  findCycleGroup,
} from "../templates";
import { NOW } from "./helpers";

describe("catalogue", () => {
  test.each(Object.keys(CATALOGUE))("%s has a 0%% excluded category and a default", (key) => {
    const options = { variant: "PURPLE", prime: "Yes" };
    const t = buildTemplate(key, options, NOW);
    expect(t.categories.filter((c) => c.excluded)).toHaveLength(1);
    expect(t.categories.filter((c) => c.isDefault)).toHaveLength(1);
    const ids = t.categories.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const pool of t.capPools) {
      for (const id of pool.categoryIds) expect(ids).toContain(id);
    }
  });

  test("PhonePe SBI requires a variant and sets rates from it", () => {
    expect(() => buildTemplate("phonepe-sbi", {}, NOW)).toThrow("Card variant is required");
    const black = buildTemplate("phonepe-sbi", { variant: "SELECT BLACK" }, NOW);
    expect(black.name).toBe("PhonePe SBI SELECT BLACK");
    expect(black.categories.find((c) => c.id === "phonepe").percentage).toBe(10);
    expect(black.cycle).toEqual({ mode: "calendar-month" });
  });

  test("Amazon ICICI rate depends on Prime", () => {
    const rate = (prime) =>
      buildTemplate("amazon-icici", { prime }, NOW).categories.find((c) => c.id === "amazon").percentage;
    expect(rate("Yes")).toBe(5);
    expect(rate("No")).toBe(3);
  });

  test("HSBC RuPay rates are intentionally blank", () => {
    const t = buildTemplate("hsbc-rupay", {}, NOW);
    expect(t.categories.filter((c) => !c.excluded).every((c) => c.percentage === null)).toBe(true);
    expect(t.upiEnabled).toBe(true);
  });
});

describe("createCycleGroup", () => {
  test("names the period and snapshots categories", () => {
    const t = buildTemplate("hsbc-live-plus", {}, NOW);
    const g = createCycleGroup(t, "2026-09-14", NOW);
    expect(g).toMatchObject({
      name: "HSBC Live+ · 10 Sep–09 Oct 2026",
      templateId: t.id,
      cycleStart: "2026-09-10",
      cycleEnd: "2026-10-09",
      status: "open",
    });
    expect(g.categories.map((c) => c.id)).toEqual(t.categories.map((c) => c.id));
    expect(g.capPools[0].cap).toBe(1000);
    expect(findCycleGroup([g], t.id, { start: "2026-09-10", end: "2026-10-09" })).toBe(g);
  });

  test("HDFC Millennia needs a start day first", () => {
    const t = buildTemplate("hdfc-millennia", {}, NOW);
    expect(() => createCycleGroup(t, "2026-09-14", NOW)).toThrow("start day");
    const g = createCycleGroup({ ...t, cycle: { mode: "billing-cycle", startDay: 5 } }, "2026-09-14", NOW);
    expect(g.cycleStart).toBe("2026-09-05");
  });
});

test("cyclesToOffer suggests the next cycle only after one exists and has ended", () => {
  const t = buildTemplate("hsbc-live-plus", {}, NOW);
  const sep = createCycleGroup(t, "2026-09-14", NOW);
  expect(cyclesToOffer([t], [], new Date("2026-10-12T10:00:00"))).toEqual([]);
  expect(cyclesToOffer([t], [sep], new Date("2026-09-20T10:00:00"))).toEqual([]);
  const offers = cyclesToOffer([t], [sep], new Date("2026-10-12T10:00:00"));
  expect(offers).toHaveLength(1);
  expect(offers[0].range).toEqual({ start: "2026-10-10", end: "2026-11-09" });
});

test("deleteTemplateCategory cleans pools and learned rules", () => {
  const t = {
    ...buildTemplate("hsbc-live-plus", {}, NOW),
    merchantRules: [{ id: "r", merchantKey: "x", categoryId: "dining-10" }],
  };
  const next = deleteTemplateCategory(t, "dining-10");
  expect(next.categories.some((c) => c.id === "dining-10")).toBe(false);
  expect(next.capPools[0].categoryIds).toEqual(["grocery-10"]);
  expect(next.merchantRules).toEqual([]);
});

test("applyTemplateToGroup updates rates and keeps group-only categories", () => {
  const t = buildTemplate("hsbc-live-plus", {}, NOW);
  const g = {
    ...createCycleGroup(t, "2026-09-14", NOW),
    transactions: [{ id: "1", amount: 1000, categoryId: "grocery-10", occurredAt: "2026-09-14T10:00:00Z" }],
  };
  g.categories.push({ id: "custom", name: "Custom", percentage: 2 });
  const edited = {
    ...t,
    categories: t.categories.map((c) => (c.id === "grocery-10" ? { ...c, percentage: 5 } : c)),
  };
  const next = applyTemplateToGroup(edited, g);
  expect(next.categories.find((c) => c.id === "grocery-10").percentage).toBe(5);
  expect(next.categories.some((c) => c.id === "custom")).toBe(true);
  expect(next.totalCashback).toBe(50);
});
