import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const PIN_KEY = "userPin";

export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;

export const validatePinSetup = (pin, confirm) => {
  if (!/^\d+$/.test(pin || "")) return "PIN must contain digits only.";
  if (pin.length < PIN_MIN_LENGTH || pin.length > PIN_MAX_LENGTH) {
    return `PIN must be ${PIN_MIN_LENGTH}–${PIN_MAX_LENGTH} digits.`;
  }
  if (/^(\d)\1+$/.test(pin)) return "Choose a PIN that is not a single repeated digit.";
  if (pin !== confirm) return "PINs do not match.";
  return null;
};

// Moves a PIN saved by older versions (plain AsyncStorage) into SecureStore.
const migrateLegacyPin = async () => {
  const legacy = await AsyncStorage.getItem(PIN_KEY);
  if (legacy == null) return;
  if (!(await SecureStore.getItemAsync(PIN_KEY))) {
    await SecureStore.setItemAsync(PIN_KEY, legacy);
  }
  await AsyncStorage.removeItem(PIN_KEY);
};

export const hasPin = async () => {
  await migrateLegacyPin();
  return Boolean(await SecureStore.getItemAsync(PIN_KEY));
};

export const setPin = (pin) => SecureStore.setItemAsync(PIN_KEY, pin);

export const verifyPin = async (pin) => {
  const stored = await SecureStore.getItemAsync(PIN_KEY);
  return Boolean(stored) && stored === pin;
};
