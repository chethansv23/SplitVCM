import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

import { hasPin, setPin, validatePinSetup, verifyPin } from "../pin";

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

jest.mock("expo-secure-store", () => {
  let store = {};
  return {
    getItemAsync: jest.fn(async (k) => (k in store ? store[k] : null)),
    setItemAsync: jest.fn(async (k, v) => { store[k] = v; }),
    deleteItemAsync: jest.fn(async (k) => { delete store[k]; }),
    __reset: () => { store = {}; },
  };
});

beforeEach(async () => {
  await AsyncStorage.clear();
  SecureStore.__reset();
});

describe("validatePinSetup", () => {
  test.each([
    ["12a4", "12a4", "digits only"],
    ["123", "123", "4–6 digits"],
    ["1234567", "1234567", "4–6 digits"],
    ["1111", "1111", "repeated"],
    ["1234", "1243", "do not match"],
  ])("%s / %s → %s", (pin, confirm, message) => {
    expect(validatePinSetup(pin, confirm)).toContain(message);
  });

  test("valid PIN", () => {
    expect(validatePinSetup("4827", "4827")).toBeNull();
  });
});

test("no default PIN: nothing verifies until one is set", async () => {
  expect(await hasPin()).toBe(false);
  expect(await verifyPin("2305")).toBe(false);
  await setPin("4827");
  expect(await hasPin()).toBe(true);
  expect(await verifyPin("4827")).toBe(true);
  expect(await verifyPin("0000")).toBe(false);
});

test("legacy AsyncStorage PIN moves to SecureStore", async () => {
  await AsyncStorage.setItem("userPin", "9182");
  expect(await hasPin()).toBe(true);
  expect(await AsyncStorage.getItem("userPin")).toBeNull();
  expect(await verifyPin("9182")).toBe(true);
});
