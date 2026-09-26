import { capValue, ROUNDING, withComputed } from "./compute";
import { slugify } from "./ids";

export const CURRENT_SCHEMA_VERSION = 1;

// v0 (original app): categories keyed by name, numeric Date.now() ids,
// transactions store `category` (name) and a precomputed `cashback`, and
// `groupCap` may be a string from a TextInput.
export const migrateGroupV0 = (group) => {
  const usedIds = new Set();
  const categories = (group.categories || []).map((c, i) => {
    let id = `cat-${slugify(c.name)}`;
    if (usedIds.has(id)) id = `${id}-${i}`;
    usedIds.add(id);
    return {
      id,
      name: c.name,
      percentage: c.percentage === "" || c.percentage == null ? 0 : Number(c.percentage),
      cap: capValue(c.cap),
      keywords: [],
      mccNotes: "",
      active: true,
      excluded: false,
      isDefault: false,
      totalCashback: 0,
      totalSpent: 0,
    };
  });
  const idByName = new Map(categories.map((c) => [c.name, c.id]));

  const createdAt =
    typeof group.id === "number" ? new Date(group.id).toISOString() : group.createdAt || null;

  const transactions = (group.transactions || []).map((tx) => {
    const { category, cashback, ...rest } = tx;
    return {
      ...rest,
      id: String(tx.id),
      name: tx.name || "",
      amount: Number(tx.amount) || 0,
      categoryId: idByName.get(category) || null,
      occurredAt:
        tx.occurredAt ||
        (typeof tx.id === "number" ? new Date(tx.id).toISOString() : createdAt),
      cardLabel: tx.cardLabel || "",
      sourceCandidateId: null,
      assignmentMode: "manual",
      assignmentRuleId: null,
      refundOf: null,
    };
  });

  return withComputed({
    ...group,
    id: String(group.id),
    name: group.name,
    templateId: null,
    cycleStart: null,
    cycleEnd: null,
    status: "open",
    categories,
    capPools: [],
    groupCap: capValue(group.groupCap),
    rounding: ROUNDING.PER_TRANSACTION_FLOOR,
    rewardValue: 1,
    transactions,
    createdAt,
  });
};

export const migrateGroups = (groups, fromVersion) => {
  if (fromVersion >= CURRENT_SCHEMA_VERSION) return groups;
  return (groups || []).map(migrateGroupV0);
};
