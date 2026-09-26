import { act, fireEvent, render, screen } from "@testing-library/react-native";
import { AppState } from "react-native";

import App from "../App";

jest.mock("expo-secure-store", () => ({
  getItemAsync: jest.fn(async () => "4827"),
  setItemAsync: jest.fn(),
}));
jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(async () => true),
  isEnrolledAsync: jest.fn(async () => true),
  authenticateAsync: jest.fn(async () => ({ success: true })),
}));

const mockCapture = { results: [] };
jest.mock("../src/cashback/capture", () => ({
  syncCaptureConfig: jest.fn(async () => {}),
  processCapturedNotifications: jest.fn(async () => mockCapture.results.shift() || { pending: 0, review: 0 }),
  ingestPastedAlert: jest.fn(),
}));

// Capture the AppState listener so the test can simulate returning to the app.
let appStateListener;
beforeEach(() => {
  jest.spyOn(AppState, "addEventListener").mockImplementation((_type, fn) => {
    appStateListener = fn;
    return { remove: jest.fn() };
  });
});
afterEach(() => jest.restoreAllMocks());

test("after unlocking, the review prompt opens the Needs Review screen", async () => {
  mockCapture.results = [{ pending: 2, review: 0 }];
  await render(<App />);
  expect(await screen.findByText("2 captured transactions could not be assigned automatically.", { exact: false })).toBeTruthy();
  await fireEvent.press(screen.getByText("Review now"));
  expect(await screen.findByText("Nothing to review. 🎉")).toBeTruthy();
});

test("no prompt when nothing is pending", async () => {
  mockCapture.results = [{ pending: 0, review: 0 }];
  await render(<App />);
  expect(await screen.findByText("No groups created yet.")).toBeTruthy();
  expect(screen.queryByText("Needs review")).toBeNull();
});

test("returning to the app prompts again only when new items need review", async () => {
  mockCapture.results = [{ pending: 1, review: 0 }, { pending: 1, review: 0 }, { pending: 2, review: 1 }];
  await render(<App />);
  await screen.findByText("Needs review");
  await fireEvent.press(screen.getByText("Later"));
  expect(screen.queryByText("Needs review")).toBeNull();

  // Back from Android settings with nothing new: no prompt.
  await act(async () => appStateListener("active"));
  expect(screen.queryByText("Needs review")).toBeNull();

  // A new alert went to review: prompt again.
  await act(async () => appStateListener("active"));
  expect(await screen.findByText("Needs review")).toBeTruthy();
});
