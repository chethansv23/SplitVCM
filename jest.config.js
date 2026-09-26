const path = require("path");

// npm nests expo-modules-core inside expo/, where jest-expo's preset cannot
// find it; resolve it through expo so the mapping survives reinstalls.
const expoModulesCore = path.dirname(
  require.resolve("expo-modules-core/package.json", {
    paths: [path.dirname(require.resolve("expo/package.json"))],
  })
);

module.exports = {
  preset: "jest-expo",
  globalSetup: "./jest.global-setup.js",
  testMatch: ["**/__tests__/**/*.test.js"],
  modulePathIgnorePatterns: ["<rootDir>/modules/notification-capture/android"],
  moduleNameMapper: {
    "^expo-modules-core$": expoModulesCore,
    "^expo-modules-core/(.*)$": `${expoModulesCore}/$1`,
  },
};
