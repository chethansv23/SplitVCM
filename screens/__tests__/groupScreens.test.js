import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import CashbackGroupDetails from "../CashbackGroupDetails";
import CreateGroupScreen from "../CreateGroupScreen";
import GroupDetailsScreen from "../GroupDetailsScreen";
import GroupsScreen from "../GroupsScreen";
import { getState } from "../../src/cashback/store";
import { liveplusState } from "../../src/cashback/__tests__/helpers";
import { choose, makeNavigation, mockAlerts, seed } from "./testUtils";

// useFocusEffect needs a navigator; run it as a plain effect.
jest.mock("@react-navigation/native", () => {
  const React = require("react");
  return {
    ...jest.requireActual("@react-navigation/native"),
    useFocusEffect: (cb) => React.useEffect(cb, [cb]),
  };
});

let alerts;
let nav;
beforeEach(async () => {
  alerts = mockAlerts();
  nav = makeNavigation();
  await AsyncStorage.clear();
});
afterEach(() => alerts.restore());

describe("CashbackGroupDetails actions", () => {
  const open = async () => {
    const ctx = liveplusState();
    await seed(ctx.state);
    await render(<CashbackGroupDetails route={{ params: { groupId: ctx.group.id } }} navigation={nav} />);
    await screen.findByText("Add Transaction");
    return ctx;
  };
  const group = async () => (await getState()).groups[0];

  test("adds a manual transaction with a live cashback preview", async () => {
    await open();
    await fireEvent.press(screen.getByText("Add Transaction"));
    await fireEvent.changeText(screen.getByPlaceholderText("Name / merchant"), "Zepto");
    await fireEvent.changeText(screen.getByPlaceholderText("Amount"), "500");
    await fireEvent.changeText(screen.getByLabelText("Date & time (YYYY-MM-DD HH:mm)"), "2026-09-20 11:00");
    await fireEvent.press(screen.getByText("10% groceries (0/∞)"));
    expect(screen.getByText(/Cashback: ₹50/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Add Item"));
    await waitFor(async () => expect((await group()).transactions).toHaveLength(1));
    expect((await group()).transactions[0]).toMatchObject({ name: "Zepto", amount: 500, categoryId: "grocery-10", assignmentMode: "manual" });
    expect(await screen.findByText(/manual/)).toBeTruthy();
  });

  test("warns before adding a date outside the cycle", async () => {
    await open();
    await fireEvent.press(screen.getByText("Add Transaction"));
    await fireEvent.changeText(screen.getByPlaceholderText("Amount"), "100");
    await fireEvent.changeText(screen.getByLabelText("Date & time (YYYY-MM-DD HH:mm)"), "2026-11-01 10:00");
    expect(screen.getByText("This date is outside the group's cycle.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Add Item"));
    expect(alerts.last().title).toBe("Outside this cycle");
    await alerts.press("Cancel");
    expect((await group()).transactions).toHaveLength(0);
  });

  test("validates amount and date", async () => {
    await open();
    await fireEvent.press(screen.getByText("Add Transaction"));
    await fireEvent.press(screen.getByText("Add Item"));
    expect(alerts.last().title).toBe("Enter an amount");
    await fireEvent.changeText(screen.getByPlaceholderText("Amount"), "100");
    await fireEvent.changeText(screen.getByLabelText("Date & time (YYYY-MM-DD HH:mm)"), "yesterday");
    await fireEvent.press(screen.getByText("Add Item"));
    expect(alerts.last().title).toMatch(/YYYY-MM-DD/);
  });

  test("close and reopen the group; tapping a category opens its editor", async () => {
    const ctx = await open();
    await fireEvent.press(screen.getByText("Close group"));
    await waitFor(async () => expect((await group()).status).toBe("closed"));
    await fireEvent.press(await screen.findByText("Reopen group"));
    await waitFor(async () => expect((await group()).status).toBe("open"));
    await fireEvent.press(screen.getByText(/10% groceries · 10%/));
    expect(nav.navigate).toHaveBeenCalledWith("CategoryEditor", { target: "group", ownerId: ctx.group.id, categoryId: "grocery-10" });
  });

  test("delete group after confirmation", async () => {
    await open();
    await fireEvent.press(screen.getByLabelText("Delete group"));
    expect(alerts.last().title).toBe("Confirm Deletion");
    await alerts.press("Delete");
    expect(nav.goBack).toHaveBeenCalled();
    expect((await getState()).groups).toHaveLength(0);
  });

  test("delete a transaction from the list; tapping it opens the editor", async () => {
    const ctx = await open();
    await fireEvent.press(screen.getByText("Add Transaction"));
    await fireEvent.changeText(screen.getByPlaceholderText("Name / merchant"), "Zepto");
    await fireEvent.changeText(screen.getByPlaceholderText("Amount"), "500");
    await fireEvent.press(screen.getByText("Add Item"));
    await fireEvent.press(await screen.findByText("Zepto"));
    const tx = (await group()).transactions[0];
    expect(nav.navigate).toHaveBeenCalledWith("TransactionEditor", { groupId: ctx.group.id, txId: tx.id });
    await fireEvent.press(screen.getByLabelText("Delete Zepto"));
    await alerts.press("Delete");
    expect((await group()).transactions).toHaveLength(0);
  });
});

describe("Expense groups (Split tab)", () => {
  test("create group validates name and members, rejects duplicates, and saves", async () => {
    await AsyncStorage.setItem("groups", JSON.stringify([{ name: "Trip", members: ["A"], items: [] }]));
    await render(<CreateGroupScreen navigation={nav} />);
    await fireEvent.press(screen.getByText("Save Group"));
    expect(alerts.last().title).toBe("Enter a group name");

    await fireEvent.changeText(screen.getByPlaceholderText("Group Name"), " trip ");
    await fireEvent.press(screen.getByText("Save Group"));
    expect(alerts.last().title).toBe("Add at least one member");

    await fireEvent.changeText(screen.getByPlaceholderText("Add Member"), "Asha");
    await fireEvent.press(screen.getByText("Add Member"));
    await fireEvent.changeText(screen.getByPlaceholderText("Add Member"), "asha");
    await fireEvent.press(screen.getByText("Add Member"));
    expect(alerts.last().title).toBe("Duplicate member");
    await fireEvent.changeText(screen.getByPlaceholderText("Add Member"), "Ravi");
    await fireEvent.press(screen.getByText("Add Member"));

    await fireEvent.press(screen.getByText("Save Group"));
    await waitFor(() => expect(alerts.last().title).toBe("Name in use"));

    await fireEvent.changeText(screen.getByPlaceholderText("Group Name"), "Dinner");
    await fireEvent.press(screen.getByText("Save Group"));
    await waitFor(() => expect(nav.goBack).toHaveBeenCalled());
    const groups = JSON.parse(await AsyncStorage.getItem("groups"));
    expect(groups[1]).toEqual({ name: "Dinner", members: ["Asha", "Ravi"], items: [] });
  });

  test("groups list loads from storage and navigates without passing functions", async () => {
    await AsyncStorage.setItem("groups", JSON.stringify([{ name: "Trip", members: ["A"], items: [], isSettled: true }]));
    await render(<GroupsScreen navigation={nav} />);
    expect(await screen.findByText(/Trip/)).toBeTruthy();
    expect(screen.getByText(/Settled/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Create Group"));
    expect(nav.navigate).toHaveBeenCalledWith("Create Group");
  });

  test("group details: add an item, then settle an uneven split", async () => {
    const trip = { name: "Trip", members: ["A", "B", "C"], items: [] };
    await AsyncStorage.setItem("groups", JSON.stringify([trip]));
    await render(<GroupDetailsScreen route={{ params: { group: trip } }} navigation={nav} />);

    await fireEvent.press(screen.getByText("Add Item"));
    await fireEvent.changeText(screen.getByPlaceholderText("Item Name"), "Dinner");
    await fireEvent.changeText(screen.getByPlaceholderText("Amount"), "100");
    await choose("Paid by", "A");
    await fireEvent.press(screen.getByText("Add Item"));
    expect(await screen.findByText(/Dinner - ₹100 - Paid/)).toBeTruthy();
    expect(screen.getByText("Total: ₹100.00")).toBeTruthy();
    await waitFor(async () => expect(JSON.parse(await AsyncStorage.getItem("groups"))[0].items).toHaveLength(1));

    await fireEvent.press(screen.getByText("Settle"));
    expect(alerts.last().message).toBe("B pays A ₹33.33\nC pays A ₹33.33");
    await alerts.press("OK");
    expect(await screen.findByText("Group Settled")).toBeTruthy();
  });

  test("group details: validation and Details summary", async () => {
    const trip = { name: "Trip", members: ["A"], items: [{ name: "Cab", amount: "50", payer: "A", createdAt: "2026-09-01T00:00:00Z" }] };
    await AsyncStorage.setItem("groups", JSON.stringify([trip]));
    await render(<GroupDetailsScreen route={{ params: { group: trip } }} navigation={nav} />);
    await fireEvent.press(screen.getByText("Details"));
    expect(alerts.last().message).toBe("A paid ₹50.00");
    await fireEvent.press(screen.getByText("Add Item"));
    await fireEvent.press(screen.getByText("Add Item"));
    expect(alerts.last().message).toBe("Please fill all fields!");
  });

  test("group details: delete an item (kept but struck out) and delete the group", async () => {
    const trip = {
      name: "Trip", members: ["A", "B"],
      items: [{ name: "Cab", amount: "50", payer: "A", createdAt: "2026-09-01T00:00:00Z", deleted: false }],
    };
    await AsyncStorage.setItem("groups", JSON.stringify([trip, { name: "Other", members: [], items: [] }]));
    await render(<GroupDetailsScreen route={{ params: { group: trip } }} navigation={nav} />);
    await fireEvent.press(screen.getByLabelText("Delete Cab"));
    await alerts.press("OK");
    expect(screen.getByText("Total: ₹0.00")).toBeTruthy();
    await waitFor(async () => expect(JSON.parse(await AsyncStorage.getItem("groups"))[0].items[0].deleted).toBe(true));

    await fireEvent.press(screen.getByLabelText("Delete group"));
    await alerts.press("OK");
    expect(nav.goBack).toHaveBeenCalled();
    expect(JSON.parse(await AsyncStorage.getItem("groups")).map((g) => g.name)).toEqual(["Other"]);
  });
});

describe("linking a manual group to its card", () => {
  const TrackCardScreen = require("../cashback/TrackCardScreen").default;
  const CreateCashbackGroup = require("../CreateCashbackGroup").default;
  const manual = () => {
    const { migrateGroupV0 } = require("../../src/cashback/migration");
    return migrateGroupV0({ id: 1, name: "Bbb", categories: [{ name: "Vv", percentage: 10, cap: 250 }], transactions: [] });
  };

  test("a manual group says it is not linked and offers tracking", async () => {
    const g = manual();
    await seed({ groups: [g] });
    await render(<CashbackGroupDetails route={{ params: { groupId: g.id } }} navigation={nav} />);
    expect(await screen.findByText("Not linked to a card")).toBeTruthy();
    await fireEvent.press(screen.getByText("Track this card automatically"));
    expect(nav.navigate).toHaveBeenCalledWith("TrackCard", { groupId: g.id });
  });

  test("Track Card validates, then links the group", async () => {
    const g = manual();
    await seed({ groups: [g] });
    await render(<TrackCardScreen route={{ params: { groupId: g.id } }} navigation={nav} />);
    await fireEvent.press(await screen.findByText("Start tracking"));
    expect(alerts.last()).toMatchObject({ title: "Could not start tracking" });

    await fireEvent.changeText(screen.getByLabelText("Card last four digits"), "73-42x");
    expect(screen.getByLabelText("Card last four digits").props.value).toBe("7342");
    await fireEvent.changeText(screen.getByLabelText(/^Cycle start day/), "10");
    await fireEvent.press(screen.getByText("Start tracking"));
    await waitFor(() => expect(alerts.last().title).toBe("Tracking started"));
    expect(alerts.last().message).toMatch(/Alerts from •••• 7342/);
    expect(nav.goBack).toHaveBeenCalled();
    const s = await getState();
    expect(s.templates[0]).toMatchObject({ name: "Bbb", cardLastFour: "7342" });
    expect(s.groups[0].templateId).toBe(s.templates[0].id);
  });

  test("a linked group shows its card and digits", async () => {
    const ctx = liveplusState();
    await seed(ctx.state);
    await render(<CashbackGroupDetails route={{ params: { groupId: ctx.group.id } }} navigation={nav} />);
    expect(await screen.findByText("Card: HSBC Live+ •••• 5678")).toBeTruthy();
    await fireEvent.press(screen.getByText("Edit card"));
    expect(nav.navigate).toHaveBeenCalledWith("TemplateEditor", { templateId: ctx.template.id });
  });

  test("creating a manual group with card digits tracks it from the start", async () => {
    await seed({});
    await render(<CreateCashbackGroup navigation={nav} />);
    await fireEvent.changeText(screen.getByPlaceholderText("e.g. Credit Card A"), "My HSBC");
    await fireEvent.changeText(screen.getByPlaceholderText("Category name (e.g. Recharge)"), "Food");
    await fireEvent.changeText(screen.getByPlaceholderText("Percentage (e.g. 10)"), "10");
    await fireEvent.press(screen.getByText("Add Category"));
    await fireEvent.changeText(screen.getByLabelText("Card last four digits"), "7342");
    await fireEvent.press(screen.getByText("Calendar month"));
    await fireEvent.press(screen.getByText("Create Group"));
    await waitFor(() => expect(nav.goBack).toHaveBeenCalled());
    const s = await getState();
    expect(s.templates[0]).toMatchObject({ name: "My HSBC", cardLastFour: "7342", cycle: { mode: "calendar-month" } });
    expect(s.groups[0]).toMatchObject({ templateId: s.templates[0].id, status: "open" });
  });

  test("invalid card details on create save nothing", async () => {
    await seed({});
    await render(<CreateCashbackGroup navigation={nav} />);
    await fireEvent.changeText(screen.getByPlaceholderText("e.g. Credit Card A"), "My HSBC");
    await fireEvent.changeText(screen.getByLabelText("Card last four digits"), "73");
    await fireEvent.press(screen.getByText("Create Group"));
    expect(alerts.last()).toMatchObject({ title: "Check the card details" });
    expect((await getState()).groups).toHaveLength(0);
    expect(nav.goBack).not.toHaveBeenCalled();
  });
});

describe("cashback calculation: round-off popup and calculator", () => {
  const openLivePlus = async (groupsFn) => {
    const ctx = liveplusState();
    const state = groupsFn ? { ...ctx.state, groups: groupsFn(ctx) } : ctx.state;
    await seed(state);
    await render(<CashbackGroupDetails route={{ params: { groupId: ctx.group.id } }} navigation={nav} />);
    await screen.findByText("Add Transaction");
    return ctx;
  };
  const withSpend = (amount) => (ctx) =>
    require("../../src/cashback/groups").addTransaction(ctx.state.groups, ctx.group.id, {
      name: "Blinkit", amount, categoryId: "grocery-10", occurredAt: "2026-09-14T10:00:00.000Z",
    }).groups;
  const cashbackShown = () => screen.getByLabelText("Calculated cashback").props.children;
  const group = async () => (await getState()).groups[0];

  // Opens the popup and saves "no round-off" (value null) or "per ₹ value".
  const setRoundOff = async (value) => {
    await fireEvent.press(screen.getByLabelText("How cashback is calculated"));
    if (value == null) {
      await fireEvent.press(screen.getByLabelText("No round-off"));
    } else {
      await fireEvent.press(screen.getByLabelText("Round off per ₹ spent"));
      await fireEvent.changeText(screen.getByLabelText("Round off per ₹"), String(value));
    }
    await fireEvent.press(screen.getByText("Save"));
  };

  test("the group shows its method; the popup sets per ₹100, ₹150, ₹120, ₹1 and no round-off", async () => {
    await openLivePlus(withSpend(325.5));
    expect(screen.getByText("Round off per ₹1")).toBeTruthy();
    expect((await group()).totalCashback).toBe(32);

    for (const [value, total, rounding] of [
      [100, 30, "per-block-spent"],
      [150, 30, "per-block-spent"],
      [120, 24, "per-block-spent"],
      [1, 32, "per-transaction-floor"],
      [null, 32.55, "none"],
    ]) {
      await setRoundOff(value);
      await waitFor(async () => expect((await group()).totalCashback).toBe(total));
      expect((await group()).rounding).toBe(rounding);
    }
    expect(screen.getByText("No round-off")).toBeTruthy();
  });

  test("popup: an invalid value can't be saved; Cancel keeps the old method", async () => {
    await openLivePlus();
    await fireEvent.press(screen.getByLabelText("How cashback is calculated"));
    await fireEvent.press(screen.getByLabelText("Round off per ₹ spent"));
    await fireEvent.changeText(screen.getByLabelText("Round off per ₹"), "0");
    expect(screen.getByText("Enter a value above ₹0, e.g. 1, 100 or 150.")).toBeTruthy();
    await fireEvent.press(screen.getByText("Save"));
    expect(screen.getByText("Enter a value above ₹0, e.g. 1, 100 or 150.")).toBeTruthy(); // still open
    await fireEvent.changeText(screen.getByLabelText("Round off per ₹"), "150");
    expect(screen.getByText("Example: 10% of ₹325.50 = ₹30 (counts ₹300)")).toBeTruthy();
    await fireEvent.press(screen.getByText("Cancel"));
    expect((await group()).rounding).toBe("per-transaction-floor");
  });

  test("calculator: amount, rate and round-off are all editable; nothing is saved", async () => {
    await openLivePlus();
    await fireEvent.press(screen.getByText("Cashback calculator"));
    await fireEvent.changeText(screen.getByLabelText("Spend amount (₹)"), "325.5");
    await fireEvent.press(screen.getAllByText("10% groceries (10%)").at(-1));
    expect(screen.getByLabelText("Cashback rate (%)").props.value).toBe("10");
    expect(cashbackShown()).toBe("₹32"); // the group's round-off: per ₹1

    await fireEvent.changeText(screen.getByLabelText("Round off per ₹"), "150");
    expect(cashbackShown()).toBe("₹30");
    await fireEvent.changeText(screen.getByLabelText("Round off per ₹"), "120");
    expect(cashbackShown()).toBe("₹24");
    await fireEvent.press(screen.getByLabelText("No round-off"));
    expect(cashbackShown()).toBe("₹32.55");
    await fireEvent.changeText(screen.getByLabelText("Cashback rate (%)"), "5");
    expect(cashbackShown()).toBe("₹16.27");

    await fireEvent.press(screen.getByLabelText("Round off per ₹ spent"));
    await fireEvent.changeText(screen.getByLabelText("Round off per ₹"), "");
    expect(screen.getByText("Enter a value above ₹0, e.g. 1, 100 or 150.")).toBeTruthy();

    const g = await group();
    expect(g.transactions).toHaveLength(0);
    expect(g.rounding).toBe("per-transaction-floor");
  });

  test("calculator: a 0% category fills in 0, and the rate can still be typed", async () => {
    await openLivePlus();
    await fireEvent.press(screen.getByText("Cashback calculator"));
    await fireEvent.changeText(screen.getByLabelText("Spend amount (₹)"), "500");
    await fireEvent.press(screen.getAllByText("0% / excluded").at(-1));
    expect(screen.getByLabelText("Cashback rate (%)").props.value).toBe("0");
    expect(cashbackShown()).toBe("₹0");
    await fireEvent.changeText(screen.getByLabelText("Cashback rate (%)"), "2");
    expect(cashbackShown()).toBe("₹10");
  });

  test("calculator: a category with no rate set starts at 0", async () => {
    await openLivePlus((ctx) =>
      ctx.state.groups.map((g) => ({
        ...g,
        categories: g.categories.map((c) => (c.id === "dining-10" ? { ...c, percentage: null } : c)),
      }))
    );
    await fireEvent.press(screen.getByText("Cashback calculator"));
    await fireEvent.press(screen.getByText("10% dining & food delivery (rate not set)"));
    expect(screen.getByLabelText("Cashback rate (%)").props.value).toBe("0");
  });

  test("calculator respects the category's remaining cap", async () => {
    await openLivePlus(withSpend(9500));
    await fireEvent.press(screen.getByText("Cashback calculator"));
    await fireEvent.changeText(screen.getByLabelText("Spend amount (₹)"), "1000");
    await fireEvent.press(screen.getAllByText("10% groceries (10%)").at(-1));
    expect(cashbackShown()).toBe("₹50"); // ₹1000 pool cap, ₹950 used
    expect(screen.getByText(/= ₹100 before caps/)).toBeTruthy();
  });

  test("a new manual group can round off per ₹150", async () => {
    const CreateCashbackGroup = require("../CreateCashbackGroup").default;
    await seed({});
    await render(<CreateCashbackGroup navigation={nav} />);
    await fireEvent.changeText(screen.getByPlaceholderText("e.g. Credit Card A"), "SBI Card");
    await setRoundOff(150);
    expect(screen.getByText("Round off per ₹150")).toBeTruthy();
    await fireEvent.press(screen.getByText("Create Group"));
    await waitFor(() => expect(nav.goBack).toHaveBeenCalled());
    expect(await group()).toMatchObject({ rounding: "per-block-spent", blockSize: 150 });
  });

  test("card editor saves the round-off value", async () => {
    const TemplateEditor = require("../cashback/TemplateEditor").default;
    const ctx = liveplusState();
    await seed(ctx.state);
    await render(<TemplateEditor route={{ params: { templateId: ctx.template.id } }} navigation={nav} />);
    await screen.findByText("Save card");
    await setRoundOff(100);
    await fireEvent.press(screen.getByText("Save card"));
    await waitFor(async () => expect((await getState()).templates[0]).toMatchObject({ rounding: "per-block-spent", blockSize: 100 }));
  });
});
