import { toDateKey } from "./dates";

// Normalised merchant key used for keyword and learned-rule matching:
// lowercase letters and digits only, so "Book My Show" == "BOOKMYSHOW".
export const merchantKey = (merchant) =>
  String(merchant || "").toLowerCase().replace(/[^a-z0-9]/g, "");

export const REVIEW_REASONS = {
  "not-debit": "Credit or refund — link it to the original transaction",
  "missing-amount": "Amount could not be read",
  "low-parser-confidence": "Alert text was only partly understood",
  "no-card-match": "No configured card matches this alert",
  "multiple-cards": "More than one card could match",
  "no-open-cycle": "No open cycle group for this card and date",
  "multiple-groups": "More than one open cycle group covers this date",
  "unknown-merchant": "Merchant is not linked to a category yet",
  "ambiguous-category": "Merchant matches more than one category",
  "excluded-category": "Matches an excluded (0%) rule",
  "unknown-rate": "Category rate is not set",
  "possible-duplicate": "Looks like a transaction you already entered",
  "processing-error": "Could not be read automatically — check the original text",
};

export const findCardTemplates = (templates, parsed) => {
  if (parsed.cardLastFour) {
    return templates.filter((t) => t.cardLastFour && t.cardLastFour === parsed.cardLastFour);
  }
  // A UPI alert without a suffix can only be a card spend if it says so.
  if (parsed.channel === "upi" && parsed.accountType === "card") {
    return templates.filter((t) => t.upiEnabled);
  }
  return [];
};

export const findOpenGroups = (groups, templateId, occurredAt) => {
  const key = toDateKey(occurredAt);
  return groups.filter(
    (g) =>
      g.templateId === templateId &&
      g.status !== "closed" &&
      g.cycleStart &&
      key >= g.cycleStart &&
      key <= g.cycleEnd
  );
};

// Category resolution for a merchant within a template/group. A learned rule
// (the user's own decision) wins outright; otherwise keywords must point to
// exactly one active category.
export const matchCategory = (template, categories, merchant) => {
  const key = merchantKey(merchant);
  const defaultCategory = categories.find((c) => c.isDefault && c.active !== false) || null;
  if (!key) return { status: "unknown", category: defaultCategory, ruleId: null };

  const learned = (template?.merchantRules || []).find((r) => r.merchantKey === key);
  if (learned) {
    const category = categories.find((c) => c.id === learned.categoryId);
    if (category) return { status: "matched", category, ruleId: learned.id, learned: true };
  }

  const matches = categories.filter(
    (c) =>
      c.active !== false &&
      (c.keywords || []).some((kw) => {
        const k = merchantKey(kw);
        return k && key.includes(k);
      })
  );
  if (matches.length === 0) return { status: "unknown", category: defaultCategory, ruleId: null };
  if (matches.length > 1) {
    const excluded = matches.find((c) => c.excluded);
    return { status: "ambiguous", category: excluded || matches[0], candidates: matches, ruleId: null };
  }
  return { status: "matched", category: matches[0], ruleId: `keyword:${matches[0].id}` };
};

// A manually entered transaction with the same amount on the same day in the
// same group suggests the user already recorded this spend.
export const findManualDuplicate = (group, parsed) => {
  const day = toDateKey(parsed.occurredAt);
  return (group.transactions || []).find(
    (tx) =>
      !tx.sourceCandidateId &&
      Math.abs(Number(tx.amount) - parsed.amount) < 0.01 &&
      tx.occurredAt &&
      toDateKey(tx.occurredAt) === day
  );
};

// Decide whether a parsed alert can be auto-assigned. Any doubt → review,
// with the best available suggestion attached.
export const decideAssignment = (parsed, { templates, groups }) => {
  const reasons = [];
  const suggestion = { templateId: null, groupId: null, categoryId: null, ruleId: null };

  if (parsed.direction !== "debit") reasons.push("not-debit");
  if (parsed.amount == null || !(parsed.amount > 0)) reasons.push("missing-amount");
  if (parsed.confidence !== "high") reasons.push("low-parser-confidence");

  const cards = findCardTemplates(templates, parsed);
  if (cards.length === 0) reasons.push("no-card-match");
  if (cards.length > 1) reasons.push("multiple-cards");
  const template = cards[0] || null;
  if (!template) return { decision: "review", reasons, suggestion };
  suggestion.templateId = template.id;

  const open = findOpenGroups(groups, template.id, parsed.occurredAt);
  if (open.length === 0) reasons.push("no-open-cycle");
  if (open.length > 1) reasons.push("multiple-groups");
  const group = open[0] || null;
  if (group) suggestion.groupId = group.id;

  const categories = group ? group.categories : template.categories;
  const match = matchCategory(template, categories, parsed.merchant);
  suggestion.categoryId = match.category?.id || null;
  suggestion.ruleId = match.ruleId;
  if (match.status === "unknown") reasons.push("unknown-merchant");
  if (match.status === "ambiguous") {
    reasons.push(match.candidates.some((c) => c.excluded) ? "excluded-category" : "ambiguous-category");
  }
  if (match.status === "matched" && match.category.excluded && !match.learned) {
    reasons.push("excluded-category");
  }
  if (
    match.status === "matched" &&
    !match.category.excluded &&
    (match.category.percentage === null || match.category.percentage === "")
  ) {
    reasons.push("unknown-rate");
  }

  if (group && parsed.amount > 0 && findManualDuplicate(group, parsed)) {
    reasons.push("possible-duplicate");
  }

  return { decision: reasons.length ? "review" : "auto", reasons, suggestion };
};
