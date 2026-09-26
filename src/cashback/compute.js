// Cashback is derived from a group's transactions every time, never
// accumulated. Transactions are applied in date order, so edits, moves,
// deletions, and late arrivals all produce the same result.

export const ROUNDING = {
  PER_TRANSACTION_FLOOR: "per-transaction-floor",
  CYCLE_TOTAL_FLOOR: "cycle-total-floor",
  NONE: "none",
};

const num = (v) => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

// A cap of null/undefined/""/0 means "no cap", matching the legacy screens.
export const capValue = (v) => {
  const n = typeof v === "number" ? v : parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

const round2 = (n) => Math.round(n * 100) / 100;

export const sortTransactions = (transactions) =>
  [...(transactions || [])].sort((a, b) => {
    const ta = a.occurredAt || "";
    const tb = b.occurredAt || "";
    if (ta !== tb) return ta < tb ? -1 : 1;
    return String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0;
  });

export const computeCycle = (group) => {
  const rounding = group.rounding || ROUNDING.PER_TRANSACTION_FLOOR;
  const rewardValue = group.rewardValue == null ? 1 : num(group.rewardValue);
  const categories = new Map((group.categories || []).map((c) => [c.id, c]));
  const pools = group.capPools || [];
  const groupCap = capValue(group.groupCap);

  const usedByCategory = {};
  const spentByCategory = {};
  const usedByPool = {};
  let usedGroup = 0;
  let totalSpent = 0;
  const perTransaction = {};

  for (const tx of sortTransactions(group.transactions)) {
    const amount = num(tx.amount);
    const category = categories.get(tx.categoryId);
    const catId = category ? category.id : null;
    totalSpent += amount;
    if (catId) spentByCategory[catId] = (spentByCategory[catId] || 0) + amount;

    const rate = category && !category.excluded ? num(category.percentage) : 0;
    let raw = (amount * rate * rewardValue) / 100;
    if (rounding === ROUNDING.PER_TRANSACTION_FLOOR) {
      raw = raw >= 0 ? Math.floor(raw) : -Math.floor(-raw);
    }

    const txPools = catId ? pools.filter((p) => p.categoryIds.includes(catId)) : [];
    const catUsed = catId ? usedByCategory[catId] || 0 : 0;
    let cashback;

    if (raw >= 0) {
      cashback = raw;
      const catCap = category ? capValue(category.cap) : null;
      if (catCap != null) cashback = Math.min(cashback, catCap - catUsed);
      for (const p of txPools) {
        const cap = capValue(p.cap);
        if (cap != null) cashback = Math.min(cashback, cap - (usedByPool[p.id] || 0));
      }
      if (groupCap != null) cashback = Math.min(cashback, groupCap - usedGroup);
      cashback = Math.max(0, cashback);
    } else {
      // Refund: claw back at most what this category has earned so far.
      cashback = Math.max(raw, -catUsed);
    }

    if (catId) usedByCategory[catId] = catUsed + cashback;
    for (const p of txPools) {
      usedByPool[p.id] = Math.max(0, (usedByPool[p.id] || 0) + cashback);
    }
    usedGroup = Math.max(0, usedGroup + cashback);

    perTransaction[tx.id] = {
      cashback: round2(cashback),
      uncapped: round2(raw),
      capped: raw > 0 && cashback < raw,
      rateUnknown: Boolean(
        category && !category.excluded && (category.percentage === null || category.percentage === "")
      ),
    };
  }

  const sum = Object.values(perTransaction).reduce((s, t) => s + t.cashback, 0);
  const total =
    rounding === ROUNDING.CYCLE_TOTAL_FLOOR ? Math.floor(sum) : round2(sum);

  const byCategory = {};
  for (const c of group.categories || []) {
    const used = round2(usedByCategory[c.id] || 0);
    const cap = capValue(c.cap);
    byCategory[c.id] = {
      cashback: used,
      spent: round2(spentByCategory[c.id] || 0),
      cap,
      remaining: cap == null ? null : round2(Math.max(0, cap - used)),
    };
  }
  const byCapPool = {};
  for (const p of pools) {
    const used = round2(usedByPool[p.id] || 0);
    const cap = capValue(p.cap);
    byCapPool[p.id] = {
      cashback: used,
      cap,
      remaining: cap == null ? null : round2(Math.max(0, cap - used)),
    };
  }

  return {
    perTransaction,
    byCategory,
    byCapPool,
    total: Math.max(0, total),
    totalSpent: round2(totalSpent),
    groupRemaining: groupCap == null ? null : round2(Math.max(0, groupCap - usedGroup)),
  };
};

// Returns a copy of the group with cached totals written back. The caches
// exist only so list screens can render without recomputing.
export const withComputed = (group) => {
  const result = computeCycle(group);
  return {
    ...group,
    transactions: (group.transactions || []).map((tx) => ({
      ...tx,
      cashback: result.perTransaction[tx.id]?.cashback ?? 0,
    })),
    categories: (group.categories || []).map((c) => ({
      ...c,
      totalCashback: result.byCategory[c.id]?.cashback ?? 0,
      totalSpent: result.byCategory[c.id]?.spent ?? 0,
    })),
    totalCashback: result.total,
    totalSpent: result.totalSpent,
  };
};

// Cashback a new transaction would earn if added to the group now, plus the
// caps remaining after it.
export const previewCashback = (group, tx) => {
  const probe = { id: "__preview__", ...tx };
  const result = computeCycle({
    ...group,
    transactions: [...(group.transactions || []), probe],
  });
  return {
    cashback: result.perTransaction[probe.id]?.cashback ?? 0,
    capped: result.perTransaction[probe.id]?.capped ?? false,
    categoryRemaining: result.byCategory[tx.categoryId]?.remaining ?? null,
    groupRemaining: result.groupRemaining,
    pools: (group.capPools || [])
      .filter((p) => p.categoryIds.includes(tx.categoryId))
      .map((p) => ({ name: p.name, remaining: result.byCapPool[p.id].remaining })),
  };
};
