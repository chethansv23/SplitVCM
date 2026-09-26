import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";

import CashbackScreen from "../CashbackScreen";
import CardTemplatesScreen from "../cashback/CardTemplatesScreen";
import TemplateEditor from "../cashback/TemplateEditor";
import { getState } from "../../src/cashback/store";
import { buildTemplate, createCycleGroup } from "../../src/cashback/templates";
import { hsbcAlert, liveplusState, NOW } from "../../src/cashback/__tests__/helpers";
import { ingestNotification } from "../../src/cashback/inbox";
import { makeNavigation, mockAlerts, seed } from "./testUtils";

const mockNav = makeNavigation();
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  useNavigation: () => mockNav,
}));

let alerts;
beforeEach(() => {
  jest.clearAllMocks();
  alerts = mockAlerts();
});
afterEach(() => alerts.restore());

describe("CashbackScreen (list)", () => {
  test("empty state and entry points", async () => {
    await seed({});
    await render(<CashbackScreen />);
    expect(await screen.findByText(/No cashback groups yet/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Cards & cycles"));
    expect(mockNav.navigate).toHaveBeenCalledWith("CardTemplates");
    await fireEvent.press(screen.getByText("Settings"));
    expect(mockNav.navigate).toHaveBeenCalledWith("CaptureSettings");
    await fireEvent.press(screen.getByText("Add manual cashback group"));
    expect(mockNav.navigate).toHaveBeenCalledWith("CreateCashbackGroup");
  });

  test("shows groups with totals, the review count, and opens a group by id", async () => {
    const ctx = liveplusState();
    let { state } = ingestNotification(ctx.state, hsbcAlert("BIGBASKET"), NOW);
    ({ state } = ingestNotification(state, hsbcAlert("BOUTIQUE", 500), NOW));
    await seed(state);
    await render(<CashbackScreen />);
    expect(await screen.findByText("HSBC Live+ · 10 Sep–09 Oct 2026")).toBeTruthy();
    expect(screen.getByText("₹89")).toBeTruthy();
    expect(screen.getByText("Needs review (1)")).toBeTruthy();
    await fireEvent.press(screen.getByText("HSBC Live+ · 10 Sep–09 Oct 2026"));
    expect(mockNav.navigate).toHaveBeenCalledWith("CashbackGroupDetails", { groupId: ctx.group.id });
  });

  test("offers the next cycle once the current one has ended", async () => {
    jest.useFakeTimers({ now: new Date("2026-10-12T10:00:00"), doNotFake: ["nextTick", "setImmediate"] });
    const { state } = liveplusState();
    await seed(state);
    await render(<CashbackScreen />);
    expect(await screen.findByText(/New cycle available for HSBC Live\+/)).toBeTruthy();
    jest.useRealTimers();
  });
});

describe("CardTemplatesScreen", () => {
  test("adding a card requires its variant, then opens the editor", async () => {
    await seed({});
    await render(<CardTemplatesScreen navigation={mockNav} />);
    await fireEvent.press(await screen.findByText("PhonePe SBI"));
    await fireEvent.press(screen.getByText("Add PhonePe SBI"));
    expect(alerts.last()).toMatchObject({ title: "Cannot add card", message: "Card variant is required" });

    await fireEvent.press(screen.getByText("SELECT BLACK"));
    await fireEvent.press(screen.getByText("Add PhonePe SBI"));
    await waitFor(() => expect(mockNav.navigate).toHaveBeenCalledWith("TemplateEditor", expect.any(Object)));
    const [t] = (await getState()).templates;
    expect(t.name).toBe("PhonePe SBI SELECT BLACK");
  });

  test("custom card needs a name", async () => {
    await seed({});
    await render(<CardTemplatesScreen navigation={mockNav} />);
    await fireEvent.press(await screen.findByText("Add custom card"));
    expect(alerts.last().title).toBe("Enter a card name");
    await fireEvent.changeText(screen.getByPlaceholderText("Card name"), "My Card");
    await fireEvent.press(screen.getByText("Add custom card"));
    await waitFor(async () => expect((await getState()).templates[0].name).toBe("My Card"));
  });

  test("Create current cycle creates the group once, then opens it", async () => {
    const t = buildTemplate("hsbc-live-plus", {}, NOW);
    await seed({ templates: [t] });
    await render(<CardTemplatesScreen navigation={mockNav} />);
    await fireEvent.press(await screen.findByText("Create current cycle"));
    await waitFor(async () => expect((await getState()).groups).toHaveLength(1));
    const [g] = (await getState()).groups;
    expect(mockNav.navigate).toHaveBeenLastCalledWith("CashbackGroupDetails", { groupId: g.id });
    await fireEvent.press(screen.getByText("Open current cycle"));
    expect((await getState()).groups).toHaveLength(1);
  });

  test("a card without a start day cannot create a cycle", async () => {
    const t = buildTemplate("hdfc-millennia", {}, NOW);
    await seed({ templates: [t] });
    await render(<CardTemplatesScreen navigation={mockNav} />);
    expect(await screen.findByText(/Billing-cycle start day not set/)).toBeTruthy();
  });
});

describe("TemplateEditor", () => {
  const setup = async (extra = {}) => {
    const t = { ...buildTemplate("hsbc-live-plus", {}, NOW), ...extra };
    await seed({ templates: [t] });
    await render(<TemplateEditor route={{ params: { templateId: t.id } }} navigation={mockNav} />);
    await screen.findByText("Save card");
    return t;
  };
  const saved = async () => (await getState()).templates[0];

  test("validates and saves card suffix, cycle, rounding and caps", async () => {
    await setup();
    await fireEvent.changeText(screen.getByDisplayValue("10"), "40");
    await fireEvent.press(screen.getByText("Save card"));
    expect(alerts.last().title).toBe("Start day must be 1–31");

    await fireEvent.changeText(screen.getByDisplayValue("40"), "15");
    await fireEvent.changeText(screen.getAllByDisplayValue("")[0], "56a");
    await fireEvent.press(screen.getByText("Save card"));
    expect(alerts.last().title).toBe("Card suffix must be 4 digits");

    await fireEvent.changeText(screen.getByDisplayValue("56a"), "5678");
    await fireEvent.press(screen.getByText("Floor cycle total"));
    await fireEvent.press(screen.getByText("Save card"));
    await waitFor(async () => expect((await saved()).cardLastFour).toBe("5678"));
    expect(await saved()).toMatchObject({ cycle: { mode: "billing-cycle", startDay: 15 }, rounding: "cycle-total-floor" });
  });

  test("calendar month cycle", async () => {
    await setup();
    await fireEvent.press(screen.getByText("Calendar month"));
    await fireEvent.press(screen.getByText("Save card"));
    await waitFor(async () => expect((await saved()).cycle).toEqual({ mode: "calendar-month" }));
  });

  test("cap pools: add, toggle a category, remove", async () => {
    await setup({ capPools: [] });
    await fireEvent.changeText(screen.getByPlaceholderText("Pool name (e.g. Accelerated cap)"), "Food");
    await fireEvent.changeText(screen.getByPlaceholderText("Cap ₹"), "300");
    await fireEvent.press(screen.getByText("Add pool"));
    await waitFor(async () => expect((await saved()).capPools).toHaveLength(1));
    // The category also appears in the Categories list above; the pool chip is last.
    await fireEvent.press((await screen.findAllByText("10% groceries")).at(-1));
    await waitFor(async () => expect((await saved()).capPools[0].categoryIds).toEqual(["grocery-10"]));
    await fireEvent.press(screen.getByText("Remove"));
    await waitFor(async () => expect((await saved()).capPools).toHaveLength(0));
  });

  test("learned rules can be forgotten", async () => {
    await setup({ merchantRules: [{ id: "r1", merchantKey: "boutique", merchantLabel: "Boutique", categoryId: "other-1-5" }] });
    expect(screen.getByText("Boutique → 1.5% other eligible")).toBeTruthy();
    await fireEvent.press(screen.getByText("Forget"));
    await waitFor(async () => expect((await saved()).merchantRules).toEqual([]));
  });

  test("Apply to open cycles updates existing groups after confirmation", async () => {
    const t = buildTemplate("hsbc-live-plus", {}, NOW);
    const g = createCycleGroup(t, "2026-09-14", NOW);
    const edited = { ...t, categories: t.categories.map((c) => (c.id === "grocery-10" ? { ...c, percentage: 5 } : c)) };
    await seed({ templates: [edited], groups: [g] });
    await render(<TemplateEditor route={{ params: { templateId: t.id } }} navigation={mockNav} />);
    await fireEvent.press(await screen.findByText("Apply to 1 open cycle(s)"));
    await alerts.press("Update");
    await waitFor(async () =>
      expect((await getState()).groups[0].categories.find((c) => c.id === "grocery-10").percentage).toBe(5)
    );
  });

  test("Delete card keeps its cycle groups", async () => {
    const t = buildTemplate("hsbc-live-plus", {}, NOW);
    await seed({ templates: [t], groups: [createCycleGroup(t, "2026-09-14", NOW)] });
    await render(<TemplateEditor route={{ params: { templateId: t.id } }} navigation={mockNav} />);
    await fireEvent.press(await screen.findByText("Delete card"));
    await alerts.press("Delete");
    const s = await getState();
    expect(s.templates).toHaveLength(0);
    expect(s.groups).toHaveLength(1);
  });

  test("Mark terms verified today", async () => {
    jest.useFakeTimers({ now: new Date("2026-09-30T10:00:00"), doNotFake: ["nextTick", "setImmediate"] });
    await setup({ lastVerifiedAt: "2026-01-01" });
    await fireEvent.press(screen.getByText("Mark terms verified today"));
    await waitFor(async () => expect((await saved()).lastVerifiedAt).toBe("2026-09-30"));
    jest.useRealTimers();
  });
});
