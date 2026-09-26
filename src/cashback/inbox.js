import { withComputed } from "./compute";
import { findDuplicateCandidate, fingerprint } from "./dedupe";
import {
  addTransaction,
  ensureExcludedCategory,
  getGroup,
} from "./groups";
import { newId } from "./ids";
import { decideAssignment, merchantKey } from "./matcher";
import { parseNotification } from "./parser";
import { createCycleGroup, findCycleGroup, LEARNED_RULE_SOURCE } from "./templates";
import { cycleForDate } from "./cycles";

// The capture pipeline and review actions operate on one plain state object:
// { groups, templates, candidates, settings }. All functions are pure.

export const DEFAULT_ALLOWED_PACKAGES = [
  "com.google.android.apps.messaging",
  "com.samsung.android.messaging",
  "com.android.mms",
  "com.google.android.gm",
  "com.microsoft.office.outlook",
  "com.snapwork.hdfc",
  "com.csam.icici.bank.imobile",
  "com.axis.mobile",
  "com.phonepe.app",
  "com.myairtelapp",
];

export const DEFAULT_SETTINGS = {
  captureEnabled: false,
  consentAcceptedAt: null,
  allowedPackages: DEFAULT_ALLOWED_PACKAGES,
  includeCashWithdrawals: false,
  includeBankAccountDebits: false,
  duplicateWindowMinutes: 10,
  rawTextRetentionDays: 30,
  candidateRetentionDays: 180,
};

export const PENDING = "pending-review";

const sourceKind = (sourceApp) => {
  if (!sourceApp) return "manual";
  if (/messaging|mms|sms/i.test(sourceApp)) return "sms-notification";
  if (/\.gm$|outlook|mail/i.test(sourceApp)) return "email-notification";
  return "bank-notification";
};

const setCandidate = (state, candidate) => ({
  ...state,
  candidates: state.candidates.map((c) => (c.id === candidate.id ? candidate : c)),
});

// raw: { text, title?, sourceApp?, postedAt? }
export const ingestNotification = (state, raw, now = new Date()) => {
  const settings = { ...DEFAULT_SETTINGS, ...state.settings };
  const parsed = parseNotification({
    ...raw,
    includeCashWithdrawals: settings.includeCashWithdrawals,
    includeBankAccountDebits: settings.includeBankAccountDebits,
  });
  if (parsed.kind === "ignore") {
    return { state, outcome: "ignored", reason: parsed.ignoreReason };
  }

  const duplicate = findDuplicateCandidate(parsed, state.candidates, settings.duplicateWindowMinutes);
  if (duplicate) {
    const merged = {
      ...duplicate,
      duplicateSources: [
        ...(duplicate.duplicateSources || []),
        { sourceApp: raw.sourceApp || null, rawText: raw.text, receivedAt: now.toISOString() },
      ],
    };
    return { state: setCandidate(state, merged), outcome: "duplicate", candidateId: duplicate.id };
  }

  const decision = decideAssignment(parsed, state);
  const candidate = {
    id: newId("cand"),
    fingerprint: fingerprint(parsed, settings.duplicateWindowMinutes),
    source: sourceKind(raw.sourceApp),
    sourceApp: raw.sourceApp || null,
    rawText: [raw.title, raw.text].filter(Boolean).join("\n"),
    receivedAt: now.toISOString(),
    parsed,
    suggestedTemplateId: decision.suggestion.templateId,
    suggestedGroupId: decision.suggestion.groupId,
    suggestedCategoryId: decision.suggestion.categoryId,
    suggestedRuleId: decision.suggestion.ruleId,
    reviewReasons: decision.reasons,
    confidence: decision.decision === "auto" ? "high" : parsed.confidence,
    status: PENDING,
    duplicateSources: [],
    resolvedAt: null,
  };

  let next = { ...state, candidates: [...state.candidates, candidate] };
  if (decision.decision === "auto") {
    next = assignCandidate(next, candidate.id, {
      groupId: decision.suggestion.groupId,
      categoryId: decision.suggestion.categoryId,
      mode: "automatic",
      ruleId: decision.suggestion.ruleId,
    }, now);
    return { state: next, outcome: "assigned", candidateId: candidate.id };
  }
  return { state: next, outcome: "review", candidateId: candidate.id };
};

