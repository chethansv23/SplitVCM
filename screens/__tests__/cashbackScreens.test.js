import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import CashbackGroupDetails from "../CashbackGroupDetails";
import ReviewInbox from "../cashback/ReviewInbox";
import { ingestNotification } from "../../src/cashback/inbox";
import { __resetStore, getState, KEYS } from "../../src/cashback/store";
import { hsbcAlert, liveplusState, NOW } from "../../src/cashback/__tests__/helpers";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("@react-native-picker/picker", () => {
  const { View } = require("react-native");
  const Picker = ({ children }) => <View>{children}</View>;
  Picker.Item = () => null;
  return { Picker };
});

const seed = async (state) => {
  await AsyncStorage.clear();
  __resetStore();
  await AsyncStorage.multiSet([
    [KEYS.schemaVersion, "1"],
    [KEYS.groups, JSON.stringify(state.groups)],
    [KEYS.templates, JSON.stringify(state.templates)],
    [KEYS.candidates, JSON.stringify(state.candidates)],
  ]);
  await getState();
};

const navigation = { navigate: jest.fn(), goBack: jest.fn() };

test("review inbox shows an unclear alert and adds it with the suggestion", async () => {
  const ctx = liveplusState();
  const { state } = ingestNotification(ctx.state, hsbcAlert("BOUTIQUE XYZ"), NOW);
  await seed(state);

  await render(<ReviewInbox navigation={navigation} />);
  expect(await screen.findByText("BOUTIQUE XYZ")).toBeTruthy();
  expect(screen.getByText(/Merchant is not linked to a category yet/)).toBeTruthy();
  expect(screen.getByText(/Cashback ₹13/)).toBeTruthy(); // 1.5% of 899, floored

  await fireEvent.press(screen.getByText("Add"));
  await waitFor(() => expect(screen.getByText("Nothing to review. 🎉")).toBeTruthy());

  const saved = await getState();
  expect(saved.groups[0].transactions[0]).toMatchObject({ name: "BOUTIQUE XYZ", categoryId: "other-1-5" });
  expect(saved.templates[0].merchantRules).toHaveLength(1); // "Remember" is on by default
});

test("skip keeps the item in the inbox", async () => {
  const ctx = liveplusState();
  const { state } = ingestNotification(ctx.state, hsbcAlert("BOUTIQUE XYZ"), NOW);
  await seed(state);

  await render(<ReviewInbox navigation={navigation} />);
  await fireEvent.press(await screen.findByText("Skip for now"));
  expect(screen.getByText("All remaining items are skipped.")).toBeTruthy();
  expect((await getState()).candidates[0].status).toBe("pending-review");
});

test("group details renders computed totals and categories", async () => {
  const ctx = liveplusState();
  const { state } = ingestNotification(ctx.state, hsbcAlert("BIGBASKET"), NOW);
  await seed(state);

  await render(<CashbackGroupDetails route={{ params: { groupId: ctx.group.id } }} navigation={navigation} />);
  expect(await screen.findByText("HSBC Live+ · 10 Sep–09 Oct 2026")).toBeTruthy();
  expect(screen.getByText("₹89")).toBeTruthy();
  expect(screen.getByText(/Accelerated 10% cap: ₹911 of ₹1000 remaining/)).toBeTruthy();
  expect(screen.getByText(/· auto$/)).toBeTruthy();
  expect(screen.getByText("Card: HSBC Live+ •••• 5678")).toBeTruthy();
});

test("manual group: categories can be edited and deleted before saving", async () => {
  const CreateCashbackGroup = require("../CreateCashbackGroup").default;
  const { Alert } = require("react-native");
  // Auto-confirm the delete dialog.
  jest.spyOn(Alert, "alert").mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === "destructive")?.onPress());
  await seed({ groups: [], templates: [], candidates: [] });
  const nav = { goBack: jest.fn() };

  await render(<CreateCashbackGroup navigation={nav} />);
  await fireEvent.changeText(screen.getByPlaceholderText("e.g. Credit Card A"), "Card A");
  const addCat = async (name, pct) => {
    await fireEvent.changeText(screen.getByPlaceholderText("Category name (e.g. Recharge)"), name);
    await fireEvent.changeText(screen.getByPlaceholderText("Percentage (e.g. 10)"), pct);
    await fireEvent.press(screen.getByText(/^(Add|Save) Category$/));
  };
  await addCat("Recharge", "10");
  await addCat("Dining", "5");

  await fireEvent.press(screen.getAllByText("Edit")[0]);
  expect(screen.getByText("Edit Category")).toBeTruthy();
  await fireEvent.changeText(screen.getByPlaceholderText("Percentage (e.g. 10)"), "12");
  await fireEvent.press(screen.getByText("Save Category"));
  expect(screen.getByText(/Recharge - 12%/)).toBeTruthy();

  await fireEvent.press(screen.getAllByText("Delete")[1]);
  expect(screen.queryByText(/Dining/)).toBeNull();

  await fireEvent.press(screen.getByText("Create Group"));
  await waitFor(() => expect(nav.goBack).toHaveBeenCalled());
  const [g] = (await getState()).groups;
  expect(g.categories.map((c) => [c.name, c.percentage])).toEqual([["Recharge", 12], ["0% / excluded", 0]]);
  Alert.alert.mockRestore();
});
