import { useState } from "react";
import { Modal, Pressable, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { describeMethod, fromRoundOff, toRoundOff } from "../../src/cashback/compute";
import { Btn, COLORS, Field, ui } from "./ui";

const formFrom = (rounding, blockSize) => {
  const r = toRoundOff(rounding, blockSize);
  return { roundOff: r.roundOff, per: String(r.per) };
};

// No round-off, or round off per ₹ <value>. Used inside the popup and,
// directly, in the cashback calculator.
export function RoundOffInputs({ form, onChange }) {
  const method = fromRoundOff(form.roundOff, form.per);
  const described = method && describeMethod(method.rounding, method.blockSize);
  const option = (roundOff, label, hint) => (
    <TouchableOpacity
      style={[s.option, form.roundOff === roundOff && s.optionOn]}
      onPress={() => onChange({ ...form, roundOff })}
      accessibilityRole="radio"
      accessibilityState={{ checked: form.roundOff === roundOff }}
      accessibilityLabel={label}
    >
      <Text style={s.radio}>{form.roundOff === roundOff ? "◉" : "○"}</Text>
      <View style={{ flex: 1 }}>
        <Text style={s.optionText}>{label}</Text>
        <Text style={ui.small}>{hint}</Text>
      </View>
    </TouchableOpacity>
  );
  return (
    <View>
      {option(false, "No round-off", "Exact cashback, to the paisa")}
      {option(true, "Round off per ₹ spent", "1 = round down each spend · 100 = per full ₹100 · any value")}
      {form.roundOff ? (
        <Field
          label="Round off per ₹"
          value={form.per}
          onChangeText={(t) => onChange({ ...form, per: t.replace(/[^\d.]/g, "") })}
          placeholder="e.g. 1, 100 or 150"
          keyboardType="numeric"
        />
      ) : null}
      {described ? (
        <Text style={[ui.small, { marginTop: 6 }]}>Example: {described.example}</Text>
      ) : (
        <Text style={s.error}>Enter a value above ₹0, e.g. 1, 100 or 150.</Text>
      )}
    </View>
  );
}

// "How cashback is calculated" for a card or group: shows the current
// method; tapping it opens a popup to change it. onChange({ rounding,
// blockSize }) fires on Save.
export default function CalculationMethodFields({ rounding, blockSize, onChange, title = "How cashback is calculated" }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(formFrom(rounding, blockSize));
  const current = describeMethod(rounding, blockSize);
  const draft = fromRoundOff(form.roundOff, form.per);

  const openPopup = () => {
    setForm(formFrom(rounding, blockSize));
    setOpen(true);
  };
  const save = () => {
    if (!draft) return;
    setOpen(false);
    onChange(draft);
  };

  return (
    <View>
      <Text style={[ui.strong, { marginTop: 12 }]}>{title}</Text>
      <TouchableOpacity
        style={s.summary}
        onPress={openPopup}
        accessibilityRole="button"
        accessibilityLabel={title}
        accessibilityValue={{ text: current.label }}
      >
        <View style={{ flex: 1 }}>
          <Text style={s.summaryText}>{current.label}</Text>
          <Text style={ui.small}>{current.example}</Text>
        </View>
        <Text style={s.change}>Change</Text>
      </TouchableOpacity>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.sheetTitle}>{title}</Text>
            <RoundOffInputs form={form} onChange={setForm} />
            <Btn title="Save" onPress={save} disabled={!draft} />
            <Btn title="Cancel" kind="secondary" onPress={() => setOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  summary: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    backgroundColor: "#fff",
    padding: 10,
    marginTop: 4,
  },
  summaryText: { color: "#000", fontSize: 15, fontWeight: "bold" },
  change: { color: COLORS.primary, fontWeight: "bold", marginLeft: 8 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  sheet: { backgroundColor: "#fff", borderRadius: 10, padding: 16 },
  sheetTitle: { fontSize: 16, fontWeight: "bold", color: "#000", marginBottom: 8 },
  option: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: 6, marginTop: 4 },
  optionOn: { backgroundColor: "#e7f1ff" },
  radio: { fontSize: 18, color: COLORS.primary, marginRight: 10 },
  optionText: { color: "#000", fontSize: 15 },
  error: { color: COLORS.danger, fontSize: 13, marginTop: 6 },
});
