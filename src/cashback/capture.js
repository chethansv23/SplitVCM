import NotificationCapture from "../../modules/notification-capture";
import { applyRetention, ingestMany, pendingCandidates } from "./inbox";
import { getState, updateState, withResult } from "./store";

// Pushes the capture settings to the native listener.
export const syncCaptureConfig = async () => {
  const { settings } = await getState();
  if (!NotificationCapture.isAvailable()) return;
  NotificationCapture.configure(
    Boolean(settings.captureEnabled && settings.consentAcceptedAt),
    settings.allowedPackages
  );
};

// Drains the native queue, runs the capture pipeline (auto-assign or
// review), and applies retention. Safe to call on every app open/foreground.
export const processCapturedNotifications = async (now = new Date()) => {
  let raws = [];
  if (NotificationCapture.isAvailable()) {
    try {
      raws = await NotificationCapture.drainQueue();
    } catch (e) {
      console.warn("Could not read captured notifications", e);
    }
  }
  const summary = await updateState((state) => {
    const { state: next, summary } = ingestMany(
      state,
      raws.map((r) => ({
        text: r.text,
        title: r.title,
        sourceApp: r.sourceApp,
        postedAt: r.postedAt ? new Date(r.postedAt).toISOString() : undefined,
      })),
      now
    );
    const retained = applyRetention(next, now);
    return withResult(retained, summary);
  });
  const state = await getState();
  return { ...summary, fromQueue: raws.length, pending: pendingCandidates(state).length };
};

// "Paste an alert" test path: runs one alert through the same pipeline.
export const ingestPastedAlert = (text, sourceApp = null, now = new Date()) =>
  updateState((state) => {
    const { state: next, summary } = ingestMany(state, [{ text, sourceApp, postedAt: now.toISOString() }], now);
    return withResult(next, summary);
  });
