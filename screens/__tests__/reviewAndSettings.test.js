import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import { Share } from "react-native";

import ReviewInbox from "../cashback/ReviewInbox";
import CaptureSettings from "../cashback/CaptureSettings";
import { exportBackup } from "../../src/cashback/backup";
import { ingestNotification } from "../../src/cashback/inbox";
import { getState } from "../../src/cashback/store";
import { hsbcAlert, liveplusState, NOW } from "../../src/cashback/__tests__/helpers";
import { choose, makeNavigation, mockAlerts, seed } from "./testUtils";

// Controllable native capture module.
const mockNative = {
  available: false,
  granted: false,
  battery: true,
  blocked: [],
  diagnostics: null,
  configure: jest.fn(),
  openNotificationAccessSettings: jest.fn(),
  openAppDetailsSettings: jest.fn(),
  openBatteryOptimizationSettings: jest.fn(),
  resetDiagnostics: jest.fn(),
};
jest.mock("../../modules/notification-capture", () => ({
  __esModule: true,
  default: {
    isAvailable: () => mockNative.available,
    isPermissionGranted: () => mockNative.granted,
    isIgnoringBatteryOptimizations: () => mockNative.battery,
    getBlockedPackages: () => mockNative.blocked,
    getDiagnostics: () => mockNative.diagnostics,
    configure: (...a) => mockNative.configure(...a),
    openNotificationAccessSettings: () => mockNative.openNotificationAccessSettings(),
    openAppDetailsSettings: () => mockNative.openAppDetailsSettings(),
    openBatteryOptimizationSettings: () => mockNative.openBatteryOptimizationSettings(),
    requestRebind: jest.fn(),
    resetDiagnostics: () => mockNative.resetDiagnostics(),
    drainQueue: async () => [],
  },
}));
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
beforeEach(() => {
  alerts = mockAlerts();
  nav = makeNavigation();
  Object.assign(mockNative, { available: false, granted: false, battery: true, blocked: [], diagnostics: null });
  jest.clearAllMocks();
});
afterEach(() => alerts.restore());

const pendingState = (merchant = "BOUTIQUE XYZ", when) => {
  const ctx = liveplusState();
  const r = ingestNotification(ctx.state, hsbcAlert(merchant, 899, when), NOW);
  return { ...ctx, state: r.state, candidateId: r.candidateId };
};

