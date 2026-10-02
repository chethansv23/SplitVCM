// Cashback is derived from a group's transactions every time, never
// accumulated. Transactions are applied in date order, so edits, moves,
// deletions, and late arrivals all produce the same result.

// How a card turns a spend into cashback, e.g. 10% on ₹320:
// - per-transaction-floor (HSBC): floor(320 × 10%) = ₹32
// - per-block-spent (SBI and others): only whole blocks of `blockSize`
//   earn. Blocks of ₹100: 3 × 100 × 10% = ₹30; blocks of ₹150: 2 × 150 ×
//   10% = ₹30; blocks of ₹120: 2 × 120 × 10% = ₹24. The block is editable.
// - cycle-total-floor: exact per spend, the cycle total rounded down
// - none: exact, to the paisa
export const ROUNDING = {
  PER_TRANSACTION_FLOOR: "per-transaction-floor",
  PER_BLOCK_SPENT: "per-block-spent",
  CYCLE_TOTAL_FLOOR: "cycle-total-floor",
  NONE: "none",
};

export const DEFAULT_BLOCK_SIZE = 100;

// Earlier 1.3.0 drafts stored "per-100-spent"; read it as ₹100 blocks.
const normaliseMethod = (rounding, blockSize) =>
  rounding === "per-100-spent"
    ? { rounding: ROUNDING.PER_BLOCK_SPENT, blockSize: 100 }
    : { rounding: rounding || ROUNDING.PER_TRANSACTION_FLOOR, blockSize };

// A usable block size: a positive number, otherwise the ₹100 default.
export const blockSizeOf = (blockSize) => {
  const n = typeof blockSize === "number" ? blockSize : parseFloat(blockSize);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_BLOCK_SIZE;
};

const truncate = (n) => (n >= 0 ? Math.floor(n) : -Math.floor(-n));

// Cashback for one spend before caps. Refunds (negative amounts) mirror it.
export const cashbackFor = (amount, ratePercent, rounding, rewardValue = 1, blockSize = DEFAULT_BLOCK_SIZE) => {
  const method = normaliseMethod(rounding, blockSize);
  const block = blockSizeOf(method.blockSize);
  const base = method.rounding === ROUNDING.PER_BLOCK_SPENT ? truncate(amount / block) * block : amount;
  const raw = (base * ratePercent * rewardValue) / 100;
  if (method.rounding === ROUNDING.PER_TRANSACTION_FLOOR || method.rounding === ROUNDING.PER_BLOCK_SPENT) {
    return truncate(raw);
  }
  // Avoid floating-point noise like 12.499999999.
  return Math.round(raw * 100) / 100;
};

const formatRupees = (n) => (Number.isInteger(n) ? `₹${n}` : `₹${n.toFixed(2)}`);

// The method as words, with a worked example on ₹320 at 10%, so the effect
// of the block size is visible: blocks of 100 → ₹30, 150 → ₹30, 120 → ₹24.
// The "How cashback is calculated" popup has one choice and one value:
// no round-off, or round off per ₹N spent. N = 1 rounds each spend down
// (HSBC); N = 100 counts only whole ₹100 (SBI); any other N works the same way.
export const toRoundOff = (rounding, blockSize) => {
  const method = normaliseMethod(rounding, blockSize);
  if (method.rounding === ROUNDING.NONE) return { roundOff: false, per: 1 };
  if (method.rounding === ROUNDING.PER_BLOCK_SPENT) return { roundOff: true, per: blockSizeOf(method.blockSize) };
  return { roundOff: true, per: 1, cycleTotal: method.rounding === ROUNDING.CYCLE_TOTAL_FLOOR };
};

// Returns { rounding, blockSize }, or null when the per-₹ value is invalid.
export const fromRoundOff = (roundOff, per) => {
  if (!roundOff) return { rounding: ROUNDING.NONE, blockSize: DEFAULT_BLOCK_SIZE };
  const n = typeof per === "number" ? per : parseFloat(per);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n === 1
    ? { rounding: ROUNDING.PER_TRANSACTION_FLOOR, blockSize: 1 }
    : { rounding: ROUNDING.PER_BLOCK_SPENT, blockSize: n };
};

// Words and a worked example (10% of ₹325.50) for the current method, so the
// effect of the value is visible: per ₹1 → ₹32, per ₹100 → ₹30,
// per ₹150 → ₹30, per ₹120 → ₹24, no round-off → ₹32.55.
export const describeMethod = (rounding, blockSize) => {
  const method = normaliseMethod(rounding, blockSize);
  const block = blockSizeOf(method.blockSize);
  const example = formatRupees(cashbackFor(325.5, 10, method.rounding, 1, block));
  switch (method.rounding) {
    case ROUNDING.PER_BLOCK_SPENT: {
      const counted = truncate(325.5 / block) * block;
      return { label: `Round off per ₹${block}`, example: `10% of ₹325.50 = ${example} (counts ₹${counted})` };
    }
    case ROUNDING.CYCLE_TOTAL_FLOOR:
      return { label: "Cycle total rounded down", example: "Exact per spend; the cycle total is rounded down" };
    case ROUNDING.NONE:
      return { label: "No round-off", example: `10% of ₹325.50 = ${example}` };
    default:
      return { label: "Round off per ₹1", example: `10% of ₹325.50 = ${example}` };
  }
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
  const { rounding, blockSize } = normaliseMethod(group.rounding, group.blockSize);
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
    const raw = cashbackFor(amount, rate, rounding, rewardValue, blockSize);

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
