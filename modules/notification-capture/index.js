import { Platform } from "react-native";
import { requireOptionalNativeModule } from "expo";

// Null in Expo Go, on iOS, and on web: the capture feature needs the custom
// Android development build.
const Native = Platform.OS === "android" ? requireOptionalNativeModule("NotificationCapture") : null;

export const isCaptureAvailable = () => Boolean(Native);

const call = (name, fallback, ...args) => (Native ? Native[name](...args) : fallback);

export default {
  isAvailable: isCaptureAvailable,
  isPermissionGranted: () => call("isPermissionGranted", false),
  openNotificationAccessSettings: () => call("openNotificationAccessSettings", undefined),
  openAppDetailsSettings: () => call("openAppDetailsSettings", undefined),
  isIgnoringBatteryOptimizations: () => call("isIgnoringBatteryOptimizations", true),
  openBatteryOptimizationSettings: () => call("openBatteryOptimizationSettings", undefined),
  requestRebind: () => call("requestRebind", undefined),
  configure: (enabled, allowedPackages) => call("configure", undefined, enabled, allowedPackages),
  // Returns and clears queued notifications:
  // [{ id, sourceApp, title, text, postedAt }]
  drainQueue: async () => (Native ? JSON.parse(await Native.drainQueue()) : []),
  // Package names of transaction-looking notifications blocked by the
  // allowlist (names only, no content), to help the user add their bank app.
  getBlockedPackages: () => call("getBlockedPackages", []),
  // Counters from the listener: connected/posted/disabled/notTransaction/
  // blocked/queued/repeat (…Count and …At), plus enabled and queueLength.
  getDiagnostics: () => call("getDiagnostics", null),
  resetDiagnostics: () => call("resetDiagnostics", undefined),
};