describe("ReviewInbox actions", () => {
  const open = async (state) => {
    await seed(state);
    await render(<ReviewInbox navigation={nav} />);
  };

  test("No cashback records it under 0%", async () => {
    const { state } = pendingState();
    await open(state);
    await fireEvent.press(await screen.findByText("No cashback"));
    await waitFor(async () => expect((await getState()).groups[0].transactions).toHaveLength(1));
    expect((await getState()).groups[0].transactions[0]).toMatchObject({ categoryId: "excluded", cashback: 0 });
  });

  test("Ignore asks first, then removes it without a transaction", async () => {
    const { state } = pendingState();
    await open(state);
    await fireEvent.press(await screen.findByText("Ignore"));
    await alerts.press("Ignore");
    expect((await getState()).candidates[0].status).toBe("ignored");
    expect((await getState()).groups[0].transactions).toHaveLength(0);
    expect(screen.getByText("Nothing to review. 🎉")).toBeTruthy();
  });

  test("Edit and add saves the edited values; Remember can be switched off", async () => {
    const { state } = pendingState();
    await open(state);
    await fireEvent.press(await screen.findByText("Edit and add"));
    await fireEvent.changeText(screen.getByLabelText("Merchant"), "Local Boutique");
    await fireEvent.changeText(screen.getByLabelText("Amount"), "1000");
    await fireEvent(screen.getByLabelText(/^Remember/), "valueChange", false);
    await fireEvent.press(screen.getByText("Save edited"));
    await waitFor(async () => expect((await getState()).groups[0].transactions).toHaveLength(1));
    const s = await getState();
    expect(s.groups[0].transactions[0]).toMatchObject({ name: "Local Boutique", amount: 1000, cashback: 15 });
    expect(s.templates[0].merchantRules).toEqual([]);
  });

  test("Edit and add rejects an invalid amount", async () => {
    const { state } = pendingState();
    await open(state);
    await fireEvent.press(await screen.findByText("Edit and add"));
    await fireEvent.changeText(screen.getByLabelText("Amount"), "0");
    await fireEvent.press(screen.getByText("Save edited"));
    expect(alerts.last()).toMatchObject({ title: "Could not save", message: "Enter a valid amount" });
  });

  test("choosing another category updates the cashback preview", async () => {
    const { state } = pendingState();
    await open(state);
    expect(await screen.findByText(/Cashback ₹13/)).toBeTruthy();
    await choose("Category", "10% groceries (10%)");
    expect(screen.getByText(/Cashback ₹89/)).toBeTruthy();
    expect(screen.getByText(/Accelerated 10% cap left ₹911/)).toBeTruthy();
  });

  test("no open cycle: Create cycle group from the inbox, then add", async () => {
    const { state } = pendingState("BIGBASKET", "14 Oct 2026 at 18:05");
    await open(state);
    expect(await screen.findByText(/No open cycle group for this card and date/)).toBeTruthy();
    await fireEvent.press(screen.getByText("+ HSBC Live+ cycle"));
    await waitFor(async () => expect((await getState()).groups).toHaveLength(2));
    await fireEvent.press(await screen.findByText("Add"));
    await waitFor(async () => expect((await getState()).groups[1].transactions).toHaveLength(1));
    expect((await getState()).groups[1]).toMatchObject({ cycleStart: "2026-10-10", totalCashback: 89 });
  });

  test("date outside the chosen group's cycle asks before adding", async () => {
    const { state } = pendingState("BIGBASKET", "14 Oct 2026 at 18:05");
    await open(state);
    await screen.findByText("Add");
    await choose("Cashback group", "HSBC Live+ · 10 Sep–09 Oct 2026");
    await fireEvent.press(screen.getByText("Add"));
    expect(alerts.last().title).toBe("Outside the cycle");
    await alerts.press("Add anyway");
    expect((await getState()).groups[0].transactions).toHaveLength(1);
  });

  test("refunds are linked to the original transaction", async () => {
    const ctx = liveplusState();
    let { state } = ingestNotification(ctx.state, hsbcAlert("BIGBASKET"), NOW);
    ({ state } = ingestNotification(state, {
      text: "Refund of Rs.899.00 from BIGBASKET has been credited to your HSBC Credit Card ending 5678 on 18 Sep 2026.",
    }, NOW));
    await open(state);
    expect(await screen.findByText(/Credit or refund/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Link"));
    await waitFor(async () => expect((await getState()).groups[0].totalCashback).toBe(0));
    expect((await getState()).groups[0].transactions[1]).toMatchObject({ amount: -899, name: "Refund: BIGBASKET" });
  });

  test("original text can be shown and hidden", async () => {
    const { state } = pendingState();
    await open(state);
    await fireEvent.press(await screen.findByText("Show original text"));
    expect(screen.getByText(/has been used for INR 899.00 at BOUTIQUE XYZ/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Hide original text"));
    expect(screen.queryByText(/has been used for INR 899.00 at BOUTIQUE XYZ/)).toBeNull();
  });
});

describe("CaptureSettings", () => {
  const open = async (state = {}) => {
    await seed(state);
    await render(<CaptureSettings navigation={nav} />);
    await screen.findByText("Capture status");
  };

  test("Expo Go: explains that a development build is needed", async () => {
    await open();
    expect(screen.getAllByText(/development build/).length).toBeGreaterThan(0);
    expect(screen.getByText(/This is Expo Go/)).toBeTruthy();
  });

  test("turning capture on asks for consent and configures the listener", async () => {
    mockNative.available = true;
    await open();
    await fireEvent(screen.getByLabelText("Capture transaction alerts"), "valueChange", true);
    expect(alerts.last().title).toBe("Allow transaction capture?");
    await alerts.press("I agree");
    const { settings } = await getState();
    expect(settings.captureEnabled).toBe(true);
    expect(settings.consentAcceptedAt).toBeTruthy();
    expect(mockNative.configure).toHaveBeenLastCalledWith(true, expect.any(Array));
  });

  test("setup steps show status and open Android settings", async () => {
    Object.assign(mockNative, {
      available: true,
      granted: false,
      battery: false,
      diagnostics: { connectedCount: 0, postedCount: 0, queuedCount: 0 },
    });
    await open({ settings: { captureEnabled: true, consentAcceptedAt: "2026-09-26T00:00:00Z" } });
    expect(screen.getByText(/Notification access: ❌ not granted/)).toBeTruthy();
    expect(screen.getByText(/Battery optimisation: ⚠️ restricted/)).toBeTruthy();
    await fireEvent.press(screen.getByText("Open notification access"));
    await fireEvent.press(screen.getByText("Open App info"));
    await fireEvent.press(screen.getByText("Open battery settings"));
    expect(mockNative.openNotificationAccessSettings).toHaveBeenCalled();
    expect(mockNative.openAppDetailsSettings).toHaveBeenCalled();
    expect(mockNative.openBatteryOptimizationSettings).toHaveBeenCalled();
    expect(screen.getByText(/Tap "Open notification access"/)).toBeTruthy();
  });

  test("allowed apps: remove, add, and allow a detected bank app", async () => {
    Object.assign(mockNative, { available: true, blocked: ["com.example.bank"] });
    await open();
    await fireEvent.press(screen.getByText("Allow"));
    await waitFor(async () =>
      expect((await getState()).settings.allowedPackages).toContain("com.example.bank")
    );
    await fireEvent.changeText(screen.getByPlaceholderText("com.example.bank"), "com.other.bank");
    await fireEvent.press(screen.getByText("Add package"));
    await waitFor(async () => expect((await getState()).settings.allowedPackages).toContain("com.other.bank"));
    await fireEvent.press(screen.getAllByText("Remove")[0]);
    await waitFor(async () =>
      expect((await getState()).settings.allowedPackages).not.toContain("com.google.android.apps.messaging")
    );
  });

  test("paste an alert runs the pipeline and reports the result", async () => {
    const { state } = liveplusState();
    await open(state);
    await fireEvent.changeText(screen.getByPlaceholderText("Paste an SMS or notification text"), hsbcAlert("BIGBASKET", 899, "20 Sep 2026 at 10:00").text);
    await fireEvent.press(screen.getByText("Run through capture"));
    await waitFor(() => expect(alerts.last()?.title).toBe("Result"));
    expect(alerts.last().message).toMatch(/Added automatically: 1/);
    expect((await getState()).groups[0].transactions).toHaveLength(1);
  });

  test("Process captured alerts now in Expo Go says why nothing was read", async () => {
    await open();
    await fireEvent.press(screen.getByText("Process captured alerts now"));
    await waitFor(() => expect(alerts.last()?.title).toBe("Captured alerts processed"));
    expect(alerts.last().message).toMatch(/Not running the development build/);
  });

  test("number settings save when editing ends and reject invalid values", async () => {
    await open();
    const field = screen.getByLabelText("Duplicate window (minutes)");
    await fireEvent.changeText(field, "");
    await fireEvent(field, "endEditing");
    expect((await getState()).settings.duplicateWindowMinutes).toBe(10);
    expect(screen.getByLabelText("Duplicate window (minutes)").props.value).toBe("10");
    await fireEvent.changeText(field, "15");
    await fireEvent(field, "endEditing");
    await waitFor(async () => expect((await getState()).settings.duplicateWindowMinutes).toBe(15));
  });

  test("delete all captured text", async () => {
    const { state } = pendingState();
    await open(state);
    await fireEvent.press(screen.getByText("Delete all captured text now"));
    await alerts.press("Delete");
    expect((await getState()).candidates[0].rawText).toBeNull();
  });

  test("export shares JSON without captured text by default", async () => {
    const share = jest.spyOn(Share, "share").mockResolvedValue({});
    const { state } = pendingState();
    await open(state);
    await fireEvent.press(screen.getByText("Export all data (JSON)"));
    await waitFor(() => expect(share).toHaveBeenCalled());
    const json = JSON.parse(share.mock.calls[0][0].message);
    expect(json.app).toBe("SplitVCM");
    expect(json.candidates[0].rawText).toBeNull();
    share.mockRestore();
  });

  test("import validates, confirms, then replaces data", async () => {
    await open();
    await fireEvent.changeText(screen.getByLabelText("Import: paste backup JSON"), "not json");
    await fireEvent.press(screen.getByText("Import"));
    expect(alerts.last()).toMatchObject({ title: "Import failed" });

    const { state } = liveplusState();
    await fireEvent.changeText(screen.getByLabelText("Import: paste backup JSON"), exportBackup(state));
    await fireEvent.press(screen.getByText("Import"));
    expect(alerts.last().title).toBe("Replace all data?");
    await alerts.press("Replace");
    const s = await getState();
    expect(s.groups[0].id).toBe(state.groups[0].id);
    expect(s.templates[0].id).toBe(state.templates[0].id);
  });
});

describe("fields show their values (dark-mode regression)", () => {
  test("review card shows the suggested group and category in the closed fields", async () => {
    const { state } = pendingState();
    await seed(state);
    await render(<ReviewInbox navigation={nav} />);
    await screen.findByText("Add");
    expect(screen.getByLabelText("Cashback group").props.accessibilityValue.text).toBe("HSBC Live+ · 10 Sep–09 Oct 2026");
    expect(screen.getByLabelText("Category").props.accessibilityValue.text).toBe("1.5% other eligible (1.5%)");
  });

  test("an alert for an unknown card shows the placeholder and still lets you pick a group", async () => {
    const ctx = liveplusState();
    const r = ingestNotification(ctx.state, {
      text: "HSBC Credit Card xx7342 used at TATA 1MG HEALTHCARE for INR 867.00 on 26/09/26. Avl limit INR 150000.00",
      sourceApp: "com.google.android.apps.messaging",
    }, NOW);
    await seed(r.state);
    await render(<ReviewInbox navigation={nav} />);
    expect(await screen.findByText("TATA 1MG HEALTHCARE")).toBeTruthy();
    expect(screen.getByText(/26 Sep 2026 \(no time in alert\)/)).toBeTruthy();
    expect(screen.getByText("Select…")).toBeTruthy();
    await choose("Cashback group", "HSBC Live+ · 10 Sep–09 Oct 2026");
    expect(screen.getByLabelText("Category").props.accessibilityValue.text).toBe("1.5% other eligible (1.5%)");
  });
});

test("an alert from an unknown card offers a shortcut to set that card up", async () => {
  const ctx = liveplusState();
  const r = ingestNotification(ctx.state, {
    text: "HSBC Credit Card xx7342 used at TATA 1MG HEALTHCARE for INR 867.00 on 26/09/26.",
  }, NOW);
  await seed(r.state);
  await render(<ReviewInbox navigation={nav} />);
  await fireEvent.press(await screen.findByText("Set up card •••• 7342"));
  expect(nav.navigate).toHaveBeenCalledWith("CardTemplates", { cardLastFour: "7342" });
});
