import { explainCapture } from "../captureDiagnostics";

const on = { captureEnabled: true, consentAcceptedAt: "2026-09-26T00:00:00Z" };
const diag = (counts) => ({ connectedCount: 1, postedCount: 0, queuedCount: 0, ...counts });

test("Expo Go: explains that a development build is needed", () => {
  const r = explainCapture({ available: false, granted: false, settings: on, diagnostics: null });
  expect(r.verdict).toMatch(/Expo Go/);
  expect(r.steps).toHaveLength(1);
});

test("capture switched off comes before permission", () => {
  const r = explainCapture({ available: true, granted: false, settings: { captureEnabled: false }, diagnostics: diag({}) });
  expect(r.verdict).toMatch(/Switch on/);
});

test("permission missing", () => {
  const r = explainCapture({ available: true, granted: false, settings: on, diagnostics: diag({}) });
  expect(r.verdict).toMatch(/notification access/);
});

test("listener never connected", () => {
  const r = explainCapture({ available: true, granted: true, settings: on, diagnostics: diag({ connectedCount: 0 }) });
  expect(r.verdict).toMatch(/not started the listener/);
});

test("no notifications seen", () => {
  const r = explainCapture({ available: true, granted: true, settings: on, diagnostics: diag({}) });
  expect(r.verdict).toMatch(/No notifications reached/);
});

test("SMS app not allowed", () => {
  const r = explainCapture({
    available: true, granted: true, settings: on,
    diagnostics: diag({ postedCount: 3, blockedCount: 1 }),
  });
  expect(r.verdict).toMatch(/Allowed apps/);
});

test("working", () => {
  const r = explainCapture({
    available: true, granted: true, settings: on,
    diagnostics: diag({ postedCount: 5, notTransactionCount: 3, queuedCount: 2 }),
  });
  expect(r.verdict).toMatch(/being captured/);
  expect(r.steps.every((s) => s.ok)).toBe(true);
});
