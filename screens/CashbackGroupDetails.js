import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRef, useState } from "react";
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
import Icon from "react-native-vector-icons/EvilIcons";

export default function CashbackGroupDetails({ route, navigation }) {
  const { group, loadCashbackGroups } = route.params;
  const [isAddingTransaction, setIsAddingTransaction] = useState(false);
  const [localGroup, setLocalGroup] = useState(group);
  const [transactions, setTransactions] = useState(group.transactions || []);
  const [amount, setAmount] = useState("");
  const [tranName, setTranName] = useState("");
  const [category, setCategory] = useState(group.categories[0]?.name || "");
  const [totalCashback, setTotalCashback] = useState(group.totalCashback || 0);
  const inputRef = useRef(null);

  const getCashback = (amount, category) => {
    const cat = localGroup.categories.find((c) => c.name === category);
    if (!cat) return 0;

    const pct = parseFloat(cat.percentage) || 0;
    const cap = cat.cap ? parseFloat(cat.cap) : null;
    const catTotalCashback = parseFloat(cat?.totalCashback || "0");
    const groupTotalCashback = parseFloat(localGroup?.totalCashback || "0");
    const groupCap = localGroup.groupCap
      ? parseFloat(localGroup.groupCap)
      : null;

    let cashback = Math.floor((parseFloat(amount) * pct) / 100);

    if (cap && cashback + catTotalCashback > cap)
      cashback = cap - catTotalCashback;
    if (groupCap && cashback + groupTotalCashback > groupCap)
      cashback = groupCap - groupTotalCashback;

    return cashback;
  };

  const saveTransactions = async (
    updated,
    currentTotalCashback,
    updatedCategories
  ) => {
    setTransactions(updated);

    const newGroup = {
      ...localGroup,
      totalCashback: currentTotalCashback > 0 ? currentTotalCashback : 0,
      transactions: updated,
      categories: updatedCategories || localGroup.categories,
    };

    setLocalGroup(newGroup);
    setTotalCashback(newGroup.totalCashback);

    const stored = await AsyncStorage.getItem("cashbacks");
    const groups = stored ? JSON.parse(stored) : [];
    const updatedGroups = groups.map((g) =>
      g.id === newGroup.id ? newGroup : g
    );

    await AsyncStorage.setItem("cashbacks", JSON.stringify(updatedGroups));
    await loadCashbackGroups();
  };

  const addTransaction = async () => {
    if (!amount || isNaN(amount)) return;
    const cashback = getCashback(parseFloat(amount) || 0, category);

    const updatedCategories = localGroup.categories.map((g) =>
      g.name === category
        ? { ...g, totalCashback: g.totalCashback + cashback }
        : g
    );

    const newTx = {
      id: Date.now(),
      name: tranName,
      amount: parseFloat(amount),
      category,
      cashback,
    };

    await saveTransactions(
      [...transactions, newTx],
      localGroup.totalCashback + cashback,
      updatedCategories
    );
    setTranName("");
    setAmount("");
    inputRef.current?.blur();
  };

  const deleteGroup = async (id) => {
    Alert.alert(
      "Confirm Deletion",
      `Are you sure you want to delete the group "${localGroup.name}"?`,
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "OK",
          onPress: async () => {
            try {
              const storedGroupsString = await AsyncStorage.getItem(
                "cashbacks"
              );
              const storedGroups = JSON.parse(storedGroupsString) || [];
              const updatedGroups = storedGroups.filter((g) => g.id != id);
              await AsyncStorage.setItem(
                "cashbacks",
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

  const deleteTransaction = async (id) => {
    const tan = transactions.find((t) => t.id == id);
    const updated = transactions.filter((tx) => tx.id !== id);

    const updatedCategories = localGroup.categories.map((g) =>
      g.name === tan.category
        ? {
            ...g,
            totalCashback:
              g.totalCashback - tan.cashback > 0
                ? g.totalCashback - tan.cashback
                : 0,
          }
        : g
    );

    await saveTransactions(
      updated,
      localGroup.totalCashback - tan.cashback,
      updatedCategories
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {/* Group Name */}
        <Text style={styles.groupName}>{localGroup.name}</Text>
        <TouchableOpacity
          style={styles.deleteGroupButton}
          onPress={() => deleteGroup(localGroup.id)}
        >
          <Icon name="close" size={30} color="#dc3545" />
        </TouchableOpacity>
      </View>

      <Text style={styles.total}>
        Total Cashback: <Text style={styles.totalAmount}>₹{totalCashback}</Text>
      </Text>
      <Text style={styles.createdAt}>
        Created On: {new Date(localGroup.id).toLocaleString()}
      </Text>
      <Text style={styles.createdAt}>Cap: {localGroup?.groupCap || "oo"}</Text>

      {isAddingTransaction ? (
        <View>
          <TextInput
            ref={inputRef}
            value={tranName}
            onChangeText={setTranName}
            placeholder="Name"
            placeholderTextColor="#888"
            style={styles.input}
          />
          <TextInput
            ref={inputRef}
            value={amount}
            onChangeText={setAmount}
            placeholder="Amount"
            placeholderTextColor="#888"
            keyboardType="numeric"
            style={styles.input}
          />

          {/* Category picker */}
          <View style={styles.categoriesRow}>
            {localGroup.categories.map((c) => (
              <TouchableOpacity
                key={c.name}
                onPress={() => setCategory(c.name)}
                style={[
                  styles.categoryButton,
                  category === c.name && styles.selectedCategory,
                ]}
              >
                <Text
                  style={[
                    styles.categoryText,
                    category === c.name && styles.selectedCategoryText,
                  ]}
                >
                  {c.name + "(" + (c?.cap || "oo") + ")"}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <TouchableOpacity
            style={styles.actionButton}
            onPress={async () => {
              await addTransaction();
              setIsAddingTransaction(false);
            }}
          >
            <Text style={styles.actionButtonText}>Add Item</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, styles.cancelButton]}
            onPress={() => {
              setAmount("");
              setIsAddingTransaction(false);
            }}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Button
          title="Add Transaction"
          onPress={() => setIsAddingTransaction(true)}
        />
      )}

      {/* Transactions list */}
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id.toString()}
        style={{ marginTop: 20 }}
        renderItem={({ item }) => (
          <View style={styles.transactionItem}>
            <View style={styles.transactionDetails}>
              <Text style={styles.transactionText}>Name: {item?.name}</Text>
              <Text style={styles.transactionText}>
                Category: {item.category}
              </Text>
              <Text style={styles.transactionText}>Amount: ₹{item.amount}</Text>
              <Text style={styles.transactionText}>
                Cashback: ₹{item.cashback}
              </Text>
              <Text style={styles.transactionText}>
                Created: {new Date(item.id).toLocaleString()}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.deleteButton}
              onPress={() => deleteTransaction(item.id)}
            >
              <Icon name="trash" size={25} color="#dc3545" />
            </TouchableOpacity>
          </View>
        )}
        ListEmptyComponent={() => (
          <Text style={styles.emptyText}>No transactions yet</Text>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  groupName: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#333",
  },
  deleteGroupButton: {
    position: "absolute",
    top: 3,
    right: 10,
  },
  total: {
    fontSize: 18,
    marginVertical: 10,
    fontWeight: "bold",
  },
  totalAmount: {
    color: "#28A745",
    fontWeight: "bold",
  },
  createdAt: { fontSize: 16, marginVertical: 4, color: "#555" },
  deleteButton: {
    padding: 0,
    backgroundColor: "#fff",
  },
  input: {
    borderWidth: 1,
    borderColor: "#ccc",
    padding: 8,
    borderRadius: 6,
    marginBottom: 10,
  },
  categoriesRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 10,
    gap: 8,
  },
  categoryButton: {
    borderWidth: 1,
    borderColor: "#007BFF",
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  selectedCategory: {
    backgroundColor: "#007BFF",
  },
  categoryText: {
    color: "#007BFF",
  },
  selectedCategoryText: {
    color: "#fff",
    fontWeight: "bold",
  },
  transactionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
    backgroundColor: "#f9f9f9",
  },
  transactionDetails: {
    flex: 1,
    paddingRight: 10,
  },
  transactionText: {
    fontSize: 14,
    marginBottom: 2,
  },
  emptyText: {
    textAlign: "center",
    color: "#999",
    marginTop: 30,
  },
  actionButton: {
    backgroundColor: "#007bff",
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