// The native queue is already cleared when this runs, so an alert that
// cannot be processed is kept for manual review rather than lost.
const unprocessedCandidate = (raw, now) => ({
  id: newId("cand"),
  fingerprint: null,
  source: sourceKind(raw.sourceApp),
  sourceApp: raw.sourceApp || null,
  rawText: [raw.title, raw.text].filter(Boolean).join("\n"),
  receivedAt: now.toISOString(),
  parsed: {
    kind: "debit", direction: "debit", amount: null, merchant: null, cardLastFour: null,
    channel: "card", vpa: null, occurredAt: raw.postedAt || now.toISOString(),
    dateFromText: false, timeFromText: false, confidence: "low",
  },
  suggestedTemplateId: null,
  suggestedGroupId: null,
  suggestedCategoryId: null,
  suggestedRuleId: null,
  reviewReasons: ["processing-error"],
  confidence: "low",
  status: PENDING,
  duplicateSources: [],
  resolvedAt: null,
});

export const ingestMany = (state, raws, now = new Date()) => {
  const summary = { assigned: 0, review: 0, duplicate: 0, ignored: 0 };
  let next = state;
  for (const raw of raws) {
    try {
      const result = ingestNotification(next, raw, now);
      next = result.state;
      summary[result.outcome] += 1;
    } catch (e) {
      console.warn("Could not process a captured alert", e);
      next = { ...next, candidates: [...next.candidates, unprocessedCandidate(raw, now)] };
      summary.review += 1;
    }
  }
  return { state: next, summary };
};

export const pendingCandidates = (state) =>
  state.candidates
    .filter((c) => c.status === PENDING)
    .sort((a, b) => (a.parsed.occurredAt < b.parsed.occurredAt ? 1 : -1));

// ---- review actions ----

// Saves a candidate as a transaction. `overrides` may change merchant,
// amount, or occurredAt ("Edit and add").
export const assignCandidate = (state, candidateId, options, now = new Date()) => {
  const candidate = requireCandidate(state, candidateId);
  const { groupId, categoryId, overrides = {}, mode = "reviewed", ruleId = null, rememberRule = false } = options;
  const group = getGroup(state.groups, groupId);
  if (!group) throw new Error("Choose a cashback group");
  if (!group.categories.some((c) => c.id === categoryId)) throw new Error("Choose a category");

  const merchant = overrides.merchant ?? candidate.parsed.merchant ?? "Unknown merchant";
  const { groups, transaction } = addTransaction(state.groups, groupId, {
    name: merchant,
    amount: overrides.amount ?? candidate.parsed.amount,
    occurredAt: overrides.occurredAt ?? candidate.parsed.occurredAt,
    categoryId,
    cardLabel: candidate.parsed.cardLastFour ? `•••• ${candidate.parsed.cardLastFour}` : "",
    sourceCandidateId: candidate.id,
    assignmentMode: mode,
    assignmentRuleId: ruleId,
  });

  let templates = state.templates;
  if (rememberRule && group.templateId) {
    templates = rememberMerchantRule(templates, group.templateId, merchant, categoryId, now);
  }

  return setCandidate(
    { ...state, groups, templates },
    {
      ...candidate,
      status: mode === "automatic" ? "assigned" : "reviewed",
      assignedGroupId: groupId,
      transactionId: transaction.id,
      resolvedAt: now.toISOString(),
    }
  );
};

export const rememberMerchantRule = (templates, templateId, merchant, categoryId, now = new Date()) => {
  const key = merchantKey(merchant);
  if (!key) return templates;
  return templates.map((t) => {
    if (t.id !== templateId) return t;
    const rules = (t.merchantRules || []).filter((r) => r.merchantKey !== key);
    return {
      ...t,
      merchantRules: [
        ...rules,
        {
          id: newId("rule"),
          merchantKey: key,
          merchantLabel: merchant,
          categoryId,
          source: LEARNED_RULE_SOURCE,
          createdAt: now.toISOString(),
        },
      ],
    };
  });
};

