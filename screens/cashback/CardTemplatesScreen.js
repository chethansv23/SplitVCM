import { useState } from "react";
import { Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";

import { Banner, Btn, Chips, Field, Section, ui } from "../../components/cashback/ui";
import { cycleForDate, cycleGroupName, isCycleConfigured } from "../../src/cashback/cycles";
import { formatRange } from "../../src/cashback/dates";
import { recheckReview } from "../../src/cashback/capture";
import { newId } from "../../src/cashback/ids";
import { updateState, useCashbackState } from "../../src/cashback/store";
import {
  CATALOGUE,
  blankTemplate,
  buildTemplate,
  createCycleGroup,
  cyclesToOffer,
  findCycleGroup,
  normaliseTemplate,
} from "../../src/cashback/templates";

const cycleText = (cycle) =>
  !isCycleConfigured(cycle)
    ? "Billing-cycle start day not set"
    : cycle.mode === "calendar-month"
    ? "Calendar month"
    : `Billing cycle from day ${cycle.startDay}`;

export default function CardTemplatesScreen({ navigation, route }) {
  const state = useCashbackState();
  // Set when opened from a review item whose card is not set up yet.
  const pendingDigits = route?.params?.cardLastFour || null;
  const [key, setKey] = useState(null);
  const [options, setOptions] = useState({});
  const [customName, setCustomName] = useState("");

  if (!state) return <Text style={ui.empty}>Loading…</Text>;
  const offers = cyclesToOffer(state.templates, state.groups);
  const digitsInUse = pendingDigits && state.templates.some((t) => t.cardLastFour === pendingDigits);
  const suggestDigits = pendingDigits && !digitsInUse ? pendingDigits : "";

  const useDigits = async (template) => {
    await updateState((s) => ({
      ...s,
      templates: s.templates.map((t) => (t.id === template.id ? { ...t, cardLastFour: pendingDigits } : t)),
    }));
    await recheckReview();
  };

  const addFromCatalogue = async () => {
    try {
      const template = { ...buildTemplate(key, options), cardLastFour: suggestDigits };
      await updateState((s) => ({ ...s, templates: [...s.templates, template] }));
      await recheckReview();
      setKey(null);
      setOptions({});
      navigation.navigate("TemplateEditor", { templateId: template.id });
    } catch (e) {
      Alert.alert("Cannot add card", e.message);
    }
  };

  const addCustom = async () => {
    if (!customName.trim()) return Alert.alert("Enter a card name");
    const template = normaliseTemplate({
      id: newId("card"),
      ...blankTemplate(customName.trim()),
      cardLastFour: suggestDigits,
    });
    await updateState((s) => ({ ...s, templates: [...s.templates, template] }));
    setCustomName("");
    navigation.navigate("TemplateEditor", { templateId: template.id });
  };

  const createCycle = async (template, date = new Date()) => {
    try {
      const range = cycleForDate(template.cycle, date);
      const existing = range && findCycleGroup(state.groups, template.id, range);
      if (existing) {
        return navigation.navigate("CashbackGroupDetails", { groupId: existing.id });
      }
      const group = createCycleGroup(template, date);
      await updateState((s) => ({ ...s, groups: [...s.groups, group] }));
      const added = await recheckReview();
      if (added > 0) {
        Alert.alert("Waiting alerts added", `${added} alert(s) from review were added to this cycle.`);
      }
      navigation.navigate("CashbackGroupDetails", { groupId: group.id });
    } catch (e) {
      Alert.alert("Cannot create cycle", e.message);
    }
  };

  const entry = key && CATALOGUE[key];

  return (
    <ScrollView contentContainerStyle={ui.scroll} keyboardShouldPersistTaps="handled">
      {pendingDigits ? (
        <Banner>
          {digitsInUse
            ? `A card ending ${pendingDigits} is set up. Create its current cycle below so its alerts are added automatically.`
            : `An alert came from a card ending ${pendingDigits}. Add that card below, or tap "Use •••• ${pendingDigits}" on an existing card. The digits are filled in for you.`}
        </Banner>
      ) : null}
      {offers.map(({ template, range }) => (
        <Banner key={template.id} kind="warning">
          {template.name}: the previous cycle has ended.{" "}
          <Text style={{ fontWeight: "bold" }} onPress={() => createCycle(template)}>
            Create {formatRange(range.start, range.end)}
          </Text>
        </Banner>
      ))}

      <Section title="Your cards">
        {state.templates.length === 0 && <Text style={ui.muted}>No cards yet — add one below.</Text>}
        {state.templates.map((t) => {
          const range = isCycleConfigured(t.cycle) ? cycleForDate(t.cycle, new Date()) : null;
          const current = range && findCycleGroup(state.groups, t.id, range);
          return (
            <View key={t.id} style={ui.card}>
              <TouchableOpacity onPress={() => navigation.navigate("TemplateEditor", { templateId: t.id })}>
                <Text style={ui.strong}>{t.name}</Text>
                <Text style={ui.small}>
                  {t.cardLastFour ? `•••• ${t.cardLastFour}` : "No card suffix (auto-matching off)"} · {cycleText(t.cycle)}
                </Text>
                {range ? <Text style={ui.small}>Current cycle: {cycleGroupName(t.name, range)}</Text> : null}
              </TouchableOpacity>
              <View style={[ui.row, ui.gap, { marginTop: 8, flexWrap: "wrap" }]}>
                <Btn small kind="secondary" title="Edit" onPress={() => navigation.navigate("TemplateEditor", { templateId: t.id })} />
                {suggestDigits && !t.cardLastFour ? (
                  <Btn small kind="secondary" title={`Use •••• ${pendingDigits}`} onPress={() => useDigits(t)} />
                ) : null}
                <Btn
                  small
                  title={current ? "Open current cycle" : "Create current cycle"}
                  disabled={!range}
                  onPress={() => createCycle(t)}
                />
              </View>
            </View>
          );
        })}
      </Section>

      <Section title="Add a card">
        <Chips
          value={key}
          onChange={(k) => {
            setKey(k);
            setOptions({});
          }}
          options={Object.entries(CATALOGUE).map(([k, v]) => ({ value: k, label: v.name }))}
        />
        {entry?.options.map((opt) => (
          <View key={opt.key}>
            <Text style={[ui.strong, { marginTop: 8 }]}>{opt.label}</Text>
            <Chips
              value={options[opt.key]}
              onChange={(v) => setOptions((o) => ({ ...o, [opt.key]: v }))}
              options={opt.choices.map((c) => ({ value: c, label: c }))}
            />
          </View>
        ))}
        {entry ? <Btn title={`Add ${entry.name}`} onPress={addFromCatalogue} /> : null}

        <Field label="Or a custom card" value={customName} onChangeText={setCustomName} placeholder="Card name" />
        <Btn kind="secondary" title="Add custom card" onPress={addCustom} />
      </Section>
    </ScrollView>
  );
}
