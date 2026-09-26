import { useEffect, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export const COLORS = {
  primary: "#007BFF",
  danger: "#dc3545",
  success: "#28A745",
  warning: "#b8860b",
  muted: "#666",
  border: "#ccc",
  card: "#f9f9f9",
};

export const money = (n) => {
  const v = Number(n) || 0;
  return `₹${Number.isInteger(v) ? v : v.toFixed(2)}`;
};

export function Btn({ title, onPress, kind = "primary", small, disabled, style }) {
  const bg = {
    primary: COLORS.primary,
    danger: COLORS.danger,
    success: COLORS.success,
    secondary: "#e9ecef",
  }[kind];
  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={[s.btn, { backgroundColor: bg, opacity: disabled ? 0.5 : 1 }, small && s.btnSmall, style]}
    >
      <Text style={[s.btnText, kind === "secondary" && { color: "#333" }, small && { fontSize: 13 }]}>
        {title}
      </Text>
    </TouchableOpacity>
  );
}

export function Field({ label, style, ...props }) {
  return (
    <View style={style}>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TextInput placeholderTextColor="#888" style={s.input} accessibilityLabel={label} {...props} />
    </View>
  );
}

// Whole-number setting that saves when editing ends, so the field can be
// cleared and retyped. Invalid or out-of-range input reverts.
export function NumberField({ label, value, onCommit, min = 1, max = 3650 }) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const commit = () => {
    const n = parseInt(text, 10);
    if (Number.isInteger(n) && n >= min && n <= max) {
      if (n !== value) onCommit(n);
    } else {
      setText(String(value));
    }
  };
  return (
    <Field
      label={label}
      value={text}
      onChangeText={setText}
      onEndEditing={commit}
      onBlur={commit}
      keyboardType="number-pad"
    />
  );
}

export function Toggle({ label, value, onValueChange, hint }) {
  return (
    <View style={s.toggleRow}>
      <View style={{ flex: 1, paddingRight: 8 }}>
        <Text style={s.toggleLabel}>{label}</Text>
        {hint ? <Text style={s.hint}>{hint}</Text> : null}
      </View>
      <Switch value={Boolean(value)} onValueChange={onValueChange} accessibilityLabel={label} />
    </View>
  );
}

