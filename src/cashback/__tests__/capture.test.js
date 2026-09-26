import AsyncStorage from "@react-native-async-storage/async-storage";

import { __resetStore, getState, KEYS } from "../store";
import { hsbcAlert, liveplusState } from "./helpers";

// A controllable stand-in for the Android native module.
const mockNative = {
  available: true,
  queue: [],
  configure: jest.fn(),
};
jest.mock("../../../modules/notification-capture", () => ({
  __esModule: true,
  default: {
    isAvailable: () => mockNative.available,
    configure: (...a) => mockNative.configure(...a),
    drainQueue: async () => {
      const q = mockNative.queue;
      mockNative.queue = [];
      return q;
    },
  },
}));

const { ingestPastedAlert, processCapturedNotifications, syncCaptureConfig } = require("../capture");

const seed = async (settings = {}) => {
  await AsyncStorage.clear();
  __resetStore();
  const { state } = liveplusState();
  await AsyncStorage.multiSet([
    [KEYS.schemaVersion, "1"],
    [KEYS.groups, JSON.stringify(state.groups)],
    [KEYS.templates, JSON.stringify(state.templates)],
    [KEYS.settings, JSON.stringify(settings)],
  ]);
};

beforeEach(() => {
  mockNative.available = true;
  mockNative.queue = [];
  mockNative.configure.mockClear();
});

test("drains the native queue and auto-assigns clear alerts", async () => {
  await seed();
  mockNative.queue = [
    { ...hsbcAlert("BIGBASKET"), postedAt: Date.parse("2026-09-14T12:40:00Z") },
    // Different amount: the same card + amount within 10 minutes would be merged.
    { ...hsbcAlert("BOUTIQUE", 500), postedAt: Date.parse("2026-09-14T12:41:00Z") },
    { text: "Your OTP is 123456 for Rs.10", sourceApp: "com.google.android.apps.messaging", postedAt: 1 },
  ];
  const r = await processCapturedNotifications(new Date("2026-09-25T06:00:00Z"));
  expect(r).toEqual({ assigned: 1, review: 1, duplicate: 0, ignored: 1, fromQueue: 3, pending: 1 });
  expect((await getState()).groups[0].transactions).toHaveLength(1);
  // The queue was emptied; a second run finds nothing.
  expect((await processCapturedNotifications()).fromQueue).toBe(0);
});

test("without the native module (Expo Go) nothing is read", async () => {
  await seed();
  mockNative.available = false;
  mockNative.queue = [hsbcAlert("BIGBASKET")];
  const r = await processCapturedNotifications();
  expect(r.fromQueue).toBe(0);
  expect(r.assigned).toBe(0);
});

test.each([
  [{ captureEnabled: true, consentAcceptedAt: "2026-09-26" }, true],
  [{ captureEnabled: true, consentAcceptedAt: null }, false],
  [{ captureEnabled: false, consentAcceptedAt: "2026-09-26" }, false],
])("syncCaptureConfig only enables the listener with consent: %j", async (settings, enabled) => {
  await seed(settings);
  await syncCaptureConfig();
  expect(mockNative.configure).toHaveBeenCalledWith(enabled, expect.arrayContaining(["com.google.android.apps.messaging"]));
});

test("pasted alerts go through the same pipeline", async () => {
  await seed();
  const s = await ingestPastedAlert(hsbcAlert("BIGBASKET").text, "com.google.android.apps.messaging", new Date("2026-09-25T06:00:00Z"));
  expect(s.assigned).toBe(1);
  expect((await getState()).candidates[0].source).toBe("sms-notification");
});
