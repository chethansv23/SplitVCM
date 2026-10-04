import { useState } from "react";
import { Text, View } from "react-native";

import { cashbackFor, describeMethod, fromRoundOff, previewCashback, ROUNDING, toRoundOff } from "../../src/cashback/compute";
import { RoundOffInputs } from "./CalculationMethodFields";
import { Chips, Field, money, ui } from "./ui";

const rateOf = (c) => (c && !c.excluded && c.percentage != null ? String(c.percentage) : "0");

// "What would I earn?" Every input is editable: the amount, the rate (filled
// in from a category), and the round-off (filled in from the group: none, or
// per ₹1 / ₹100 / ₹150 …). Shows the cashback, and the caps left when a
// category is chosen. Nothing is saved.
export default function CashbackCalculator({ group }) {
  const categories = group.categories.filter((c) => c.active !== false);
  const start = categories.find((c) => c.isDefault) || categories.find((c) => !c.excluded) || null;
  const [amount, setAmount] = useState("");
  const [categoryId, setCategoryId] = useState(start?.id ?? null);
  const [rate, setRate] = useState(rateOf(start));
  const [roundOffForm, setRoundOffForm] = useState(() => {
    const r = toRoundOff(group.rounding || ROUNDING.PER_TRANSACTION_FLOOR, group.blockSize);
    return { roundOff: r.roundOff, per: String(r.per) };
  });
  const method = fromRoundOff(roundOffForm.roundOff, roundOffForm.per);

  const pickCategory = (id) => {
    setCategoryId(id);
    setRate(rateOf(group.categories.find((c) => c.id === id)));
  };

  const spend = parseFloat(amount);
  const ratePercent = parseFloat(rate);
  const ready = spend > 0 && Number.isFinite(ratePercent) && ratePercent >= 0 && Boolean(method);
  const described = method ? describeMethod(method.rounding, method.blockSize) : null;
  const plain = ready ? cashbackFor(spend, ratePercent, method.rounding, group.rewardValue ?? 1, method.blockSize) : null;

  // With a category, also apply this group's caps, using the edited rate and
  // method, as if the spend were added now.
  const category = group.categories.find((c) => c.id === categoryId);
  const withCaps =
    ready && category
      ? previewCashback(
          {
            ...group,
            rounding: method.rounding,
            blockSize: method.blockSize,
            categories: group.categories.map((c) =>
              c.id === categoryId ? { ...c, percentage: ratePercent, excluded: false } : c
            ),
          },
          { amount: spend, categoryId, occurredAt: new Date().toISOString() }
        )
      : null;

  return (
    <View style={[ui.card, { marginTop: 10 }]}>
      <Text style={ui.strong}>Cashback calculator</Text>
      <Text style={ui.small}>Change any value to try it out. Nothing is saved.</Text>
      <Field
        label="Spend amount (₹)"
        value={amount}
        onChangeText={(t) => setAmount(t.replace(/[^\d.]/g, ""))}
        placeholder="e.g. 320"
        keyboardType="numeric"
      />
      <Text style={[ui.strong, { marginTop: 10 }]}>Category (fills in the rate)</Text>
      <Chips
        value={categoryId}
        onChange={pickCategory}
        options={categories.map((c) => ({
          value: c.id,
          label: `${c.name}${c.excluded ? "" : c.percentage == null ? " (rate not set)" : ` (${c.percentage}%)`}`,
        }))}
      />
      <Field
        label="Cashback rate (%)"
        value={rate}
        onChangeText={(t) => setRate(t.replace(/[^\d.]/g, ""))}
        placeholder="e.g. 10"
        keyboardType="numeric"
      />
      <Text style={[ui.strong, { marginTop: 10 }]}>Round-off</Text>
      <RoundOffInputs form={roundOffForm} onChange={setRoundOffForm} />

      {ready ? (
        <View style={{ marginTop: 10 }}>
          <Text style={[ui.title, { color: "#28A745" }]} accessibilityLabel="Calculated cashback">
            {money(withCaps ? withCaps.cashback : plain)}
          </Text>
          <Text style={ui.small}>
            {ratePercent}% of ₹{spend}, {described.label.toLowerCase().replace("round off", "rounded off")}
            {withCaps && withCaps.cashback < plain ? ` = ${money(plain)} before caps` : ""}
          </Text>
          {withCaps ? (
            <Text style={ui.small}>
              Category cap left after this: {withCaps.categoryRemaining == null ? "no cap" : money(withCaps.categoryRemaining)} ·
              cycle cap left: {withCaps.groupRemaining == null ? "no cap" : money(withCaps.groupRemaining)}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text style={[ui.small, { marginTop: 10 }]}>Enter an amount, a rate and a round-off value to see the cashback.</Text>
      )}
    </View>
  );
}
