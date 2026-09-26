import AsyncStorage from "@react-native-async-storage/async-storage";
import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Icon from "react-native-vector-icons/EvilIcons"; // Import EvilIcons for trash icon and close icon

import { Select } from "../components/cashback/ui";
import { calculateSettlements, calculateTotals, formatSettlements } from "../src/groups/settlement";

export default function GroupDetailsScreen({ route, navigation }) {
  const { group } = route.params;
  const [items, setItems] = useState(group.items || []);
  const [members, setMembers] = useState(group.members || []);
  const [newItem, setNewItem] = useState({ name: "", amount: "", payer: "" });
  const [isAdding, setIsAdding] = useState(false);
  const [isSettled, setIsSettled] = useState(group.isSettled || false);

  useEffect(() => {
    const updateGroup = async () => {
      try {
        const storedGroups =
          JSON.parse(await AsyncStorage.getItem("groups")) || [];
        const updatedGroups = storedGroups.map((g) =>
          g.name === group.name ? { ...g, items, isSettled } : g
        );
        await AsyncStorage.setItem("groups", JSON.stringify(updatedGroups));
      } catch (error) {
        console.error("Failed to update group data:", error);
      }
    };
    updateGroup();
  }, [items, isSettled]);

  const addItem = () => {
    if (!newItem.name || !newItem.amount || !newItem.payer) {
      Alert.alert("Error", "Please fill all fields!");
      return;
    }
    if (isNaN(newItem.amount) || parseFloat(newItem.amount) <= 0) {
      Alert.alert("Error", "Amount must be a positive number!");
      return;
    }
    const newItemWithDate = {
      ...newItem,
      createdAt: new Date().toISOString(),
      deleted: false,
    };
    setItems([...items, newItemWithDate]);
    setNewItem({ name: "", amount: "", payer: "" });
    setIsAdding(false);
  };

  const deleteItem = (index) => {
    Alert.alert(
      "Confirm Deletion",
      `Are you sure you want to delete ${items[index].name} item?`,
      [
        {
          text: "Cancel",
          onPress: () => console.log("Deletion canceled"),
          style: "cancel",
        },
        {
          text: "OK",
          onPress: () => {
            const updatedItems = [...items];
            updatedItems[index] = { ...updatedItems[index], deleted: true };
            setItems(updatedItems);
          },
        },
      ],
      { cancelable: false }
    );
  };

  const deleteGroup = async () => {
    Alert.alert(
      "Confirm Deletion",
      `Are you sure you want to delete the group "${group.name}"?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "OK",
          onPress: async () => {
            try {
              const storedGroupsString = await AsyncStorage.getItem("groups");
              const storedGroups = JSON.parse(storedGroupsString) || [];
              const updatedGroups = storedGroups.filter(
                (g) =>
                  g.name.trim().toLowerCase() !==
                  group.name.trim().toLowerCase()
              );
              await AsyncStorage.setItem(
                "groups",
                JSON.stringify(updatedGroups)
              );
              Alert.alert(
                "Group Deleted",
                "The group has been successfully deleted."
              );
              navigation.goBack();
            } catch (error) {
              console.error("Failed to delete group:", error);
              Alert.alert(
                "Error",
                "An error occurred while deleting the group."
              );
            }
          },
        },
      ],
      { cancelable: false }
    );
  };

  const settleGroup = () => {
    const settlements = calculateSettlements(members, items);
    Alert.alert(
      "Settlements",
      formatSettlements(settlements),
      [
        {
          text: "Cancel",
          onPress: () => console.log("Settlement cancelled"),
          style: "cancel",
        },
        {
          text: "OK",
          onPress: () => {
            setIsSettled(true);
            Alert.alert(
              "Group Settled",
              "The group has been marked as settled."
            );
          },
        },
      ],
      { cancelable: false }
    );
  };

  const { total, paidBy } = calculateTotals(items);

  return (
    <View style={styles.container}>
      {/* Delete Group Button */}
      <View style={styles.header}>
        {/* Group Name */}
        <Text style={styles.groupName}>{group.name}</Text>
        <TouchableOpacity
          style={styles.deleteGroupButton}
          onPress={deleteGroup}
          accessibilityRole="button"
          accessibilityLabel="Delete group"
        >
          <Icon name="close" size={30} color="#dc3545" />
        </TouchableOpacity>
      </View>

      <Text style={styles.total}>
        Total: ₹{total && !isNaN(total) ? total.toFixed(2) : "0.00"}
      </Text>
      {isSettled && <Text style={styles.settledText}>Group Settled</Text>}
      <View style={styles.buttonsRow}>
        <Button
          title="Details"
          onPress={() =>
            Alert.alert(
              "Details",
              Object.entries(paidBy).map(([payer, amount]) => `${payer} paid ₹${amount.toFixed(2)}`).join("\n") ||
                "No expenses yet."
            )
          }
          color="#007BFF"
          style={styles.button}
        />
        <Button
          title="Settle"
          onPress={settleGroup}
          color="#007BFF"
          style={styles.button}
        />
      </View>
      <FlatList
        data={items}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item, index }) => (
          <View style={styles.item}>
            <View>
              <Text style={item.deleted ? styles.deleted : styles.itemText}>
                {item.name || "Unnamed Item"} - ₹{item.amount || "0.00"} - Paid
                by {item.payer || "Unknown"}
              </Text>
              <Text style={styles.createdDate}>
                Created on: {new Date(item.createdAt).toLocaleString()}
              </Text>
            </View>
            {!item.deleted && (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => deleteItem(index)}
                accessibilityRole="button"
                accessibilityLabel={`Delete ${item.name || "item"}`}
              >
                <Icon name="trash" size={25} color="#dc3545" />
              </TouchableOpacity>
            )}
          </View>
        )}
      />
      {isAdding ? (
        <View style={styles.addItem}>
          <TextInput
            placeholderTextColor="#888"
            placeholder="Item Name"
            value={newItem.name}
            onChangeText={(text) => setNewItem({ ...newItem, name: text })}
            style={styles.input}
          />
          <TextInput
            placeholderTextColor="#888"
            placeholder="Amount"
            value={newItem.amount}
            onChangeText={(text) => setNewItem({ ...newItem, amount: text })}
            keyboardType="numeric"
            style={styles.input}
          />
          <Select
            label="Paid by"
            placeholder="Select payer"
            value={newItem.payer || null}
            onChange={(value) => setNewItem({ ...newItem, payer: value })}
            options={members.map((member) => ({ label: member, value: member }))}
          />
          <TouchableOpacity style={styles.actionButton} onPress={addItem}>
            <Text style={styles.actionButtonText}>Add Item</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.cancelButton]}
            onPress={() => setIsAdding(false)}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => setIsAdding(true)}
        >
          <Text style={styles.actionButtonText}>Add Item</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: "#fff",
  },
  header: {
    flexDirection: "row", // Aligns items horizontally
    alignItems: "center", // Centers the items vertically
    marginBottom: 16, // Optional margin if you need spacing
  },
  deleteGroupButton: {
    position: "absolute",
    top: 3,
    right: 10,
  },
  groupName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  total: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
    color: "#333",
  },
  settledText: {
    fontSize: 14,
    color: "green",
    marginBottom: 12,
  },
  buttonsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  button: {
    width: "48%",
  },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 10,
    marginVertical: 6,
    backgroundColor: "#f9f9f9",
    borderRadius: 6,
  },
  itemText: {
    fontSize: 14,
    color: "#333",
  },
  createdDate: {
    fontSize: 10,
    color: "#888",
  },
  deleted: {
    textDecorationLine: "line-through",
    color: "red",
  },
  deleteButton: {
    padding: 0,
    backgroundColor: "#fff",
  },
  addItem: {
    marginTop: 16,
  },
  input: {
    height: 40,
    color: "#000",
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    paddingHorizontal: 1,
    marginBottom: 8,
    fontSize: 12,
    textAlign: "center",
  },
  pickerContainer: {
    marginBottom: 0,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    fontSize: 12,
  },
  picker: {
    height: 55,
    paddingHorizontal: 1,
    fontSize: 12,
  },
  actionButton: {
    backgroundColor: "#007BFf",
    paddingVertical: 8,
    borderRadius: 6,
    marginTop: 8,
    alignItems: "center",
  },
  actionButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "bold",
  },
  cancelButton: {
    backgroundColor: "#ccc",
  },
  cancelButtonText: {
    color: "#333",
  },
});
