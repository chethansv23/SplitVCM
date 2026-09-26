// Turns the native listener's counters into a checklist that says where a
// captured alert stopped. Pure, so it can be unit-tested.
//
// input: { available, granted, settings, diagnostics } where diagnostics is
// the native getDiagnostics() map (counts + timestamps), or null.

export const explainCapture = ({ available, granted, settings, diagnostics: d }) => {
  const steps = [];
  const add = (ok, label, fix = null) => steps.push({ ok, label, fix });

  if (!available) {
    add(false, "Running the SplitVCM development build",
      "This is Expo Go (or iOS/web), which cannot read notifications. Install the development build: eas build --profile development --platform android, then open SplitVCM from that app, not from Expo Go.");
    return { steps, verdict: steps[0].fix };
  }
  add(true, "Running the SplitVCM development build");

  const enabled = Boolean(settings.captureEnabled && settings.consentAcceptedAt);
  add(enabled, "Capture switched on in SplitVCM", enabled ? null : 'Switch on "Capture transaction alerts" above.');
  add(granted, "Notification access granted",
    granted ? null : 'Tap "Open notification access" and enable SplitVCM. If it is greyed out, first allow restricted settings in App info.');

  const connected = (d?.connectedCount || 0) > 0;
  add(connected, "Listener connected by Android",
    connected ? null : 'Android has not started the listener yet. Toggle SplitVCM off and on in notification access, or tap "Reconnect listener", then restart the phone if needed.');

  const posted = d?.postedCount || 0;
  add(posted > 0, `Notifications seen: ${posted}`,
    posted > 0 ? null : "No notifications reached SplitVCM. Check the SMS app actually shows a notification (not muted/silent), and battery settings are Unrestricted.");

  if (d?.disabledCount) {
    add(!enabled, `Seen while capture was off: ${d.disabledCount}`, enabled ? null : "Switch capture on, then send the alert again.");
  }
  if (d?.notTransactionCount) {
    add(true, `Skipped as not a transaction: ${d.notTransactionCount}`,
      "Only texts with an amount (Rs/INR/₹) and a word like spent, debited, paid, or used are kept.");
  }
  if (d?.blockedCount) {
    add(false, `From apps not in the allowed list: ${d.blockedCount}`,
      'Your SMS app may not be allowed — use "Allow" under Allowed apps for its package name.');
  }
  const queued = d?.queuedCount || 0;
  add(queued > 0, `Queued for SplitVCM: ${queued}`);
  if (d?.repeatCount) add(true, `Repeated notifications skipped: ${d.repeatCount}`);

  const firstProblem = steps.find((s) => !s.ok && s.fix);
  let verdict;
  if (firstProblem) verdict = firstProblem.fix;
  else if (queued > 0) verdict = 'Alerts are being captured. "Process captured alerts now" shows what happened to each.';
  else verdict = "Send a test alert and check these counts again.";
  return { steps, verdict };
};
