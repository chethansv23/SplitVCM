import { Text, View } from "react-native";

import { Chips, Field, ui } from "./ui";

export const EMPTY_TRACKING = { digits: "", mode: "billing-cycle", startDay: "" };

// { digits, mode, startDay } from the form -> cycle object for a card.
export const cycleFromFields = ({ mode, startDay }) =>
  mode === "calendar-month"
    ? { mode }
    : { mode, startDay: /^\d{1,2}$/.test(startDay) ? parseInt(startDay, 10) : null };

// Card digits and billing cycle: what automatic tracking needs to match an
// alert like "Card xx7342 used on 26/09/26" to this card's current cycle.
export default function CardTrackingFields({ value, onChange, title = "Card for automatic tracking" }) {
  const set = (patch) => onChange({ ...value, ...patch });
  return (
    <View>
      <Text style={[ui.strong, { marginTop: 14 }]}>{title}</Text>
      <Text style={ui.small}>
        Alerts from this card's SMS, bank app or email are matched by its last four digits and added to the
        cycle their date falls in.
      </Text>
      <Field
        label="Card last four digits"
        value={value.digits}
        onChangeText={(digits) => set({ digits: digits.replace(/\D/g, "").slice(0, 4) })}
        placeholder="e.g. 7342"
        keyboardType="number-pad"
        maxLength={4}
      />
      <Text style={[ui.strong, { marginTop: 10 }]}>Billing cycle</Text>
      <Chips
        value={value.mode}
        onChange={(mode) => set({ mode })}
        options={[
          { value: "billing-cycle", label: "Statement cycle" },
          { value: "calendar-month", label: "Calendar month" },
        ]}
      />
      {value.mode === "billing-cycle" ? (
        <Field
          label="Cycle start day (e.g. 10 = 10th to 9th of next month)"
          value={value.startDay}
          onChangeText={(startDay) => set({ startDay: startDay.replace(/\D/g, "").slice(0, 2) })}
          placeholder="1–31"
          keyboardType="number-pad"
          maxLength={2}
        />
      ) : null}
    </View>
  );
}
