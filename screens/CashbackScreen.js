import { FontAwesome5 } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { useMemo } from "react";
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { Banner, Btn, COLORS, money, ui } from "../components/cashback/ui";
import { formatRange } from "../src/cashback/dates";
import { pendingCandidates } from "../src/cashback/inbox";
import { useCashbackState } from "../src/cashback/store";
import { cyclesToOffer } from "../src/cashback/templates";

export default function CashbackScreen() {
  const navigation = useNavigation();
  const state = useCashbackState();

  const groups = useMemo(() => {
    if (!state) return [];
    // Open groups first, newest cycle first.
    return [...state.groups].sort((a, b) => {
      if ((a.status === "closed") !== (b.status === "closed")) return a.status === "closed" ? 1 : -1;
      return (b.cycleStart || b.createdAt || "").localeCompare(a.cycleStart || a.createdAt || "");
    });
  }, [state]);

  if (!state) return <Text style={ui.empty}>Loading…</Text>;
  const pending = pendingCandidates(state).length;
  const offers = cyclesToOffer(state.templates, state.groups);

  return (
    <View style={styles.container}>
      <View style={[ui.row, ui.gap, { flexWrap: "wrap" }]}>
        <Btn small title="Cards & cycles" onPress={() => navigation.navigate("CardTemplates")} />
        <Btn
          small
          kind={pending ? "danger" : "secondary"}
          title={`Needs review${pending ? ` (${pending})` : ""}`}
          onPress={() => navigation.navigate("ReviewInbox")}
        />
        <Btn small kind="secondary" title="Settings" onPress={() => navigation.navigate("CaptureSettings")} />
      </View>

      {offers.length > 0 && (
        <TouchableOpacity onPress={() => navigation.navigate("CardTemplates")}>
          <Banner kind="warning">
            New cycle available for {offers.map((o) => o.template.name).join(", ")}. Tap to create it.
          </Banner>
        </TouchableOpacity>
      )}

      <FlatList
        style={{ marginTop: 10 }}
        data={groups}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => (
          <TouchableOpacity
            style={[styles.groupItem, item.status === "closed" && { opacity: 0.6 }]}
            onPress={() => navigation.navigate("CashbackGroupDetails", { groupId: item.id })}
          >
            <View style={styles.groupContent}>
              <FontAwesome5 name="coins" size={24} color="#FFD700" />
              <Text style={styles.groupName}>{item.name}</Text>
            </View>
            {item.cycleStart ? (
              <Text style={ui.small}>
                {formatRange(item.cycleStart, item.cycleEnd)}
                {item.status === "closed" ? " · closed" : ""}
              </Text>
            ) : null}
            <Text style={styles.groupTotal}>
              Total Cashback:{" "}
              <Text style={styles.totalCashback}>{money(item.totalCashback || 0)}</Text>
              {"   "}Spent: <Text style={styles.totalSpent}>{money(item.totalSpent || 0)}</Text>
            </Text>
          </TouchableOpacity>
        )}
        ListEmptyComponent={() => (
          <Text style={ui.empty}>
            No cashback groups yet. Add a card under "Cards & cycles", or create a manual group.
          </Text>
        )}
      />
      <Btn title="Add manual cashback group" onPress={() => navigation.navigate("CreateCashbackGroup")} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  groupItem: {
    padding: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 8,
    marginBottom: 10,
  },
  groupContent: { flexDirection: "row", alignItems: "center" },
  groupName: { fontSize: 16, fontWeight: "bold", marginLeft: 10, flexShrink: 1 },
  groupTotal: { marginTop: 4, fontWeight: "bold" },
  totalCashback: { color: COLORS.success },
  totalSpent: { color: "#a7282e" },
});
