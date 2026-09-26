import { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, View } from "react-native";

import CardTrackingFields, { cycleFromFields, EMPTY_TRACKING } from "../components/cashback/CardTrackingFields";
import { Btn, Field, ui } from "../components/cashback/ui";
import { recheckReview } from "../src/cashback/capture";
import { withComputed } from "../src/cashback/compute";
import { newId } from "../src/cashback/ids";
import { updateState } from "../src/cashback/store";
import { trackGroupWithCard } from "../src/cashback/templates";

// Manual (non-template) cashback group, as before. Every manual group also
// gets a 0% / excluded category.
export default function CreateCashbackGroup({ navigation }) {
  const [groupName, setGroupName] = useState("");
  const [groupCap, setGroupCap] = useState("");
  const [categories, setCategories] = useState([]);
  const [categoryName, setCategoryName] = useState("");
  const [percentage, setPercentage] = useState("");
  const [cap, setCap] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [tracked, setTracked] = useState(EMPTY_TRACKING);

  const clearForm = () => {
    setCategoryName("");
    setPercentage("");
    setCap("");
    setEditingId(null);
  };

  // Adds a new category, or saves the one being edited.
  const saveCategory = () => {
    if (!categoryName || percentage === "" || isNaN(percentage))
      return Alert.alert("Enter category and percentage");
    const fields = {
      name: categoryName,
      percentage: parseFloat(percentage),
      cap: cap ? parseFloat(cap) : null,
    };
    setCategories((prev) =>
      editingId
        ? prev.map((c) => (c.id === editingId ? { ...c, ...fields } : c))
        : [
            ...prev,
            {
              id: newId("cat"),
              ...fields,
              keywords: [],
              mccNotes: "",
              active: true,
              excluded: false,
              isDefault: prev.length === 0,
            },
          ]
    );
    clearForm();
  };

  const editCategory = (c) => {
    setEditingId(c.id);
    setCategoryName(c.name);
    setPercentage(String(c.percentage));
    setCap(c.cap == null ? "" : String(c.cap));
  };

  const deleteCategory = (c) =>
    Alert.alert("Delete category", `Delete "${c.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          setCategories((prev) => {
            const rest = prev.filter((x) => x.id !== c.id);
            // Keep one default suggestion when the default is removed.
            return c.isDefault && rest.length ? [{ ...rest[0], isDefault: true }, ...rest.slice(1)] : rest;
          });
          if (editingId === c.id) clearForm();
        },
      },
    ]);

  const createGroup = async () => {
    if (!groupName) return Alert.alert("Enter group name");
    const group = withComputed({
      id: newId("group"),
      name: groupName,
      templateId: null,
      cycleStart: null,
      cycleEnd: null,
      status: "open",
      categories: [
        ...categories,
        {
          id: newId("cat"), name: "0% / excluded", percentage: 0, cap: null, keywords: [],
          mccNotes: "", active: true, excluded: true, isDefault: false,
        },
      ],
      capPools: [],
      groupCap: groupCap ? parseFloat(groupCap) : null,
      rounding: "per-transaction-floor",
      rewardValue: 1,
      transactions: [],
      createdAt: new Date().toISOString(),
    });
    const tracking = tracked.digits !== "";
    try {
      await updateState((s) => {
        const next = { ...s, groups: [...s.groups, group] };
        // Optional: link the new group to its card so alerts are added
        // automatically. Throws (saving nothing) if the details are invalid.
        return tracking
          ? trackGroupWithCard(next, group.id, { cardLastFour: tracked.digits, cycle: cycleFromFields(tracked) }).state
          : next;
      });
    } catch (e) {
      return Alert.alert("Check the card details", e.message);
    }
    if (tracking) await recheckReview();
    navigation.goBack();
  };

  return (
    <ScrollView contentContainerStyle={ui.scroll} keyboardShouldPersistTaps="handled">
      <Field
        label="Cashback Group Name"
        value={groupName}
        onChangeText={setGroupName}
        placeholder="e.g. Credit Card A"
      />
      <Field
        label="Group cap (optional)"
        value={groupCap}
        onChangeText={setGroupCap}
        placeholder="Leave blank for no cap"
        keyboardType="numeric"
      />

      <Text style={[ui.title, { marginTop: 16 }]}>{editingId ? "Edit Category" : "Add Categories"}</Text>
      <Field value={categoryName} onChangeText={setCategoryName} placeholder="Category name (e.g. Recharge)" style={{ marginTop: 6 }} />
      <Field value={percentage} onChangeText={setPercentage} placeholder="Percentage (e.g. 10)" keyboardType="numeric" style={{ marginTop: 6 }} />
      <Field value={cap} onChangeText={setCap} placeholder="Cap (optional)" keyboardType="numeric" style={{ marginTop: 6 }} />
      <Btn title={editingId ? "Save Category" : "Add Category"} onPress={saveCategory} />
      {editingId ? <Btn title="Cancel edit" kind="secondary" onPress={clearForm} /> : null}

      <View style={{ marginVertical: 10 }}>
        {categories.map((item) => (
          <View key={item.id} style={[ui.between, styles.categoryRow, editingId === item.id && styles.editing]}>
            <Text style={{ flex: 1 }}>
              {item.name} - {item.percentage}% {item.cap ? `(cap ₹${item.cap})` : ""}
            </Text>
            <Btn small kind="secondary" title="Edit" onPress={() => editCategory(item)} />
            <Btn small kind="danger" title="Delete" onPress={() => deleteCategory(item)} style={{ marginLeft: 6 }} />
          </View>
        ))}
        <Text style={ui.small}>A "0% / excluded" category is added automatically.</Text>
      </View>

      <CardTrackingFields
        value={tracked}
        onChange={setTracked}
        title="Track this card automatically (optional)"
      />
      <Text style={ui.small}>Leave the digits blank to keep this a manual-only group.</Text>

      <Btn title="Create Group" kind="success" onPress={createGroup} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  categoryRow: { paddingVertical: 6, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: "#ccc" },
  editing: { backgroundColor: "#e7f1ff" },
});
