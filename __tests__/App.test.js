import AsyncStorage from "@react-native-async-storage/async-storage";
import { fireEvent, render, screen, waitFor } from "@testing-library/react-native";
import * as SecureStore from "expo-secure-store";

import App from "../App";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);
jest.mock("expo-secure-store", () => {
  let store = {};
  return {
    getItemAsync: jest.fn(async (k) => (k in store ? store[k] : null)),
    setItemAsync: jest.fn(async (k, v) => { store[k] = v; }),
    __reset: () => { store = {}; },
  };
});
jest.mock("expo-local-authentication", () => ({
  hasHardwareAsync: jest.fn(async () => false),
  isEnrolledAsync: jest.fn(async () => false),
  authenticateAsync: jest.fn(async () => ({ success: false })),
}));
// Keep the smoke test to the auth gate; the navigator is covered elsewhere.
jest.mock("@react-navigation/native", () => ({
  ...jest.requireActual("@react-navigation/native"),
  NavigationContainer: () => null,
}));

beforeEach(async () => {
  await AsyncStorage.clear();
  SecureStore.__reset();
});

test("first run asks the user to choose a PIN; there is no default PIN", async () => {
  await render(<App />);
  expect(await screen.findByText("Choose a PIN")).toBeTruthy();

  await fireEvent.changeText(screen.getByPlaceholderText("New PIN"), "4827");
  await fireEvent.changeText(screen.getByPlaceholderText("Confirm PIN"), "4872");
  await fireEvent.press(screen.getByText("Save PIN"));
  expect(await screen.findByText("PINs do not match.")).toBeTruthy();

  await fireEvent.changeText(screen.getByPlaceholderText("Confirm PIN"), "4827");
  await fireEvent.press(screen.getByText("Save PIN"));
  await waitFor(() => expect(screen.queryByText("Choose a PIN")).toBeNull());
  expect(await SecureStore.getItemAsync("userPin")).toBe("4827");
});

test("existing PIN: wrong PIN is rejected, old default 2305 does not work", async () => {
  await SecureStore.setItemAsync("userPin", "4827");
  await render(<App />);
  expect(await screen.findByText("Enter PIN")).toBeTruthy();
  await fireEvent.changeText(screen.getByPlaceholderText("Enter your PIN"), "2305");
  await fireEvent.press(screen.getByText("Unlock"));
  expect(await screen.findByText("Incorrect PIN, please try again.")).toBeTruthy();
});
