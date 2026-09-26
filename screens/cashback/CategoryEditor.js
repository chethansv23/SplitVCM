import { useState } from "react";
import { Alert, ScrollView, Text } from "react-native";

import { Banner, Btn, Field, Select, Toggle, ui } from "../../components/cashback/ui";
import { withComputed } from "../../src/cashback/compute";
import {
  categoryTransactionCount,
  deleteCategory,
  reassignCategory,
} from "../../src/cashback/groups";
import { newId } from "../../src/cashback/ids";
import { updateState, useCashbackState } from "../../src/cashback/store";
import { deleteTemplateCategory } from "../../src/cashback/templates";

const toNumberOrNull = (v) => (v === "" || v == null || isNaN(v) ? null : parseFloat(v));

// Edits one category of a cycle group (target "group") or of a card
// template (target "template"). Without categoryId it adds a new one.
export default function CategoryEditor({ route, navigation }) {
  const { target, ownerId, categoryId } = route.params;
  const state = useCashbackState();
  const owner =
    target === "group"
      ? state?.groups.find((g) => g.id === ownerId)
      : state?.templates.find((t) => t.id === ownerId);
  const existing = owner?.categories.find((c) => c.id === categoryId);

  const [name, setName] = useState(existing?.name || "");
  const [percentage, setPercentage] = useState(existing?.percentage == null ? "" : String(existing.percentage));
  const [cap, setCap] = useState(existing?.cap == null ? "" : String(existing.cap));
  const [keywords, setKeywords] = useState((existing?.keywords || []).join(", "));
  const [mccNotes, setMccNotes] = useState(existing?.mccNotes || "");
  const [active, setActive] = useState(existing ? existing.active !== false : true);
  const [excluded, setExcluded] = useState(Boolean(existing?.excluded));
  const [isDefault, setIsDefault] = useState(Boolean(existing?.isDefault));
  const [reassignTo, setReassignTo] = useState(null);

  if (!state) return <Text style={ui.empty}>Loading…</Text>;
  if (!owner) return <Text style={ui.empty}>Not found.</Text>;

  const txCount = target === "group" && existing ? categoryTransactionCount(owner, categoryId) : 0;
  const others = owner.categories.filter((c) => c.id !== categoryId);

  const writeOwner = (fn) =>
    updateState((s) =>
      target === "group"
        ? { ...s, groups: s.groups.map((g) => (g.id === ownerId ? withComputed(fn(g)) : g)) }
        : { ...s, templates: s.templates.map((t) => (t.id === ownerId ? fn(t) : t)) }
    );

  const save = async () => {
    if (!name.trim()) return Alert.alert("Enter a name");
    const fields = {
      name: name.trim(),
      percentage: excluded ? 0 : toNumberOrNull(percentage),
      cap: toNumberOrNull(cap),
      keywords: keywords.split(",").map((k) => k.trim()).filter(Boolean),
      mccNotes,
      active,
      excluded,
      isDefault,
    };
    const id = existing?.id || newId("cat");
    const saved = { totalCashback: 0, totalSpent: 0, ...existing, ...fields, id };
    await writeOwner((o) => {
      // Only one default category per owner.
      const others = o.categories.map((c) => (isDefault && c.id !== id ? { ...c, isDefault: false } : c));
      const categories = existing
        ? others.map((c) => (c.id === id ? saved : c))
        : [...others, saved];
      return { ...o, categories };
    });
    navigation.goBack();
  };

  const remove = async () => {
    if (target === "template") {
      await updateState((s) => ({
        ...s,
        templates: s.templates.map((t) => (t.id === ownerId ? deleteTemplateCategory(t, categoryId) : t)),
      }));
      return navigation.goBack();
    }
    if (txCount > 0 && !reassignTo) {
      return Alert.alert("Reassign first", `Choose where to move its ${txCount} transaction(s), or delete them first.`);
    }
    await updateState((s) => ({
      ...s,
      groups: s.groups.map((g) => {
        if (g.id !== ownerId) return g;
        const moved = txCount > 0 ? reassignCategory(g, categoryId, reassignTo) : g;
        const result = deleteCategory(moved, categoryId);
        if (!result.ok) throw new Error("Category still has transactions");
        return result.group;
      }),
    }));
    navigation.goBack();
  };

  return (
    <ScrollView contentContainerStyle={ui.scroll} keyboardShouldPersistTaps="handled">
      <Text style={ui.muted}>{target === "group" ? owner.name : `Card template: ${owner.name}`}</Text>
      <Field label="Name" value={name} onChangeText={setName} />
      {!excluded && (
        <Field
          label="Rate % (leave blank if unknown — spends stay in review)"
          value={percentage}
          onChangeText={setPercentage}
          keyboardType="numeric"
        />
      )}
      <Field label="Cap per cycle (₹, blank for none)" value={cap} onChangeText={setCap} keyboardType="numeric" />
      <Field
        label="Merchant keywords (comma separated)"
        value={keywords}
        onChangeText={setKeywords}
        placeholder="swiggy, zomato"
        autoCapitalize="none"
      />
      <Field label="MCC notes (guidance only)" value={mccNotes} onChangeText={setMccNotes} multiline />
      <Toggle label="Active" value={active} onValueChange={setActive} />
      <Toggle label="0% / excluded" hint="Keeps excluded spends visible without earning cashback" value={excluded} onValueChange={setExcluded} />
      <Toggle label="Default suggestion" hint="Suggested in review when no keyword matches" value={isDefault} onValueChange={setIsDefault} />

      <Btn title="Save category" onPress={save} />

      {existing && (
        <>
          {target === "group" && txCount > 0 ? (
            <>
              <Banner kind="warning">
                {txCount} transaction(s) use this category. Choose another category to move them to before deleting.
              </Banner>
              <Select
                label="Move transactions to"
                value={reassignTo}
                onChange={setReassignTo}
                options={others.map((c) => ({ value: c.id, label: c.name }))}
              />
            </>
          ) : null}
          {target === "template" ? (
            <Text style={ui.small}>Deleting from the card affects new cycles only; existing groups keep this category.</Text>
          ) : null}
          <Btn
            title={txCount > 0 ? "Reassign & delete" : "Delete category"}
            kind="danger"
            onPress={() =>
              Alert.alert("Delete category", `Delete "${existing.name}"?`, [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: remove },
              ])
            }
          />
        </>
      )}
    </ScrollView>
  );
}
