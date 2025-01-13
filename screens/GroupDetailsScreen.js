import AsyncStorage from "@react-native-async-storage/async-storage";
import { Picker } from "@react-native-picker/picker";
import React, { useEffect, useState } from "react";
import {
  Alert,
  Button,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

export default function GroupDetailsScreen({ route, navigation }) {
  const { group } = route.params;
  console.log(group);
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
    setItems([...items, { ...newItem, deleted: false }]);
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
    try {
      // Fetch stored groups
      const storedGroupsString = await AsyncStorage.getItem("groups");
      const storedGroups = JSON.parse(storedGroupsString) || [];
      console.log("Stored Groups before deletion:", storedGroups);

      // Filter out the group to be deleted
      const updatedGroups = storedGroups.filter(
        (g) => g.name.trim().toLowerCase() !== group.name.trim().toLowerCase()
      );
      console.log("Updated Groups after deletion:", updatedGroups);

      // Save updated groups back to AsyncStorage
      await AsyncStorage.setItem("groups", JSON.stringify(updatedGroups));

      // Alert user and navigate back
      Alert.alert("Group Deleted", "The group has been successfully deleted.");
      navigation.goBack();
    } catch (error) {
      console.error("Failed to delete group:", error);
      Alert.alert("Error", "An error occurred while deleting the group.");
    }
  };

  const calculateTotals = () => {
    let total = 0;
    const paidBy = {};
    items.forEach((item) => {
      if (!item.deleted) {
        const amount = parseFloat(item.amount);
        total += amount;
        paidBy[item.payer] = (paidBy[item.payer] || 0) + amount;
      }
    });
    return { total, paidBy };
  };

  const settleGroup = () => {
    const { total, paidBy } = calculateTotals();
    const perPerson = total / group.members.length;
    const balances = group.members.map((member) => ({
      member,
      balance: (paidBy[member] || 0) - perPerson,
    }));
    const settlements = [];
    const creditors = balances.filter((b) => b.balance > 0);
    const debtors = balances.filter((b) => b.balance < 0);

    while (debtors.length && creditors.length) {
      const debtor = debtors[0];
      const creditor = creditors[0];
      const settleAmount = Math.min(-debtor.balance, creditor.balance);
      settlements.push({
        from: debtor.member,
        to: creditor.member,
        amount: settleAmount.toFixed(2),
      });
      debtor.balance += settleAmount;
      creditor.balance -= settleAmount;
      if (debtor.balance === 0) debtors.shift();
      if (creditor.balance === 0) creditors.shift();
    }

    Alert.alert(
      "Settlements",
      JSON.stringify(settlements, null, 2),
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

  const { total, paidBy } = calculateTotals();

  return (
    <View style={styles.container}>
      <Text style={styles.total}>Total: ₹{total.toFixed(2)}</Text>
      {isSettled && <Text style={styles.settledText}>Group Settled</Text>}
      <Button
        title="Details"
        onPress={() => Alert.alert("Details", JSON.stringify(paidBy, null, 2))}
      />
      <FlatList
        data={items}
        keyExtractor={(item, index) => index.toString()}
        renderItem={({ item, index }) => (
          <View style={styles.item}>
            <Text style={item.deleted ? styles.deleted : null}>
              {item.name} - ₹{item.amount} - Paid by {item.payer}
            </Text>
            {!item.deleted && (
              <Button title="Delete" onPress={() => deleteItem(index)} />
            )}
          </View>
        )}
      />
      {isAdding ? (
        <View style={styles.addItem}>
          <TextInput
            placeholder="Item Name"
            value={newItem.name}
            onChangeText={(text) => setNewItem({ ...newItem, name: text })}
            style={styles.input}
          />
          <TextInput
            placeholder="Amount"
            value={newItem.amount}
            onChangeText={(text) => setNewItem({ ...newItem, amount: text })}
            keyboardType="numeric"
            style={styles.input}
          />
          <View style={styles.pickerContainer}>
            <Picker
              selectedValue={newItem.payer}
              onValueChange={(value) =>
                setNewItem({ ...newItem, payer: value })
              }
              style={styles.picker}
            >
              <Picker.Item label="Select Payer" value="" />
              {members.map((member, index) => (
                <Picker.Item key={index} label={member} value={member} />
              ))}
            </Picker>
          </View>
          <Button title="Add Item" onPress={addItem} />
          <Button title="Cancel" onPress={() => setIsAdding(false)} />
        </View>
      ) : (
        <Button title="Add Item" onPress={() => setIsAdding(true)} />
      )}
      <Button title="Settle Group" onPress={settleGroup} />
      <Button title="Delete Group" color="red" onPress={deleteGroup} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  total: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 16,
  },
  settledText: {
    fontSize: 18,
    color: "green",
    marginBottom: 16,
  },
  item: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 8,
    marginVertical: 4,
    backgroundColor: "#f9f9f9",
  },
  deleted: {
    textDecorationLine: "line-through",
    color: "red",
  },
  addItem: {
    marginTop: 16,
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 8,
    marginVertical: 4,
  },
  pickerContainer: {
    marginVertical: 8,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 4,
    overflow: "hidden",
  },
  picker: {
    height: 55,
    width: "100%",
  },
});
