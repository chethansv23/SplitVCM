// The JS wrapper around the Android module: forwards calls when the native
// module exists, and returns safe defaults when it does not (Expo Go, iOS).

const load = ({ os, native }) => {
  jest.resetModules();
  jest.doMock("react-native", () => ({ Platform: { OS: os } }));
  jest.doMock("expo", () => ({ requireOptionalNativeModule: jest.fn(() => native) }));
  return require("../index").default;
};

test("forwards to the native module on Android and parses the queue JSON", async () => {
  const native = {
    isPermissionGranted: jest.fn(() => true),
    configure: jest.fn(),
    drainQueue: jest.fn(async () => JSON.stringify([{ id: "1", text: "Rs 10 spent" }])),
    getBlockedPackages: jest.fn(() => ["com.bank"]),
    getDiagnostics: jest.fn(() => ({ postedCount: 3 })),
    isIgnoringBatteryOptimizations: jest.fn(() => false),
  };
  const capture = load({ os: "android", native });
  expect(capture.isAvailable()).toBe(true);
  expect(capture.isPermissionGranted()).toBe(true);
  capture.configure(true, ["a"]);
  expect(native.configure).toHaveBeenCalledWith(true, ["a"]);
  expect(await capture.drainQueue()).toEqual([{ id: "1", text: "Rs 10 spent" }]);
  expect(capture.getBlockedPackages()).toEqual(["com.bank"]);
  expect(capture.getDiagnostics()).toEqual({ postedCount: 3 });
  expect(capture.isIgnoringBatteryOptimizations()).toBe(false);
});

test.each([
  ["Expo Go on Android", "android", null],
  ["iOS", "ios", { isPermissionGranted: () => true }],
])("%s: safe defaults, nothing called", async (_, os, native) => {
  const capture = load({ os, native });
  expect(capture.isAvailable()).toBe(false);
  expect(capture.isPermissionGranted()).toBe(false);
  expect(capture.isIgnoringBatteryOptimizations()).toBe(true);
  expect(await capture.drainQueue()).toEqual([]);
  expect(capture.getBlockedPackages()).toEqual([]);
  expect(capture.getDiagnostics()).toBeNull();
  expect(() => capture.configure(true, [])).not.toThrow();
  expect(() => capture.openNotificationAccessSettings()).not.toThrow();
});
