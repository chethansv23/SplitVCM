import { useState } from "react";
import { Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";

import { Banner, Btn, Chips, Field, Section, ui } from "../../components/cashback/ui";
import { cycleForDate, cycleGroupName, isCycleConfigured } from "../../src/cashback/cycles";
import { formatRange } from "../../src/cashback/dates";
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

export default function CardTemplatesScreen({ navigation }) {
  const state = useCashbackState();
  const [key, setKey] = useState(null);
  const [options, setOptions] = useState({});
  const [customName, setCustomName] = useState("");

  if (!state) return <Text style={ui.empty}>Loading…</Text>;
  const offers = cyclesToOffer(state.templates, state.groups);

  const addFromCatalogue = async () => {
    try {
      const template = buildTemplate(key, options);
      await updateState((s) => ({ ...s, templates: [...s.templates, template] }));
      setKey(null);
      setOptions({});
      navigation.navigate("TemplateEditor", { templateId: template.id });
    } catch (e) {
      Alert.alert("Cannot add card", e.message);
    }
  };

  const addCustom = async () => {
    if (!customName.trim()) return Alert.alert("Enter a card name");
    const template = normaliseTemplate({ id: newId("card"), ...blankTemplate(customName.trim()) });
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
      navigation.navigate("CashbackGroupDetails", { groupId: group.id });
    } catch (e) {
      Alert.alert("Cannot create cycle", e.message);
    }
  };

  const entry = key && CATALOGUE[key];

  return (
    <ScrollView contentContainerStyle={ui.scroll} keyboardShouldPersistTaps="handled">
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
              <View style={[ui.row, ui.gap, { marginTop: 8 }]}>
                <Btn small kind="secondary" title="Edit" onPress={() => navigation.navigate("TemplateEditor", { templateId: t.id })} />
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
