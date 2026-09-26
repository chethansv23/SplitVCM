// Equal-share settlement for an expense group. Amounts are handled in whole
// paise so balances reach exactly zero (floating-point rupees could leave
// 0.0000001 behind and never settle).

const toPaise = (amount) => Math.round((parseFloat(amount) || 0) * 100);

export const calculateTotals = (items) => {
  let total = 0;
  const paidBy = {};
  for (const item of items || []) {
    if (item.deleted) continue;
    const paise = toPaise(item.amount);
    total += paise;
    paidBy[item.payer] = (paidBy[item.payer] || 0) + paise;
  }
  const rupees = {};
  for (const [payer, paise] of Object.entries(paidBy)) rupees[payer] = paise / 100;
  return { total: total / 100, paidBy: rupees };
};

// Returns [{ from, to, amount }] with amount as a "123.45" string. Any
// leftover paisa from an uneven split goes to the first members, so shares
// always add up to the total.
export const calculateSettlements = (members, items) => {
  if (!members || members.length === 0) return [];
  const paid = {};
  let total = 0;
  for (const item of items || []) {
    if (item.deleted) continue;
    const paise = toPaise(item.amount);
    total += paise;
    paid[item.payer] = (paid[item.payer] || 0) + paise;
  }
  const base = Math.floor(total / members.length);
  const remainder = total - base * members.length;
  const balances = members.map((member, i) => ({
    member,
    balance: (paid[member] || 0) - (base + (i < remainder ? 1 : 0)),
  }));

  const creditors = balances.filter((b) => b.balance > 0);
  const debtors = balances.filter((b) => b.balance < 0);
  const settlements = [];
  while (debtors.length && creditors.length) {
    const debtor = debtors[0];
    const creditor = creditors[0];
    const amount = Math.min(-debtor.balance, creditor.balance);
    settlements.push({ from: debtor.member, to: creditor.member, amount: (amount / 100).toFixed(2) });
    debtor.balance += amount;
    creditor.balance -= amount;
    if (debtor.balance === 0) debtors.shift();
    if (creditor.balance === 0) creditors.shift();
  }
  return settlements;
};

export const formatSettlements = (settlements) =>
  settlements.length === 0
    ? "Everyone is square — nothing to settle."
    : settlements.map((s) => `${s.from} pays ${s.to} ₹${s.amount}`).join("\n");
