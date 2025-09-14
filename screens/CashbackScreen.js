import { FontAwesome5 } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useNavigation } from "@react-navigation/native";
import React, { useEffect, useState } from "react";
import {
  Button,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

export default function CashbackScreen() {
  const navigation = useNavigation();
  const [cashbackGroups, setCashbackGroups] = useState([]);

  useEffect(() => {
    const loadCashbackGroups = async () => {
      try {
        const storedCashbacks = await AsyncStorage.getItem("cashbacks");
        console.log(JSON.stringify(storedCashbacks));
        if (storedCashbacks) setCashbackGroups(JSON.parse(storedCashbacks));
      } catch (err) {
        console.error("Failed to load cashbacks:", err);
      }
    };

    const unsubscribe = navigation.addListener("focus", () => {
      loadCashbackGroups();
    });

    return unsubscribe;
  }, [navigation]);

  return (
    <View style={styles.container}>
      {/* Top Heading */}

      <FlatList
        data={cashbackGroups}
        keyExtractor={(item) => item.id.toString()}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={styles.groupItem}
            onPress={() =>
              navigation.navigate("CashbackGroupDetails", { group: item })
            }
          >
            <View style={styles.groupContent}>
              <FontAwesome5 name="coins" size={24} color="#FFD700" />
              <Text style={styles.groupName}>{item.name}</Text>
            </View>
            <Text style={styles.groupTotal}>
              Total Cashback: ₹{item.totalCashback?.toFixed(0) || 0}
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={() => (
          <Text style={styles.emptyText}>No cashback groups found</Text>
        )}
      />
      <Button
        title="Add Cashback Group"
        onPress={() => navigation.navigate("CreateCashbackGroup")}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  headerItem: { flexDirection: "row", alignItems: "center" },
  headerText: { fontSize: 18, fontWeight: "bold", marginLeft: 8 },
  groupItem: {
    padding: 12,
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    marginBottom: 10,
  },
  groupContent: { flexDirection: "row", alignItems: "center" },
  groupName: { fontSize: 16, fontWeight: "bold", marginLeft: 10 },
  groupTotal: { marginTop: 4, color: "#28A745", fontWeight: "bold" },
  emptyText: { textAlign: "center", marginTop: 50, color: "#999" },
});
