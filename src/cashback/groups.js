import { withComputed } from "./compute";
import { isDateKeyInRange, toDateKey } from "./dates";
import { newId } from "./ids";

// Pure operations on cashback groups. Every operation returns new objects
// with cashback recomputed from scratch.

const replaceGroup = (groups, group) => groups.map((g) => (g.id === group.id ? group : g));

export const getGroup = (groups, id) => groups.find((g) => g.id === id);

const requireGroup = (groups, id) => {
  const group = getGroup(groups, id);
  if (!group) throw new Error("Group not found");
  return group;
};

const requireTransaction = (group, txId) => {
  const tx = group.transactions.find((t) => t.id === txId);
  if (!tx) throw new Error("Transaction not found");
  return tx;
};

export const isOutsideCycle = (group, occurredAt) =>
  Boolean(group.cycleStart && group.cycleEnd && occurredAt) &&
  !isDateKeyInRange(toDateKey(occurredAt), group.cycleStart, group.cycleEnd);

export const makeTransaction = (fields) => ({
  id: newId("tx"),
  name: "",
  amount: 0,
  categoryId: null,
  occurredAt: new Date().toISOString(),
  cardLabel: "",
  sourceCandidateId: null,
  assignmentMode: "manual",
  assignmentRuleId: null,
  refundOf: null,
  ...fields,
  amount: Number(fields.amount),
});

export const addTransaction = (groups, groupId, fields) => {
  const group = requireGroup(groups, groupId);
  if (!Number.isFinite(Number(fields.amount))) throw new Error("Enter a valid amount");
  const tx = makeTransaction(fields);
  const updated = withComputed({ ...group, transactions: [...group.transactions, tx] });
  return { groups: replaceGroup(groups, updated), transaction: tx };
};

export const updateTransaction = (groups, groupId, txId, patch) => {
  const group = requireGroup(groups, groupId);
  requireTransaction(group, txId);
  if (patch.amount !== undefined && !Number.isFinite(Number(patch.amount))) {
    throw new Error("Enter a valid amount");
  }
  const transactions = group.transactions.map((tx) =>
    tx.id === txId
      ? { ...tx, ...patch, ...(patch.amount !== undefined ? { amount: Number(patch.amount) } : {}) }
      : tx
  );
  return replaceGroup(groups, withComputed({ ...group, transactions }));
};

export const deleteTransaction = (groups, groupId, txId) => {
  const group = requireGroup(groups, groupId);
  const transactions = group.transactions.filter((tx) => tx.id !== txId);
  return replaceGroup(groups, withComputed({ ...group, transactions }));
};

// Moves a transaction (optionally editing it) to another group/category.
// Both groups are recomputed, so cap room freed in the source is given back.
export const moveTransaction = (groups, fromGroupId, txId, toGroupId, toCategoryId, patch = {}) => {
  if (fromGroupId === toGroupId) {
    return updateTransaction(groups, fromGroupId, txId, { ...patch, categoryId: toCategoryId });
  }
  const from = requireGroup(groups, fromGroupId);
  const to = requireGroup(groups, toGroupId);
  const tx = requireTransaction(from, txId);
  if (!to.categories.some((c) => c.id === toCategoryId)) {
    throw new Error("Choose a category in the destination group");
  }
  const moved = {
    ...tx,
    ...patch,
    ...(patch.amount !== undefined ? { amount: Number(patch.amount) } : {}),
    categoryId: toCategoryId,
  };
  const newFrom = withComputed({ ...from, transactions: from.transactions.filter((t) => t.id !== txId) });
  const newTo = withComputed({ ...to, transactions: [...to.transactions, moved] });
  return replaceGroup(replaceGroup(groups, newFrom), newTo);
};

// ---- categories ----

export const addCategory = (group, fields) =>
  withComputed({
    ...group,
    categories: [
      ...group.categories,
      {
        id: newId("cat"),
        name: fields.name,
        percentage: fields.percentage === "" || fields.percentage == null ? null : Number(fields.percentage),
        cap: fields.cap === "" || fields.cap == null ? null : Number(fields.cap),
        keywords: fields.keywords || [],
        mccNotes: fields.mccNotes || "",
        active: true,
        excluded: Boolean(fields.excluded),
        isDefault: false,
        totalCashback: 0,
        totalSpent: 0,
      },
    ],
  });

export const updateCategory = (group, categoryId, patch) =>
  withComputed({
    ...group,
    categories: group.categories.map((c) => (c.id === categoryId ? { ...c, ...patch } : c)),
  });

export const categoryTransactionCount = (group, categoryId) =>
  group.transactions.filter((tx) => tx.categoryId === categoryId).length;

// A category can be deleted only when nothing references it.
export const deleteCategory = (group, categoryId) => {
  const count = categoryTransactionCount(group, categoryId);
  if (count > 0) return { ok: false, count, group };
  return {
    ok: true,
    count: 0,
    group: withComputed({
      ...group,
      categories: group.categories.filter((c) => c.id !== categoryId),
      capPools: (group.capPools || []).map((p) => ({
        ...p,
        categoryIds: p.categoryIds.filter((id) => id !== categoryId),
      })),
    }),
  };
};

export const reassignCategory = (group, fromCategoryId, toCategoryId) =>
  withComputed({
    ...group,
    transactions: group.transactions.map((tx) =>
      tx.categoryId === fromCategoryId ? { ...tx, categoryId: toCategoryId } : tx
    ),
  });

// Ensures the group has a 0% / excluded category, creating one if needed.
export const ensureExcludedCategory = (group) => {
  const existing = group.categories.find((c) => c.excluded);
  if (existing) return { group, categoryId: existing.id };
  const id = newId("cat");
  return {
    categoryId: id,
    group: {
      ...group,
      categories: [
        ...group.categories,
        {
          id, name: "0% / excluded", percentage: 0, cap: null, keywords: [], mccNotes: "",
          active: true, excluded: true, isDefault: false, totalCashback: 0, totalSpent: 0,
        },
      ],
    },
  };
};

// Candidates for linking a refund: same amount or larger, same merchant
// preferred, most recent first.
export const findRefundMatches = (groups, parsed) => {
  const out = [];
  for (const g of groups) {
    for (const tx of g.transactions) {
      if (tx.amount <= 0 || tx.refundOf) continue;
      if (parsed.amount != null && tx.amount + 0.01 < parsed.amount) continue;
      const sameMerchant =
        parsed.merchant &&
        tx.name &&
        tx.name.toLowerCase().replace(/[^a-z0-9]/g, "") ===
          parsed.merchant.toLowerCase().replace(/[^a-z0-9]/g, "");
      const sameAmount = parsed.amount != null && Math.abs(tx.amount - parsed.amount) < 0.01;
      out.push({ groupId: g.id, groupName: g.name, tx, score: (sameMerchant ? 2 : 0) + (sameAmount ? 1 : 0) });
    }
  }
  return out
    .sort((a, b) => b.score - a.score || (b.tx.occurredAt || "").localeCompare(a.tx.occurredAt || ""))
    .slice(0, 10);
};
