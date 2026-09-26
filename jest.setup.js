// Shared mocks for every test file.

jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock")
);

// A Picker whose options render as pressable text: tests select an option
// with fireEvent.press(getByText("Option label")).
jest.mock("@react-native-picker/picker", () => {
  const React = require("react");
  const { Text, View } = require("react-native");
  const Ctx = React.createContext(null);
  const Picker = ({ selectedValue, onValueChange, children, testID }) => (
    <Ctx.Provider value={{ selectedValue, onValueChange }}>
      <View testID={testID}>{children}</View>
    </Ctx.Provider>
  );
  Picker.Item = function Item({ label, value }) {
    const ctx = React.useContext(Ctx);
    return (
      <Text
        accessibilityState={{ selected: ctx.selectedValue === value }}
        onPress={() => ctx.onValueChange(value)}
      >
        {label}
      </Text>
    );
  };
  return { Picker };
});

// Native capture module is absent under Jest (as in Expo Go) unless a test
// mocks modules/notification-capture itself.
