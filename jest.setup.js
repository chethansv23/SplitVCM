// Shared mocks for every test file.

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// Native capture module is absent under Jest (as in Expo Go) unless a test
// mocks modules/notification-capture itself.