// Records the spend under the group's 0% category.
export const assignNoCashback = (state, candidateId, groupId, now = new Date()) => {
  const group = getGroup(state.groups, groupId);
  if (!group) throw new Error("Choose a cashback group");
  const { group: withExcluded, categoryId } = ensureExcludedCategory(group);
  const groups = state.groups.map((g) => (g.id === groupId ? withExcluded : g));
  return assignCandidate({ ...state, groups }, candidateId, { groupId, categoryId }, now);
};

const requireCandidate = (state, candidateId) => {
  const candidate = state.candidates.find((c) => c.id === candidateId);
  if (!candidate) throw new Error("Candidate not found");
  return candidate;
};

export const ignoreCandidate = (state, candidateId, now = new Date()) => {
  const candidate = requireCandidate(state, candidateId);
  return setCandidate(state, { ...candidate, status: "ignored", resolvedAt: now.toISOString() });
};

// Creates the cycle group that the candidate's date falls in, then
// re-points the suggestion at it.
export const createGroupForCandidate = (state, candidateId, templateId, now = new Date()) => {
  const candidate = requireCandidate(state, candidateId);
  const template = state.templates.find((t) => t.id === templateId);
  if (!template) throw new Error("Card not found");
  const range = cycleForDate(template.cycle, candidate.parsed.occurredAt);
  let group = range && findCycleGroup(state.groups, templateId, range);
  let groups = state.groups;
  if (!group) {
    group = createCycleGroup(template, candidate.parsed.occurredAt, now);
    groups = [...groups, group];
  }
  return {
    state: setCandidate({ ...state, groups }, {
      ...candidate,
      suggestedTemplateId: templateId,
      suggestedGroupId: group.id,
    }),
    groupId: group.id,
  };
};

// Stores a credit as a negative transaction against the original spend.
export const linkRefund = (state, candidateId, groupId, originalTxId, now = new Date()) => {
  const candidate = requireCandidate(state, candidateId);
  const group = getGroup(state.groups, groupId);
  const original = group?.transactions.find((t) => t.id === originalTxId);
  if (!original) throw new Error("Choose the original transaction");
  if (original.amount <= 0) throw new Error("A refund can only be linked to a spend");
  const amount = Math.min(candidate.parsed.amount ?? original.amount, original.amount);
  const { groups, transaction } = addTransaction(state.groups, groupId, {
    name: `Refund: ${original.name}`,
    amount: -amount,
    occurredAt: candidate.parsed.occurredAt,
    categoryId: original.categoryId,
    cardLabel: original.cardLabel,
    sourceCandidateId: candidate.id,
    assignmentMode: "reviewed",
    refundOf: original.id,
  });
  return setCandidate({ ...state, groups }, {
    ...candidate,
    status: "reviewed",
    assignedGroupId: groupId,
    transactionId: transaction.id,
    resolvedAt: now.toISOString(),
  });
};

// ---- retention ----

const DAY = 24 * 60 * 60 * 1000;

// Drops raw text from resolved candidates after `rawTextRetentionDays`, and
// drops resolved candidates entirely after `candidateRetentionDays`.
export const applyRetention = (state, now = new Date()) => {
  const settings = { ...DEFAULT_SETTINGS, ...state.settings };
  const candidates = [];
  let changed = false;
  for (const c of state.candidates) {
    if (c.status === PENDING || !c.resolvedAt) {
      candidates.push(c);
      continue;
    }
    const age = now - new Date(c.resolvedAt);
    if (age > settings.candidateRetentionDays * DAY) {
      changed = true;
      continue;
    }
    const hasText = c.rawText || (c.duplicateSources || []).some((d) => d.rawText);
    if (age > settings.rawTextRetentionDays * DAY && hasText) {
      changed = true;
      candidates.push({
        ...c,
        rawText: null,
        duplicateSources: (c.duplicateSources || []).map((d) => ({ ...d, rawText: null })),
      });
    } else {
      candidates.push(c);
    }
  }
  // Unchanged state keeps its identity, so nothing is re-saved.
  return changed ? { ...state, candidates } : state;
};

export const deleteAllCapturedText = (state) => ({
  ...state,
  candidates: state.candidates.map((c) => ({
    ...c,
    rawText: null,
    duplicateSources: (c.duplicateSources || []).map((d) => ({ ...d, rawText: null })),
  })),
});

// Recompute every group (used after imports and migrations).
export const recomputeAll = (state) => ({ ...state, groups: state.groups.map(withComputed) });
