import { useMemo, useState } from "react";
import { Alert, FlatList, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import Icon from "react-native-vector-icons/EvilIcons";

import { Banner, Btn, Chips, COLORS, Field, money, ui } from "../components/cashback/ui";
import { computeCycle, previewCashback, sortTransactions } from "../src/cashback/compute";
import { formatDateTime, formatRange, parseEditableDateTime, toEditableDateTime } from "../src/cashback/dates";
import { addTransaction, deleteTransaction, isOutsideCycle } from "../src/cashback/groups";
import { updateState, useCashbackState } from "../src/cashback/store";

const MODE_LABEL = { automatic: "auto", reviewed: "reviewed", manual: "manual" };

export default function CashbackGroupDetails({ route, navigation }) {
  const { groupId } = route.params;
  const state = useCashbackState();
  const group = state?.groups.find((g) => g.id === groupId);

  const [isAdding, setIsAdding] = useState(false);
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [when, setWhen] = useState(toEditableDateTime());
  const [categoryId, setCategoryId] = useState(null);

  const result = useMemo(() => (group ? computeCycle(group) : null), [group]);

  if (!state) return <Text style={ui.empty}>Loading…</Text>;
  if (!group) return <Text style={ui.empty}>This group no longer exists.</Text>;

  const activeCategories = group.categories.filter((c) => c.active !== false);
  const selectedCategory = categoryId ?? (activeCategories.find((c) => c.isDefault) || activeCategories[0])?.id;
  const occurredAt = parseEditableDateTime(when);
  const preview =
    isAdding && amount && !isNaN(amount) && selectedCategory
      ? previewCashback(group, { amount: parseFloat(amount), categoryId: selectedCategory, occurredAt: occurredAt || new Date().toISOString() })
      : null;

  const save = async () => {
    if (!amount || isNaN(amount)) return Alert.alert("Enter an amount");
    if (!occurredAt) return Alert.alert("Enter the date as YYYY-MM-DD HH:mm");
    if (!selectedCategory) return Alert.alert("Choose a category");
    const doSave = async () => {
      await updateState((s) => ({
        ...s,
        groups: addTransaction(s.groups, groupId, {
          name, amount: parseFloat(amount), categoryId: selectedCategory, occurredAt,
        }).groups,
      }));
      setName("");
      setAmount("");
      setWhen(toEditableDateTime());
      setIsAdding(false);
    };
    if (isOutsideCycle(group, occurredAt)) {
      Alert.alert("Outside this cycle", "The date is outside this group's cycle. Add it anyway?", [
        { text: "Cancel", style: "cancel" },
        { text: "Add anyway", onPress: doSave },
      ]);
    } else {
      await doSave();
    }
  };

  const confirmDeleteTx = (tx) =>
    Alert.alert("Delete transaction", `Delete "${tx.name || "transaction"}" (${money(tx.amount)})?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => updateState((s) => ({ ...s, groups: deleteTransaction(s.groups, groupId, tx.id) })),
      },
    ]);

  const confirmDeleteGroup = () =>
    Alert.alert("Confirm Deletion", `Delete the group "${group.name}" and its ${group.transactions.length} transactions?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          navigation.goBack();
          await updateState((s) => ({ ...s, groups: s.groups.filter((g) => g.id !== groupId) }));
        },
      },
    ]);

  const toggleClosed = () =>
    updateState((s) => ({
      ...s,
      groups: s.groups.map((g) => (g.id === groupId ? { ...g, status: g.status === "closed" ? "open" : "closed" } : g)),
    }));

  const card = group.templateId ? state.templates.find((t) => t.id === group.templateId) : null;
  const categoryName = (id) => group.categories.find((c) => c.id === id)?.name || "Uncategorised";
  const transactions = sortTransactions(group.transactions).reverse();

  const header = (
    <View>
      <View style={ui.between}>
        <Text style={[ui.title, { flex: 1 }]}>{group.name}</Text>
        <TouchableOpacity onPress={confirmDeleteGroup} accessibilityRole="button" accessibilityLabel="Delete group">
          <Icon name="close" size={30} color={COLORS.danger} />
        </TouchableOpacity>
      </View>
      {group.cycleStart ? (
        <Text style={ui.muted}>
          Cycle {formatRange(group.cycleStart, group.cycleEnd)} · {group.status === "closed" ? "closed" : "open"}
        </Text>
      ) : null}

      <View style={[ui.card, { marginTop: 12, marginBottom: 0 }]}>
        {card ? (
          <>
            <Text style={ui.strong}>
              Card: {card.name}
              {card.cardLastFour ? ` •••• ${card.cardLastFour}` : ""}
            </Text>
            <Text style={ui.small}>
              {card.cardLastFour
                ? "Alerts from this card are added automatically."
                : "Add the card's last four digits so its alerts can be matched."}
            </Text>
            <Btn
              small
              kind="secondary"
              title="Edit card"
              onPress={() => navigation.navigate("TemplateEditor", { templateId: card.id })}
              style={{ alignSelf: "flex-start", marginTop: 8 }}
            />
          </>
        ) : (
          <>
            <Text style={ui.strong}>Not linked to a card</Text>
            <Text style={ui.small}>
              Alerts can't be added here automatically until the group is linked to its card's last four digits.
            </Text>
            <Btn
              small
              title="Track this card automatically"
              onPress={() => navigation.navigate("TrackCard", { groupId })}
              style={{ alignSelf: "flex-start", marginTop: 8 }}
            />
          </>
        )}
      </View>

      <Text style={styles.total}>
        Total Spent: <Text style={{ color: "#a7282e" }}>{money(result.totalSpent)}</Text>
      </Text>
      <Text style={styles.total}>
        Total Cashback: <Text style={{ color: COLORS.success }}>{money(result.total)}</Text>
      </Text>
      <Text style={ui.muted}>
        Group cap: {result.groupRemaining == null ? "none" : `${money(result.groupRemaining)} remaining`}
      </Text>
      {(group.capPools || []).map((p) => (
        <Text key={p.id} style={ui.muted}>
          {p.name}: {result.byCapPool[p.id].remaining == null ? "no cap" : `${money(result.byCapPool[p.id].remaining)} of ${money(p.cap)} remaining`}
        </Text>
      ))}

      <View style={[ui.between, { marginTop: 14 }]}>
        <Text style={ui.strong}>Categories <Text style={ui.small}>(tap to edit or delete)</Text></Text>
        <Btn small kind="secondary" title="+ Category" onPress={() => navigation.navigate("CategoryEditor", { target: "group", ownerId: groupId })} />
      </View>
      {group.categories.map((c) => {
        const r = result.byCategory[c.id];
        return (
          <TouchableOpacity
            key={c.id}
            style={styles.categoryRow}
            onPress={() => navigation.navigate("CategoryEditor", { target: "group", ownerId: groupId, categoryId: c.id })}
          >
            <Text style={[{ flex: 1 }, c.active === false && ui.muted]}>
              {c.name} · {c.excluded ? "0%" : c.percentage == null ? "rate not set" : `${c.percentage}%`}
              {c.active === false ? " · inactive" : ""}
            </Text>
            <Text style={ui.small}>
              {money(r.cashback)}/{r.cap == null ? "∞" : money(r.cap)} · spent {money(r.spent)}
            </Text>
            <Icon name="pencil" size={26} color={COLORS.primary} style={{ marginLeft: 6 }} />
          </TouchableOpacity>
        );
      })}

      <View style={[ui.row, ui.gap, { marginTop: 8 }]}>
        <Btn small kind="secondary" title={group.status === "closed" ? "Reopen group" : "Close group"} onPress={toggleClosed} />
      </View>

      {isAdding ? (
        <View style={[ui.card, { marginTop: 14 }]}>
          <Field value={name} onChangeText={setName} placeholder="Name / merchant" />
          <Field value={amount} onChangeText={setAmount} placeholder="Amount" keyboardType="numeric" style={{ marginTop: 8 }} />
          <Field label="Date & time (YYYY-MM-DD HH:mm)" value={when} onChangeText={setWhen} />
          <Chips
            value={selectedCategory}
            onChange={setCategoryId}
            options={activeCategories.map((c) => {
              const r = result.byCategory[c.id];
              return { value: c.id, label: `${c.name} (${r.cashback}/${r.cap ?? "∞"})` };
            })}
          />
          {preview ? (
            <Text style={ui.muted}>
              Cashback: {money(preview.cashback)}
              {preview.capped ? " (capped)" : ""} · category left{" "}
              {preview.categoryRemaining == null ? "∞" : money(preview.categoryRemaining)}
            </Text>
          ) : null}
          {occurredAt && isOutsideCycle(group, occurredAt) ? (
            <Banner kind="warning">This date is outside the group's cycle.</Banner>
          ) : null}
          <Btn title="Add Item" onPress={save} />
          <Btn title="Cancel" kind="secondary" onPress={() => setIsAdding(false)} />
        </View>
      ) : (
        <Btn title="Add Transaction" onPress={() => setIsAdding(true)} style={{ marginTop: 14 }} />
      )}
      <Text style={[ui.strong, { marginTop: 16, marginBottom: 6 }]}>Transactions</Text>
    </View>
  );

  return (
    <FlatList
      contentContainerStyle={ui.scroll}
      data={transactions}
      keyExtractor={(item) => String(item.id)}
      ListHeaderComponent={header}
      keyboardShouldPersistTaps="handled"
      renderItem={({ item }) => {
        const r = result.perTransaction[item.id];
        return (
          <TouchableOpacity
            style={styles.transactionItem}
            onPress={() => navigation.navigate("TransactionEditor", { groupId, txId: item.id })}
          >
            <View style={{ flex: 1, paddingRight: 10 }}>
              <Text style={ui.strong}>{item.name || "Unnamed"}</Text>
              <Text>{categoryName(item.categoryId)}</Text>
              <Text>
                Amount: {money(item.amount)} · Cashback: {money(r?.cashback)}
                {r?.capped ? " (capped)" : ""}
                {r?.rateUnknown ? " (rate not set)" : ""}
              </Text>
              <Text style={ui.small}>
                {formatDateTime(item.occurredAt)} · {MODE_LABEL[item.assignmentMode] || "manual"}
                {item.refundOf ? " · refund" : ""}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => confirmDeleteTx(item)}
              accessibilityRole="button"
              accessibilityLabel={`Delete ${item.name || "transaction"}`}
            >
              <Icon name="trash" size={25} color={COLORS.danger} />
            </TouchableOpacity>
          </TouchableOpacity>
        );
      }}
      ListEmptyComponent={() => <Text style={ui.empty}>No transactions yet</Text>}
    />
  );
}

const styles = StyleSheet.create({
  total: { fontSize: 18, marginTop: 8, fontWeight: "bold" },
  categoryRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
  },
  transactionItem: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 6,
    padding: 12,
    marginBottom: 10,
    backgroundColor: COLORS.card,
  },
});
