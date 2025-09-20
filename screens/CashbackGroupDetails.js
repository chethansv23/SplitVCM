import AsyncStorage from "@react-native-async-storage/async-storage";
import { useState } from "react";
import {
  Button,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export default function CashbackGroupDetails({ route }) {
  const { group, loadCashbackGroups } = route.params;

  const [transactions, setTransactions] = useState(group.transactions || []);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState(group.categories[0]?.name || "");
  const [totalCashback, setTotalCashback] = useState(group.totalCashback);
  console.log("🚀 ~ CashbackGroupDetails ~ totalCashback:", totalCashback);

  const getCashback = (amount, category) => {
    const cat = group.categories.find((c) => c.name === category);
    if (!cat) return 0;

    const pct = parseFloat(cat.percentage) || 0;
    const cap = cat.cap ? parseFloat(cat.cap) : null;
    const catTotalCashback = parseFloat(cat?.totalCashback || "0");
    const groupTotalcashback = parseFloat(group?.totalCashback || "0");
    const groupCap = group.groupCap ? parseFloat(group.groupCap) : null;

    let cashback = Math.floor((parseFloat(amount) * pct) / 100);
    if (cap && cashback + catTotalCashback > cap)
      cashback = cap - catTotalCashback;
    if (groupCap && cashback + groupTotalcashback > groupCap)
      cashback = groupCap - groupTotalcashback;
    const updatedCatgeoris = group.categories.map((g) =>
      g.name === category
        ? { ...g, totalCashback: g.totalCashback + cashback }
        : g
    );
    group.categories = updatedCatgeoris;
    return cashback;
  };

  const saveTransactions = async (updated, currentTotalCashback) => {
    setTransactions(updated);

    const stored = await AsyncStorage.getItem("cashbacks");
    const groups = stored ? JSON.parse(stored) : [];
    const updatedGroups = groups.map((g) =>
      g.id === group.id
        ? { ...g, totalCashback: currentTotalCashback, transactions: updated }
        : g
    );
    await AsyncStorage.setItem("cashbacks", JSON.stringify(updatedGroups));
    setTotalCashback(currentTotalCashback);
    await loadCashbackGroups();
  };

  const addTransaction = async () => {
    if (!amount || isNaN(amount)) return;
    const newTx = {
      id: Date.now(),
      amount: parseFloat(amount),
      category,
      cashback: getCashback(parseFloat(amount) || 0, category),
    };
    await saveTransactions(
      [...transactions, newTx],
      group.totalCashback + newTx.cashback
    );
    setAmount("");
  };

  const deleteTransaction = async (id) => {
    const tan = transactions.find((t) => t.id == id);
    const updated = transactions.filter((tx) => tx.id !== id);
    await saveTransactions(updated, group.totalCashback - tan.cashback);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.header}>{group.name}</Text>
      <Text style={styles.total}>Total Cashback: ₹{totalCashback}</Text>
      <Text style={styles.createdAt}>
        Created On: {new Date(group.id).toLocaleString()}
      </Text>
      <Text style={styles.createdAt}>Cap: {group?.groupCap || "oo"}</Text>

      {/* Add transaction inputs */}
      <TextInput
        value={amount}
        onChangeText={setAmount}
        placeholder="Amount"
        keyboardType="numeric"
        style={styles.input}
      />

      {/* Category picker (basic buttons for each category) */}
      <View style={styles.categoriesRow}>
        {group.categories.map((c) => (
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

      <Button title="Add Transaction" onPress={addTransaction} />

      {/* Transactions list */}
      <FlatList
        data={transactions}
        keyExtractor={(item) => item.id.toString()}
        style={{ marginTop: 20 }}
        renderItem={({ item }) => (
          <View style={styles.transactionItem}>
            <Text style={{ flex: 1 }}>
              {item.category} - ₹{item.amount} → ₹{item.cashback}
            </Text>
            <Text style={{ flex: 1 }}>
              Created At: {new Date(item.id).toLocaleString()}
            </Text>
            <Button
              title="X"
              color="red"
              onPress={() => deleteTransaction(item.id)}
            />
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
  header: { fontSize: 22, fontWeight: "bold" },
  total: { fontSize: 18, marginVertical: 10 },
  createdAt: { fontSize: 16, marginVertical: 10 },
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
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 6,
    padding: 8,
    marginBottom: 8,
  },
  emptyText: {
    textAlign: "center",
    color: "#999",
    marginTop: 30,
  },
});
