import AsyncStorage from "@react-native-async-storage/async-storage";
import { act } from "@testing-library/react-native";
import { Alert } from "react-native";

import { DEFAULT_SETTINGS } from "../../src/cashback/inbox";
import { __resetStore, getState, KEYS } from "../../src/cashback/store";

// Puts a cashback state into storage and loads it, as the app would on start.
export const seed = async (state) => {
  await AsyncStorage.clear();
  __resetStore();
  await AsyncStorage.multiSet([
    [KEYS.schemaVersion, "1"],
    [KEYS.groups, JSON.stringify(state.groups || [])],
    [KEYS.templates, JSON.stringify(state.templates || [])],
    [KEYS.candidates, JSON.stringify(state.candidates || [])],
    [KEYS.settings, JSON.stringify({ ...DEFAULT_SETTINGS, ...(state.settings || {}) })],
  ]);
  return getState();
};

export const makeNavigation = () => ({ navigate: jest.fn(), goBack: jest.fn() });

// Records Alert.alert calls; `press(text)` taps a button of the last alert.
export const mockAlerts = () => {
  const calls = [];
  const spy = jest.spyOn(Alert, "alert").mockImplementation((title, message, buttons) => {
    calls.push({ title, message, buttons: buttons || [] });
  });
  return {
    calls,
    last: () => calls[calls.length - 1],
    press: async (text) => {
      const alert = calls[calls.length - 1];
      const button = alert?.buttons.find((b) => b.text === text);
      if (!button) throw new Error(`No "${text}" button on alert "${alert?.title}"`);
      // The press saves state, which re-renders subscribed screens.
      await act(async () => {
        await button.onPress?.();
      });
    },
    restore: () => spy.mockRestore(),
  };
};
