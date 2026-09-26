import { useState } from "react";
import { Alert, FlatList, Text, TouchableOpacity, View } from "react-native";

import { Banner, Btn, Chips, Field, Select, Toggle, money, ui } from "../../components/cashback/ui";
import { previewCashback } from "../../src/cashback/compute";
import { formatDateTime, parseEditableDateTime, toEditableDateTime } from "../../src/cashback/dates";
import { findRefundMatches, isOutsideCycle } from "../../src/cashback/groups";
import {
  assignCandidate,
  assignNoCashback,
  createGroupForCandidate,
  ignoreCandidate,
  linkRefund,
  pendingCandidates,
} from "../../src/cashback/inbox";
import { matchCategory, REVIEW_REASONS } from "../../src/cashback/matcher";
import { updateState, useCashbackState, withResult } from "../../src/cashback/store";

const run = async (fn) => {
  try {
    await fn();
  } catch (e) {
    Alert.alert("Could not save", e.message);
  }
};

function ReviewItem({ candidate, state, onSkip }) {
  const p = candidate.parsed;
  const [groupId, setGroupId] = useState(candidate.suggestedGroupId);
  const [categoryId, setCategoryId] = useState(candidate.suggestedCategoryId);
  const [editing, setEditing] = useState(false);
  const [merchant, setMerchant] = useState(p.merchant || "");
  const [amount, setAmount] = useState(p.amount == null ? "" : String(p.amount));
  const [when, setWhen] = useState(toEditableDateTime(p.occurredAt));
  const [remember, setRemember] = useState(true);
  const [showRaw, setShowRaw] = useState(false);

  const group = state.groups.find((g) => g.id === groupId);
  const template = group && state.templates.find((t) => t.id === group.templateId);
  const categoryValid = group?.categories.some((c) => c.id === categoryId);
  const occurredAt = editing ? parseEditableDateTime(when) : p.occurredAt;
  const amountValue = editing ? parseFloat(amount) : p.amount;
  const isCredit = p.direction === "credit";

  const preview =
    group && categoryValid && amountValue > 0
      ? previewCashback(group, { amount: amountValue, categoryId, occurredAt: occurredAt || p.occurredAt })
      : null;

  const chooseGroup = (id) => {
    setGroupId(id);
    const g = state.groups.find((x) => x.id === id);
    if (!g) return setCategoryId(null);
    if (!g.categories.some((c) => c.id === categoryId)) {
      const t = state.templates.find((x) => x.id === g.templateId);
      setCategoryId(matchCategory(t, g.categories, merchant || p.merchant).category?.id || null);
    }
  };

  const overrides = () => {
    if (!editing) return {};
    if (!(amountValue > 0)) throw new Error("Enter a valid amount");
    if (!occurredAt) throw new Error("Enter the date as YYYY-MM-DD HH:mm");
    return { merchant: merchant.trim() || p.merchant, amount: amountValue, occurredAt };
  };

  const add = () =>
    run(async () => {
      if (!group) throw new Error("Choose a cashback group");
      if (!categoryValid) throw new Error("Choose a category");
      const o = overrides();
      const save = () =>
        run(() =>
          updateState((s) =>
            assignCandidate(s, candidate.id, {
              groupId, categoryId, overrides: o, rememberRule: remember && Boolean(group.templateId),
            })
          )
        );
      if (isOutsideCycle(group, o.occurredAt || p.occurredAt)) {
        Alert.alert("Outside the cycle", "The date is outside this group's cycle. Add it anyway?", [
          { text: "Cancel", style: "cancel" },
          { text: "Add anyway", onPress: save },
        ]);
      } else {
        await save();
      }
    });

  const noCashback = () =>
    run(async () => {
      if (!group) throw new Error("Choose a cashback group");
      await updateState((s) => assignNoCashback(s, candidate.id, groupId));
    });

  const ignore = () =>
    Alert.alert("Ignore", "Remove this from the inbox without recording a transaction?", [
      { text: "Cancel", style: "cancel" },
      { text: "Ignore", onPress: () => run(() => updateState((s) => ignoreCandidate(s, candidate.id))) },
    ]);

  const createGroup = (templateId) =>
    run(async () => {
      const newGroupId = await updateState((s) => {
        const r = createGroupForCandidate(s, candidate.id, templateId);
        return withResult(r.state, r.groupId);
      });
      chooseGroup(newGroupId);
      // The new group is not in `state` until the next render.
      const t = state.templates.find((x) => x.id === templateId);
      setCategoryId(matchCategory(t, t.categories, merchant || p.merchant).category?.id || null);
    });

  const refundMatches = isCredit ? findRefundMatches(state.groups, p) : [];
  const cardTemplates = state.templates.filter(
    (t) => !candidate.suggestedTemplateId || t.id === candidate.suggestedTemplateId
  );

  return (
    <View style={ui.card}>
      <View style={ui.between}>
        <Text style={[ui.title, { flex: 1 }]}>{p.merchant || "Unknown merchant"}</Text>
        <Text style={[ui.title, { color: isCredit ? "#28A745" : "#a7282e" }]}>
          {isCredit ? "+" : ""}
          {p.amount == null ? "₹?" : money(p.amount)}
        </Text>
      </View>
      <Text style={ui.small}>
        {p.cardLastFour ? `•••• ${p.cardLastFour}` : p.vpa ? `UPI ${p.vpa}` : "No card suffix"} ·{" "}
        {formatDateTime(p.occurredAt)}
        {p.dateFromText ? "" : " (notification time)"} · {candidate.source}
      </Text>
      {candidate.duplicateSources?.length ? (
        <Text style={ui.small}>Also seen in {candidate.duplicateSources.length} other alert(s)</Text>
      ) : null}
      {candidate.reviewReasons.map((r) => (
        <Text key={r} style={{ color: "#b8860b", fontSize: 13 }}>• {REVIEW_REASONS[r] || r}</Text>
      ))}
      <TouchableOpacity onPress={() => setShowRaw(!showRaw)}>
        <Text style={{ color: "#007BFF", marginTop: 4 }}>{showRaw ? "Hide" : "Show"} original text</Text>
      </TouchableOpacity>
      {showRaw ? <Text style={ui.raw}>{candidate.rawText || "Original text deleted."}</Text> : null}

      {isCredit ? (
        <>
          <Text style={[ui.strong, { marginTop: 10 }]}>Link refund to original transaction</Text>
          {refundMatches.length === 0 && <Text style={ui.muted}>No matching transactions found.</Text>}
          {refundMatches.map((m) => (
            <View key={m.tx.id} style={[ui.between, { paddingVertical: 4 }]}>
              <Text style={{ flex: 1 }}>
                {m.tx.name} · {money(m.tx.amount)} · {formatDateTime(m.tx.occurredAt)}
                {"\n"}
                <Text style={ui.small}>{m.groupName}</Text>
              </Text>
              <Btn
                small
                title="Link"
                onPress={() => run(() => updateState((s) => linkRefund(s, candidate.id, m.groupId, m.tx.id)))}
              />
            </View>
          ))}
          <View style={[ui.row, ui.gap, { marginTop: 8 }]}>
            <Btn small kind="secondary" title="Skip for now" onPress={onSkip} />
            <Btn small kind="danger" title="Ignore" onPress={ignore} />
          </View>
        </>
      ) : (
        <>
          <Select
            label="Cashback group"
            value={groupId}
            onChange={chooseGroup}
            options={state.groups
              .filter((g) => g.status !== "closed" || g.id === groupId)
              .map((g) => ({ value: g.id, label: g.name }))}
          />
          {!group && cardTemplates.length > 0 && (
            <>
              <Text style={ui.small}>No open cycle yet? Create it for:</Text>
              <Chips
                value={null}
                onChange={createGroup}
                options={cardTemplates.map((t) => ({ value: t.id, label: `+ ${t.name} cycle` }))}
              />
            </>
          )}
          {group && (
            <Select
              label="Category"
              value={categoryValid ? categoryId : null}
              onChange={setCategoryId}
              options={group.categories
                .filter((c) => c.active !== false)
                .map((c) => ({
                  value: c.id,
                  label: `${c.name}${c.excluded ? "" : c.percentage == null ? " (rate not set)" : ` (${c.percentage}%)`}`,
                }))}
            />
          )}
          {preview ? (
            <Text style={[ui.muted, { marginTop: 6 }]}>
              Cashback {money(preview.cashback)}
              {preview.capped ? " (capped)" : ""} · category left{" "}
              {preview.categoryRemaining == null ? "∞" : money(preview.categoryRemaining)} · cycle left{" "}
              {preview.groupRemaining == null ? "∞" : money(preview.groupRemaining)}
              {preview.pools.map((pl) => ` · ${pl.name} left ${pl.remaining == null ? "∞" : money(pl.remaining)}`).join("")}
            </Text>
          ) : null}

          {editing && (
            <>
              <Field label="Merchant" value={merchant} onChangeText={setMerchant} />
              <Field label="Amount" value={amount} onChangeText={setAmount} keyboardType="numeric" />
              <Field label="Date & time (YYYY-MM-DD HH:mm)" value={when} onChangeText={setWhen} />
            </>
          )}
          {template ? (
            <Toggle
              label={`Remember ${merchant || p.merchant || "this merchant"} → this category`}
              hint="Future alerts from this merchant on this card are added automatically"
              value={remember}
              onValueChange={setRemember}
            />
          ) : null}

          <View style={[ui.row, ui.gap, { flexWrap: "wrap", marginTop: 8 }]}>
            <Btn small title={editing ? "Save edited" : "Add"} onPress={add} />
            {!editing && <Btn small kind="secondary" title="Edit and add" onPress={() => setEditing(true)} />}
            <Btn small kind="secondary" title="No cashback" onPress={noCashback} />
            <Btn small kind="secondary" title="Skip for now" onPress={onSkip} />
            <Btn small kind="danger" title="Ignore" onPress={ignore} />
          </View>
        </>
      )}
    </View>
  );
}

export default function ReviewInbox({ navigation }) {
  const state = useCashbackState();
  const [skipped, setSkipped] = useState([]);
  if (!state) return <Text style={ui.empty}>Loading…</Text>;

  const pending = pendingCandidates(state);
  const visible = pending.filter((c) => !skipped.includes(c.id));

  return (
    <FlatList
      contentContainerStyle={ui.scroll}
      data={visible}
      keyExtractor={(c) => c.id}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <>
          {skipped.length > 0 && (
            <Banner>
              {skipped.length} skipped item(s) stay in the inbox.{" "}
              <Text style={{ fontWeight: "bold" }} onPress={() => setSkipped([])}>Show again</Text>
            </Banner>
          )}
          <Btn small kind="secondary" title="Paste an alert to test" onPress={() => navigation.navigate("CaptureSettings")} style={{ alignSelf: "flex-start", marginBottom: 10 }} />
        </>
      }
      renderItem={({ item }) => (
        <ReviewItem candidate={item} state={state} onSkip={() => setSkipped((s) => [...s, item.id])} />
      )}
      ListEmptyComponent={() => (
        <Text style={ui.empty}>{pending.length ? "All remaining items are skipped." : "Nothing to review. 🎉"}</Text>
      )}
    />
  );
}
