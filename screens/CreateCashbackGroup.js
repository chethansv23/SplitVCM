import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";

import { Btn, Field, ui } from "../components/cashback/ui";
import { withComputed } from "../src/cashback/compute";
import { newId } from "../src/cashback/ids";
import { updateState } from "../src/cashback/store";

// Manual (non-template) cashback group, as before. Every manual group also
// gets a 0% / excluded category.
export default function CreateCashbackGroup({ navigation }) {
  const [groupName, setGroupName] = useState("");
  const [groupCap, setGroupCap] = useState("");
  const [categories, setCategories] = useState([]);
  const [categoryName, setCategoryName] = useState("");
  const [percentage, setPercentage] = useState("");
  const [cap, setCap] = useState("");

  const addCategory = () => {
    if (!categoryName || percentage === "" || isNaN(percentage))
      return Alert.alert("Enter category and percentage");
    setCategories((prev) => [
      ...prev,
      {
        id: newId("cat"),
        name: categoryName,
        percentage: parseFloat(percentage),
        cap: cap ? parseFloat(cap) : null,
        keywords: [],
        mccNotes: "",
        active: true,
        excluded: false,
        isDefault: prev.length === 0,
      },
    ]);
    setCategoryName("");
    setPercentage("");
    setCap("");
  };

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
    await updateState((s) => ({ ...s, groups: [...s.groups, group] }));
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

      <Text style={[ui.title, { marginTop: 16 }]}>Add Categories</Text>
      <Field value={categoryName} onChangeText={setCategoryName} placeholder="Category name (e.g. Recharge)" style={{ marginTop: 6 }} />
      <Field value={percentage} onChangeText={setPercentage} placeholder="Percentage (e.g. 10)" keyboardType="numeric" style={{ marginTop: 6 }} />
      <Field value={cap} onChangeText={setCap} placeholder="Cap (optional)" keyboardType="numeric" style={{ marginTop: 6 }} />
      <Btn title="Add Category" onPress={addCategory} />

      <View style={{ marginVertical: 10 }}>
        {categories.map((item) => (
          <Text key={item.id}>
            {item.name} - {item.percentage}% {item.cap ? `(cap ₹${item.cap})` : ""}
          </Text>
        ))}
        <Text style={ui.small}>A "0% / excluded" category is added automatically.</Text>
      </View>

      <Btn title="Create Group" kind="success" onPress={createGroup} />
    </ScrollView>
  );
}
