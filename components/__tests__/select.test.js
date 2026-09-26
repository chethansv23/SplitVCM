import { fireEvent, render, screen } from "@testing-library/react-native";
import { StyleSheet } from "react-native";

import { Select } from "../cashback/ui";

const options = [
  { value: "g1", label: "HSBC Live+ · 10 Sep–09 Oct 2026" },
  { value: "g2", label: "Manual card" },
];

// Regression: on a phone in dark mode the native Android picker drew white
// text on the white field, so the chosen group/category looked blank.
test("the chosen option is visible in the closed field, in a fixed dark colour", async () => {
  await render(<Select label="Cashback group" value="g1" onChange={() => {}} options={options} />);
  const text = screen.getByText("HSBC Live+ · 10 Sep–09 Oct 2026");
  expect(StyleSheet.flatten(text.props.style).color).toBe("#000");
  expect(screen.getByLabelText("Cashback group").props.accessibilityValue).toEqual({
    text: "HSBC Live+ · 10 Sep–09 Oct 2026",
  });
});

test("shows the placeholder when nothing is chosen, and a hint when there are no options", async () => {
  const { rerender } = await render(<Select label="Category" value={null} onChange={() => {}} options={options} />);
  expect(screen.getByText("Select…")).toBeTruthy();
  await rerender(<Select label="Category" value={null} onChange={() => {}} options={[]} />);
  expect(screen.getByText("Nothing to choose yet")).toBeTruthy();
});

test("opens a list, marks the current option, and reports the choice", async () => {
  const onChange = jest.fn();
  await render(<Select label="Cashback group" value="g1" onChange={onChange} options={options} />);
  expect(screen.queryByText("Manual card")).toBeNull();
  await fireEvent.press(screen.getByLabelText("Cashback group"));
  const current = screen.getAllByText("HSBC Live+ · 10 Sep–09 Oct 2026").at(-1);
  expect(StyleSheet.flatten(current.props.style).fontWeight).toBe("bold");
  await fireEvent.press(screen.getByText("Manual card"));
  expect(onChange).toHaveBeenCalledWith("g2");
  expect(screen.queryByText("Manual card")).toBeNull();
});

test("Cancel closes the list without changing anything", async () => {
  const onChange = jest.fn();
  await render(<Select label="Category" value={null} onChange={onChange} options={options} />);
  await fireEvent.press(screen.getByLabelText("Category"));
  await fireEvent.press(screen.getByText("Cancel"));
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.queryByText("Manual card")).toBeNull();
});