// options: [{ label, value }]. A tappable field that opens a list. It draws
// its own colours, unlike the native Android picker, which follows the
// phone's dark mode and showed white text on the white field.
export function Select({ label, value, onChange, options, placeholder = "Select…" }) {
  const [open, setOpen] = useState(false);
  const selected = options.find((o) => o.value === value);
  const choose = (v) => {
    setOpen(false);
    onChange(v);
  };
  return (
    <View>
      {label ? <Text style={s.label}>{label}</Text> : null}
      <TouchableOpacity
        style={s.selectBox}
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={label || placeholder}
        accessibilityValue={{ text: selected ? selected.label : placeholder }}
      >
        <Text style={[s.selectText, !selected && s.selectPlaceholder]} numberOfLines={2}>
          {selected ? selected.label : options.length ? placeholder : "Nothing to choose yet"}
        </Text>
        <Text style={s.selectChevron} accessibilityElementsHidden importantForAccessibility="no">▾</Text>
      </TouchableOpacity>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={s.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={s.sheet} onPress={() => {}}>
            <Text style={s.sheetTitle}>{label || placeholder}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {options.length === 0 ? <Text style={s.selectPlaceholder}>Nothing to choose yet</Text> : null}
              {options.map((o) => {
                const isSelected = o.value === value;
                return (
                  <TouchableOpacity
                    key={String(o.value)}
                    style={[s.option, isSelected && s.optionSelected]}
                    onPress={() => choose(o.value)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: isSelected }}
                  >
                    <Text style={[s.optionText, isSelected && s.optionTextSelected]}>{o.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
            <Btn kind="secondary" title="Cancel" onPress={() => setOpen(false)} />
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

export function Chips({ options, value, onChange }) {
  return (
    <View style={s.chips}>
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <TouchableOpacity
            key={String(o.value)}
            onPress={() => onChange(o.value)}
            style={[s.chip, selected && s.chipSelected]}
          >
            <Text style={[s.chipText, selected && s.chipTextSelected]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

export function Section({ title, children, right }) {
  return (
    <View style={s.section}>
      <View style={s.sectionHeader}>
        <Text style={s.sectionTitle}>{title}</Text>
        {right}
      </View>
      {children}
    </View>
  );
}

export function Banner({ kind = "info", children }) {
  const colors = {
    info: ["#e7f1ff", COLORS.primary],
    warning: ["#fff8e1", COLORS.warning],
    danger: ["#fdecea", COLORS.danger],
  }[kind];
  return (
    <View style={[s.banner, { backgroundColor: colors[0], borderColor: colors[1] }]}>
      <Text style={{ color: "#333" }}>{children}</Text>
    </View>
  );
}

export const ui = StyleSheet.create({
  screen: { flex: 1, padding: 16 },
  scroll: { padding: 16, paddingBottom: 48 },
  card: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    padding: 12,
    marginBottom: 10,
    backgroundColor: COLORS.card,
  },
  row: { flexDirection: "row", alignItems: "center" },
  between: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  gap: { gap: 8 },
  title: { fontSize: 18, fontWeight: "bold", color: "#333" },
  strong: { fontWeight: "bold" },
  muted: { color: COLORS.muted },
  small: { fontSize: 12, color: COLORS.muted },
  empty: { textAlign: "center", color: "#999", marginTop: 30 },
  raw: {
    fontFamily: "monospace",
    fontSize: 12,
    backgroundColor: "#eee",
    padding: 8,
    borderRadius: 4,
    marginTop: 6,
  },
});

const s = StyleSheet.create({
  btn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 6, alignItems: "center", marginTop: 8 },
  btnSmall: { paddingVertical: 6, paddingHorizontal: 10, marginTop: 0 },
  btnText: { color: "#fff", fontWeight: "bold", fontSize: 14 },
  label: { fontWeight: "bold", marginTop: 10, marginBottom: 4, color: "#333" },
  input: {
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: 8,
    borderRadius: 6,
    backgroundColor: "#fff",
    color: "#000",
  },
  hint: { fontSize: 12, color: COLORS.muted },
  toggleRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8 },
  toggleLabel: { fontSize: 15, color: "#333" },
  selectBox: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    backgroundColor: "#fff",
    paddingHorizontal: 10,
    paddingVertical: 12,
    minHeight: 48,
  },
  selectText: { flex: 1, color: "#000", fontSize: 15 },
  selectPlaceholder: { color: "#888" },
  selectChevron: { color: "#555", fontSize: 16, marginLeft: 8 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)", justifyContent: "center", padding: 24 },
  sheet: { backgroundColor: "#fff", borderRadius: 10, padding: 16, gap: 4 },
  sheetTitle: { fontSize: 16, fontWeight: "bold", color: "#000", marginBottom: 8 },
  option: { paddingVertical: 12, paddingHorizontal: 10, borderRadius: 6 },
  optionSelected: { backgroundColor: "#e7f1ff" },
  optionText: { color: "#000", fontSize: 15 },
  optionTextSelected: { color: COLORS.primary, fontWeight: "bold" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginVertical: 6 },
  chip: { borderWidth: 1, borderColor: COLORS.primary, borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6 },
  chipSelected: { backgroundColor: COLORS.primary },
  chipText: { color: COLORS.primary },
  chipTextSelected: { color: "#fff", fontWeight: "bold" },
  section: { marginTop: 18 },
  sectionHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  sectionTitle: { fontSize: 16, fontWeight: "bold", color: "#333" },
  banner: { borderLeftWidth: 4, padding: 10, borderRadius: 4, marginVertical: 8 },
});
