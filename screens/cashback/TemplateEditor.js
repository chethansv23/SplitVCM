import { useState } from "react";
import { Alert, Linking, ScrollView, Text, TouchableOpacity, View } from "react-native";

import { Banner, Btn, Chips, Field, Section, Toggle, ui } from "../../components/cashback/ui";
import { ROUNDING } from "../../src/cashback/compute";
import { newId } from "../../src/cashback/ids";
import { updateState, useCashbackState } from "../../src/cashback/store";
import { applyTemplateToGroup } from "../../src/cashback/templates";

const numOrNull = (v) => (v === "" || v == null || isNaN(v) ? null : parseFloat(v));

export default function TemplateEditor({ route, navigation }) {
  const { templateId } = route.params;
  const state = useCashbackState();
  const t = state?.templates.find((x) => x.id === templateId);

  const [name, setName] = useState(t?.name || "");
  const [lastFour, setLastFour] = useState(t?.cardLastFour || "");
  const [upi, setUpi] = useState(Boolean(t?.upiEnabled));
  const [mode, setMode] = useState(t?.cycle?.mode || "billing-cycle");
  const [startDay, setStartDay] = useState(t?.cycle?.startDay ? String(t.cycle.startDay) : "");
  const [rounding, setRounding] = useState(t?.rounding || ROUNDING.PER_TRANSACTION_FLOOR);
  const [groupCap, setGroupCap] = useState(t?.groupCap == null ? "" : String(t.groupCap));
  const [rewardValue, setRewardValue] = useState(String(t?.rewardValue ?? 1));
  const [poolName, setPoolName] = useState("");
  const [poolCap, setPoolCap] = useState("");

  if (!state) return <Text style={ui.empty}>Loading…</Text>;
  if (!t) return <Text style={ui.empty}>This card no longer exists.</Text>;

  const patch = (fn) =>
    updateState((s) => ({ ...s, templates: s.templates.map((x) => (x.id === templateId ? fn(x) : x)) }));

  const openGroups = state.groups.filter((g) => g.templateId === templateId && g.status !== "closed");

  const save = async () => {
    if (lastFour && !/^\d{4}$/.test(lastFour)) return Alert.alert("Card suffix must be 4 digits");
    const day = parseInt(startDay, 10);
    if (mode === "billing-cycle" && startDay && !(day >= 1 && day <= 31)) {
      return Alert.alert("Start day must be 1–31");
    }
    if (lastFour && state.templates.some((x) => x.id !== templateId && x.cardLastFour === lastFour)) {
      Alert.alert("Duplicate suffix", "Another card uses these digits; alerts for them will go to review.");
    }
    await patch((x) => ({
      ...x,
      name: name.trim() || x.name,
      cardLastFour: lastFour,
      upiEnabled: upi,
      cycle: mode === "calendar-month" ? { mode } : { mode, startDay: startDay ? day : null },
      rounding,
      groupCap: numOrNull(groupCap),
      rewardValue: numOrNull(rewardValue) ?? 1,
    }));
    Alert.alert("Saved", openGroups.length ? "Use \"Apply to open cycles\" to update existing cycle groups." : undefined);
  };

  const applyToOpen = () =>
    Alert.alert(
      "Update open cycles",
      `Copy this card's categories, rates and caps into ${openGroups.length} open cycle group(s)? Cashback is recalculated.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Update",
          onPress: () =>
            updateState((s) => {
              const template = s.templates.find((x) => x.id === templateId);
              return {
                ...s,
                groups: s.groups.map((g) =>
                  g.templateId === templateId && g.status !== "closed" ? applyTemplateToGroup(template, g) : g
                ),
              };
            }),
        },
      ]
    );

  const addPool = () => {
    if (!poolName.trim()) return Alert.alert("Enter a pool name");
    patch((x) => ({
      ...x,
      capPools: [...x.capPools, { id: newId("pool"), name: poolName.trim(), cap: numOrNull(poolCap), categoryIds: [] }],
    }));
    setPoolName("");
    setPoolCap("");
  };

  const togglePoolCategory = (poolId, catId) =>
    patch((x) => ({
      ...x,
      capPools: x.capPools.map((p) =>
        p.id !== poolId
          ? p
          : {
              ...p,
              categoryIds: p.categoryIds.includes(catId)
                ? p.categoryIds.filter((id) => id !== catId)
                : [...p.categoryIds, catId],
            }
      ),
    }));

  const removeCard = () =>
    Alert.alert("Delete card", `Delete ${t.name}? Its cycle groups and transactions are kept.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          navigation.goBack();
          await updateState((s) => ({ ...s, templates: s.templates.filter((x) => x.id !== templateId) }));
        },
      },
    ]);

  const catName = (id) => t.categories.find((c) => c.id === id)?.name || "(deleted)";

  return (
    <ScrollView contentContainerStyle={ui.scroll} keyboardShouldPersistTaps="handled">
      {t.notes ? <Banner>{t.notes}</Banner> : null}
      {Object.keys(t.options || {}).length ? (
        <Text style={ui.small}>
          {Object.entries(t.options).map(([k, v]) => `${k}: ${v}`).join(" · ")} (add the card again to change)
        </Text>
      ) : null}

      <Field label="Card name" value={name} onChangeText={setName} />
      <Field
        label="Last four digits (optional, for automatic matching; stays on this phone)"
        value={lastFour}
        onChangeText={setLastFour}
        keyboardType="number-pad"
        maxLength={4}
      />
      <Toggle
        label="UPI enabled on this card"
        hint="UPI alerts without a card suffix match this card when it is the only UPI card"
        value={upi}
        onValueChange={setUpi}
      />

      <Text style={[ui.strong, { marginTop: 10 }]}>Cycle</Text>
      <Chips
        value={mode}
        onChange={setMode}
        options={[
          { value: "billing-cycle", label: "Billing cycle" },
          { value: "calendar-month", label: "Calendar month" },
        ]}
      />
      {mode === "billing-cycle" && (
        <Field
          label="Start day (e.g. 10 = 10th to 9th of next month)"
          value={startDay}
          onChangeText={setStartDay}
          keyboardType="number-pad"
          maxLength={2}
        />
      )}

      <Text style={[ui.strong, { marginTop: 10 }]}>Rounding</Text>
      <Chips
        value={rounding}
        onChange={setRounding}
        options={[
          { value: ROUNDING.PER_TRANSACTION_FLOOR, label: "Floor each txn" },
          { value: ROUNDING.CYCLE_TOTAL_FLOOR, label: "Floor cycle total" },
          { value: ROUNDING.NONE, label: "No rounding" },
        ]}
      />
      <Field label="Overall cycle cap (₹, blank for none)" value={groupCap} onChangeText={setGroupCap} keyboardType="numeric" />
      <Field label="Reward value (₹ per point; 1 for cashback)" value={rewardValue} onChangeText={setRewardValue} keyboardType="numeric" />

      <Btn title="Save card" onPress={save} />
      {openGroups.length > 0 && (
        <Btn kind="secondary" title={`Apply to ${openGroups.length} open cycle(s)`} onPress={applyToOpen} />
      )}

      <Section
        title="Categories"
        right={<Btn small kind="secondary" title="+ Add" onPress={() => navigation.navigate("CategoryEditor", { target: "template", ownerId: templateId })} />}
      >
        {t.categories.map((c) => (
          <TouchableOpacity
            key={c.id}
            style={ui.card}
            onPress={() => navigation.navigate("CategoryEditor", { target: "template", ownerId: templateId, categoryId: c.id })}
          >
            <Text style={ui.strong}>
              {c.name}
              {c.isDefault ? " · default" : ""}
              {c.active === false ? " · inactive" : ""}
            </Text>
            <Text style={ui.small}>
              {c.excluded ? "0% / excluded" : c.percentage == null ? "Rate not set" : `${c.percentage}%`}
              {c.cap ? ` · cap ₹${c.cap}` : ""}
              {c.keywords?.length ? ` · ${c.keywords.join(", ")}` : ""}
            </Text>
          </TouchableOpacity>
        ))}
      </Section>

      <Section title="Shared cap pools">
        {t.capPools.map((p) => (
          <View key={p.id} style={ui.card}>
            <View style={ui.between}>
              <Text style={ui.strong}>
                {p.name} · {p.cap ? `₹${p.cap}` : "no cap"}
              </Text>
              <Btn
                small
                kind="danger"
                title="Remove"
                onPress={() => patch((x) => ({ ...x, capPools: x.capPools.filter((q) => q.id !== p.id) }))}
              />
            </View>
            <Chips
              value={null}
              onChange={(catId) => togglePoolCategory(p.id, catId)}
              options={t.categories
                .filter((c) => !c.excluded)
                .map((c) => ({ value: c.id, label: `${p.categoryIds.includes(c.id) ? "✓ " : ""}${c.name}` }))}
            />
          </View>
        ))}
        <Field value={poolName} onChangeText={setPoolName} placeholder="Pool name (e.g. Accelerated cap)" />
        <Field value={poolCap} onChangeText={setPoolCap} placeholder="Cap ₹" keyboardType="numeric" style={{ marginTop: 6 }} />
        <Btn small kind="secondary" title="Add pool" onPress={addPool} style={{ marginTop: 6 }} />
      </Section>

      <Section title="Learned merchant rules">
        {t.merchantRules.length === 0 && (
          <Text style={ui.muted}>None yet. Choosing "Remember" in review adds rules here.</Text>
        )}
        {t.merchantRules.map((r) => (
          <View key={r.id} style={[ui.between, { paddingVertical: 6 }]}>
            <Text style={{ flex: 1 }}>
              {r.merchantLabel || r.merchantKey} → {catName(r.categoryId)}
            </Text>
            <Btn
              small
              kind="danger"
              title="Forget"
              onPress={() => patch((x) => ({ ...x, merchantRules: x.merchantRules.filter((q) => q.id !== r.id) }))}
            />
          </View>
        ))}
      </Section>

      <Section title="Terms">
        <Text style={ui.small}>Last verified: {t.lastVerifiedAt || "never"}</Text>
        {t.sourceLinks.map((link) => (
          <Text key={link} style={{ color: "#007BFF", marginTop: 4 }} onPress={() => Linking.openURL(link)} numberOfLines={1}>
            {link}
          </Text>
        ))}
        <Btn
          small
          kind="secondary"
          title="Mark terms verified today"
          style={{ marginTop: 8 }}
          onPress={() => patch((x) => ({ ...x, lastVerifiedAt: new Date().toISOString().slice(0, 10) }))}
        />
      </Section>

      <Btn title="Delete card" kind="danger" onPress={removeCard} style={{ marginTop: 24 }} />
    </ScrollView>
  );
}
