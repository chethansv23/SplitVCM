import { useState } from "react";
import { Alert, ScrollView, Text, View } from "react-native";

import { Banner, Btn, Field, Select, ui } from "../../components/cashback/ui";
import { parseEditableDateTime, toEditableDateTime } from "../../src/cashback/dates";
import { deleteTransaction, isOutsideCycle, moveTransaction } from "../../src/cashback/groups";
import { updateState, useCashbackState } from "../../src/cashback/store";

// Edit merchant/amount/date/card label/category, or move the transaction to
// another cycle group. Both groups are recomputed on save.
export default function TransactionEditor({ route, navigation }) {
  const { groupId, txId } = route.params;
  const state = useCashbackState();
  const group = state?.groups.find((g) => g.id === groupId);
  const tx = group?.transactions.find((t) => t.id === txId);

  const [name, setName] = useState(tx?.name || "");
  const [amount, setAmount] = useState(tx ? String(tx.amount) : "");
  const [when, setWhen] = useState(toEditableDateTime(tx?.occurredAt));
  const [cardLabel, setCardLabel] = useState(tx?.cardLabel || "");
  const [targetGroupId, setTargetGroupId] = useState(groupId);
  const [categoryId, setCategoryId] = useState(tx?.categoryId || null);

  if (!state) return <Text style={ui.empty}>Loading…</Text>;
  if (!tx) return <Text style={ui.empty}>This transaction no longer exists.</Text>;

  const target = state.groups.find((g) => g.id === targetGroupId) || group;
  const categoryValid = target.categories.some((c) => c.id === categoryId);
  const occurredAt = parseEditableDateTime(when);
  const source = tx.sourceCandidateId && state.candidates.find((c) => c.id === tx.sourceCandidateId);

  const save = async () => {
    if (amount === "" || isNaN(amount)) return Alert.alert("Enter an amount");
    if (!occurredAt) return Alert.alert("Enter the date as YYYY-MM-DD HH:mm");
    if (!categoryValid) return Alert.alert("Choose a category in the selected group");
    const doSave = async () => {
      await updateState((s) => ({
        ...s,
        groups: moveTransaction(s.groups, groupId, txId, targetGroupId, categoryId, {
          name, amount: parseFloat(amount), occurredAt, cardLabel,
        }),
      }));
      navigation.goBack();
    };
    if (isOutsideCycle(target, occurredAt)) {
      Alert.alert(
        "Outside the cycle",
        `This date is outside ${target.name}. Save it there anyway?`,
        [{ text: "Cancel", style: "cancel" }, { text: "Save anyway", onPress: doSave }]
      );
    } else {
      await doSave();
    }
  };

  const remove = () =>
    Alert.alert("Delete transaction", "Delete this transaction?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          navigation.goBack();
          await updateState((s) => ({ ...s, groups: deleteTransaction(s.groups, groupId, txId) }));
        },
      },
    ]);

  return (
    <ScrollView contentContainerStyle={ui.scroll} keyboardShouldPersistTaps="handled">
      <Field label="Merchant / name" value={name} onChangeText={setName} />
      <Field label="Amount (negative for a refund)" value={amount} onChangeText={setAmount} keyboardType="numbers-and-punctuation" />
      <Field label="Date & time (YYYY-MM-DD HH:mm)" value={when} onChangeText={setWhen} />
      <Field label="Card label" value={cardLabel} onChangeText={setCardLabel} placeholder="e.g. •••• 1234" />

      <Select
        label="Cashback group"
        value={targetGroupId}
        onChange={(v) => {
          setTargetGroupId(v || groupId);
          const g = state.groups.find((x) => x.id === v);
          // Keep the same category when the destination has it (cycles of one card).
          if (g && !g.categories.some((c) => c.id === categoryId)) setCategoryId(null);
        }}
        options={state.groups.map((g) => ({
          value: g.id,
          label: `${g.name}${g.status === "closed" ? " (closed)" : ""}`,
        }))}
      />
      <Select
        label="Category"
        value={categoryValid ? categoryId : null}
        onChange={setCategoryId}
        options={target.categories.map((c) => ({
          value: c.id,
          label: `${c.name}${c.excluded ? "" : c.percentage == null ? " (rate not set)" : ` (${c.percentage}%)`}`,
        }))}
      />

      {occurredAt && isOutsideCycle(target, occurredAt) ? (
        <Banner kind="warning">The date is outside the selected group's cycle.</Banner>
      ) : null}

      <View style={[ui.card, { marginTop: 14 }]}>
        <Text style={ui.small}>
          Added: {tx.assignmentMode || "manual"}
          {tx.assignmentRuleId ? ` · rule ${tx.assignmentRuleId}` : ""}
          {tx.refundOf ? " · refund" : ""}
        </Text>
        {source ? (
          <>
            <Text style={ui.small}>Source: {source.source} ({source.sourceApp || "pasted"})</Text>
            {source.rawText ? <Text style={ui.raw}>{source.rawText}</Text> : <Text style={ui.small}>Original text deleted by retention.</Text>}
          </>
        ) : null}
      </View>

      <Btn title={targetGroupId !== groupId ? "Move & save" : "Save"} onPress={save} />
      <Btn title="Delete transaction" kind="danger" onPress={remove} />
    </ScrollView>
  );
}
