import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export default function CreateCashbackGroup({ navigation }) {
  const [groupName, setGroupName] = useState("");
  const [groupCap, setGroupCap] = useState(0);
  const [categories, setCategories] = useState([]);
  const [categoryName, setCategoryName] = useState("");
  const [percentage, setPercentage] = useState("");
  const [cap, setCap] = useState("");

  // Load existing groups
  const [groups, setGroups] = useState([]);
  useEffect(() => {
    (async () => {
      const storedGroups = await AsyncStorage.getItem("cashbacks");
      if (storedGroups) setGroups(JSON.parse(storedGroups));
    })();
  }, []);

  const addCategory = () => {
    if (!categoryName || !percentage)
      return Alert.alert("Enter category and percentage");
    setCategories((prev) => [
      ...prev,
      {
        name: categoryName,
        percentage: parseFloat(percentage),
        cap: cap ? parseFloat(cap) : null,
        totalCashback: 0,
      },
    ]);
    setCategoryName("");
    setPercentage("");
    setCap("");
  };

  const createGroup = async () => {
    if (!groupName) return Alert.alert("Enter group name");
    const newGroup = {
      id: Date.now(),
      name: groupName,
      categories,
      transactions: [],
      groupCap,
      totalCashback: 0,
    };
    const updatedGroups = [...groups, newGroup];
    await AsyncStorage.setItem("cashbacks", JSON.stringify(updatedGroups));
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      <Text style={styles.label}>Cashback Group Name</Text>
      <TextInput
        style={styles.input}
        value={groupName}
        onChangeText={setGroupName}
        placeholder="e.g. Credit Card A"
        placeholderTextColor="#888"
      />
      <TextInput
        style={styles.input}
        value={groupCap}
        onChangeText={setGroupCap}
        placeholder="cap (optional)"
        placeholderTextColor="#888"
        keyboardType="numeric"
      />

      <Text style={styles.label}>Add Categories</Text>
      <TextInput
        style={styles.input}
        value={categoryName}
        onChangeText={setCategoryName}
        placeholder="Category name (e.g. Recharge)"
        placeholderTextColor="#888"
      />
      <TextInput
        style={styles.input}
        value={percentage}
        onChangeText={setPercentage}
        placeholder="Percentage (e.g. 10)"
        placeholderTextColor="#888"
        keyboardType="numeric"
      />
      <TextInput
        style={styles.input}
        value={cap}
        onChangeText={setCap}
        placeholder="Cap (optional)"
        placeholderTextColor="#888"
        keyboardType="numeric"
      />
      <Button title="Add Category" onPress={addCategory} />

      <FlatList
        data={categories}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item }) => (
          <Text>
            {item.name} - {item.percentage}%{" "}
            {item.cap ? `(cap ₹${item.cap})` : ""}
          </Text>
        )}
      />

      <Button title="Create Group" onPress={createGroup} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  label: { fontWeight: "bold", marginTop: 12 },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 8,
    marginVertical: 6,
    borderRadius: 6,
  },
});
