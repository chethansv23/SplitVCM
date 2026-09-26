import { useState } from "react";
import { Alert, ScrollView, Text } from "react-native";

import CardTrackingFields, { cycleFromFields, EMPTY_TRACKING } from "../../components/cashback/CardTrackingFields";
import { Banner, Btn, ui } from "../../components/cashback/ui";
import { recheckReview } from "../../src/cashback/capture";
import { formatRange } from "../../src/cashback/dates";
import { updateState, useCashbackState, withResult } from "../../src/cashback/store";
import { trackGroupWithCard } from "../../src/cashback/templates";

// Links a manual cashback group to a card so alerts are added automatically.
export default function TrackCardScreen({ route, navigation }) {
  const { groupId } = route.params;
  const state = useCashbackState();
  const group = state?.groups.find((g) => g.id === groupId);
  const [fields, setFields] = useState({
    ...EMPTY_TRACKING,
    digits: route.params.cardLastFour || "",
  });

  if (!state) return <Text style={ui.empty}>Loading…</Text>;
  if (!group) return <Text style={ui.empty}>This group no longer exists.</Text>;

  const start = async () => {
    try {
      const r = await updateState((s) => {
        const out = trackGroupWithCard(s, groupId, { cardLastFour: fields.digits, cycle: cycleFromFields(fields) });
        return withResult(out.state, out);
      });
      const added = await recheckReview();
      const lines = [
        `Alerts from •••• ${fields.digits} dated ${formatRange(r.range.start, r.range.end)} are now added to "${group.name}".`,
        r.outsideCycle ? `${r.outsideCycle} earlier transaction(s) are outside this cycle; they stay in the group.` : null,
        added ? `${added} waiting alert(s) from review were added.` : null,
        "New cycles for this card can be created under Cards & cycles.",
      ].filter(Boolean);
      Alert.alert("Tracking started", lines.join("\n\n"));
      navigation.goBack();
    } catch (e) {
      Alert.alert("Could not start tracking", e.message);
    }
  };

  return (
    <ScrollView contentContainerStyle={ui.scroll} keyboardShouldPersistTaps="handled">
      <Text style={ui.title}>{group.name}</Text>
      <Banner>
        This turns the group into a card with the same categories and caps, and makes it the card's current
        cycle. Your existing transactions stay as they are.
      </Banner>
      <CardTrackingFields value={fields} onChange={setFields} />
      <Btn title="Start tracking" onPress={start} />
    </ScrollView>
  );
}
