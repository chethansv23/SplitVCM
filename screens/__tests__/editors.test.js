import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import CategoryEditor from "../cashback/CategoryEditor";
import TransactionEditor from "../cashback/TransactionEditor";
import { addTransaction } from "../../src/cashback/groups";
import { getState } from "../../src/cashback/store";
import { createCycleGroup } from "../../src/cashback/templates";
import { hsbcAlert, liveplusState, NOW } from "../../src/cashback/__tests__/helpers";
import { ingestNotification } from "../../src/cashback/inbox";
import { makeNavigation, mockAlerts, seed } from "./testUtils";

let alerts;
let nav;
beforeEach(() => {
  alerts = mockAlerts();
  nav = makeNavigation();
});
afterEach(() => alerts.restore());

const groupState = () => {
  const ctx = liveplusState();
  const { groups, transaction } = addTransaction(ctx.state.groups, ctx.group.id, {
    name: "Blinkit", amount: 1000, categoryId: "grocery-10", occurredAt: "2026-09-14T10:00:00.000Z",
  });
  return { ...ctx, state: { ...ctx.state, groups }, tx: transaction };
};
const group = async () => (await getState()).groups[0];

describe("CategoryEditor — group categories", () => {
  const open = async (state, groupId, categoryId) => {
    await seed(state);
    await render(<CategoryEditor route={{ params: { target: "group", ownerId: groupId, categoryId } }} navigation={nav} />);
    await screen.findByText("Save category");
  };

  test("edits rate, cap and keywords; cashback is recalculated", async () => {
    const { state, group: g } = groupState();
    await open(state, g.id, "grocery-10");
    await fireEvent.changeText(screen.getByDisplayValue("10"), "5");
    await fireEvent.changeText(screen.getByPlaceholderText("swiggy, zomato"), "blinkit, zepto ");
    await fireEvent.press(screen.getByText("Save category"));
    await waitFor(() => expect(nav.goBack).toHaveBeenCalled());
    const c = (await group()).categories.find((x) => x.id === "grocery-10");
    expect(c).toMatchObject({ percentage: 5, keywords: ["blinkit", "zepto"] });
    expect((await group()).totalCashback).toBe(50);
  });

  test("blank rate is saved as unknown; blank name is rejected", async () => {
    const { state, group: g } = groupState();
    await open(state, g.id, "grocery-10");
    await fireEvent.changeText(screen.getByLabelText(/^Rate %/), "");
    await fireEvent.changeText(screen.getByLabelText("Name"), " ");
    await fireEvent.press(screen.getByText("Save category"));
    expect(alerts.last().title).toBe("Enter a name");
    await fireEvent.changeText(screen.getByLabelText("Name"), "Groceries");
    await fireEvent.press(screen.getByText("Save category"));
    await waitFor(() => expect(nav.goBack).toHaveBeenCalled());
    expect((await group()).categories.find((x) => x.id === "grocery-10")).toMatchObject({ name: "Groceries", percentage: null });
  });

  test("adds a new category at the end; only one default", async () => {
    const { state, group: g } = groupState();
    await open(state, g.id, undefined);
    await fireEvent.changeText(screen.getByLabelText("Name"), "Fuel");
    await fireEvent(screen.getByLabelText("Default suggestion"), "valueChange", true);
    await fireEvent.press(screen.getByText("Save category"));
    await waitFor(() => expect(nav.goBack).toHaveBeenCalled());
    const cats = (await group()).categories;
    expect(cats.at(-1)).toMatchObject({ name: "Fuel", isDefault: true });
    expect(cats.filter((c) => c.isDefault)).toHaveLength(1);
  });

  test("a category with transactions can only be deleted after reassigning", async () => {
    const { state, group: g } = groupState();
    await open(state, g.id, "grocery-10");
    expect(screen.getByText(/1 transaction\(s\) use this category/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Reassign & delete"));
    await alerts.press("Delete");
    expect(alerts.last().title).toBe("Reassign first");
    expect((await group()).categories.some((c) => c.id === "grocery-10")).toBe(true);

    await fireEvent.press(screen.getByText("1.5% other eligible"));
    await fireEvent.press(screen.getByText("Reassign & delete"));
    await alerts.press("Delete");
    await waitFor(async () => expect((await group()).categories.some((c) => c.id === "grocery-10")).toBe(false));
    expect((await group()).transactions[0]).toMatchObject({ categoryId: "other-1-5", cashback: 15 });
  });

  test("an unused category is deleted directly", async () => {
    const { state, group: g } = groupState();
    await open(state, g.id, "dining-10");
    await fireEvent.press(screen.getByText("Delete category"));
    await alerts.press("Delete");
    await waitFor(async () => expect((await group()).categories.some((c) => c.id === "dining-10")).toBe(false));
  });
});

describe("CategoryEditor — card template categories", () => {
  test("deleting from a card cleans its pools and leaves existing groups alone", async () => {
    const { state, template, group: g } = groupState();
    await seed(state);
    await render(<CategoryEditor route={{ params: { target: "template", ownerId: template.id, categoryId: "dining-10" } }} navigation={nav} />);
    expect(await screen.findByText(/affects new cycles only/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Delete category"));
    await alerts.press("Delete");
    const s = await getState();
    expect(s.templates[0].categories.some((c) => c.id === "dining-10")).toBe(false);
    expect(s.templates[0].capPools[0].categoryIds).toEqual(["grocery-10"]);
    expect(s.groups.find((x) => x.id === g.id).categories.some((c) => c.id === "dining-10")).toBe(true);
  });
});

describe("TransactionEditor", () => {
  const open = async (state, groupId, txId) => {
    await seed(state);
    await render(<TransactionEditor route={{ params: { groupId, txId } }} navigation={nav} />);
    await screen.findByText("Delete transaction");
  };

  test("edits name, amount, date and category", async () => {
    const { state, group: g, tx } = groupState();
    await open(state, g.id, tx.id);
    await fireEvent.changeText(screen.getByDisplayValue("Blinkit"), "Blinkit Order");
    await fireEvent.changeText(screen.getByDisplayValue("1000"), "2000");
    await fireEvent.changeText(screen.getByDisplayValue("2026-09-14 15:30"), "2026-09-15 09:00");
    await fireEvent.press(screen.getByText("1.5% other eligible (1.5%)"));
    await fireEvent.press(screen.getByText("Save"));
    await waitFor(() => expect(nav.goBack).toHaveBeenCalled());
    expect((await group()).transactions[0]).toMatchObject({ name: "Blinkit Order", amount: 2000, categoryId: "other-1-5", cashback: 30 });
  });

  test("rejects a bad date or amount", async () => {
    const { state, group: g, tx } = groupState();
    await open(state, g.id, tx.id);
    await fireEvent.changeText(screen.getByDisplayValue("2026-09-14 15:30"), "14/09/2026");
    await fireEvent.press(screen.getByText("Save"));
    expect(alerts.last().title).toMatch(/YYYY-MM-DD/);
    await fireEvent.changeText(screen.getByDisplayValue("1000"), "abc");
    await fireEvent.press(screen.getByText("Save"));
    expect(alerts.last().title).toBe("Enter an amount");
  });

  test("moves to the next cycle, warning because the date is outside it", async () => {
    const ctx = groupState();
    const october = createCycleGroup(ctx.template, "2026-10-14", NOW);
    await open({ ...ctx.state, groups: [...ctx.state.groups, october] }, ctx.group.id, ctx.tx.id);
    await fireEvent.press(screen.getByText(october.name));
    expect(screen.getByText(/outside the selected group's cycle/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Move & save"));
    expect(alerts.last().title).toBe("Outside the cycle");
    await alerts.press("Save anyway");
    const s = await getState();
    expect(s.groups[0].transactions).toHaveLength(0);
    expect(s.groups[1].transactions[0]).toMatchObject({ id: ctx.tx.id, categoryId: "grocery-10" });
  });

  test("shows the captured source text for an automatic transaction", async () => {
    const ctx = liveplusState();
    const { state } = ingestNotification(ctx.state, hsbcAlert("BIGBASKET"), NOW);
    await open(state, ctx.group.id, state.groups[0].transactions[0].id);
    expect(screen.getByText(/Added: automatic · rule keyword:grocery-10/)).toBeTruthy();
    expect(screen.getByText(/Source: sms-notification/)).toBeTruthy();
    expect(screen.getByText(/has been used for INR 899.00 at BIGBASKET/)).toBeTruthy();
  });

  test("delete", async () => {
    const { state, group: g, tx } = groupState();
    await open(state, g.id, tx.id);
    await fireEvent.press(screen.getByText("Delete transaction"));
    await alerts.press("Delete");
    await waitFor(async () => expect((await group()).transactions).toHaveLength(0));
  });
});
