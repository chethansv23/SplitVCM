// Negative cases: invalid input, missing records, and things that must NOT
// happen (no auto-assign, no transaction, no merge, no crash).

import { parseBackup } from "../backup";
import { computeCycle } from "../compute";
import { cycleForDate, isCycleConfigured } from "../cycles";
import { isDuplicate } from "../dedupe";
import {
  addTransaction,
  deleteCategory,
  deleteTransaction,
  moveTransaction,
  updateTransaction,
} from "../groups";
import {
  assignCandidate,
  assignNoCashback,
  createGroupForCandidate,
  ignoreCandidate,
  ingestNotification,
  linkRefund,
  pendingCandidates,
} from "../inbox";
import { decideAssignment, matchCategory, merchantKey } from "../matcher";
import { migrateGroupV0 } from "../migration";
import { parseNotification } from "../parser";
import { buildTemplate } from "../templates";
import { hsbcAlert, liveplusState, NOW } from "./helpers";

const parse = (text) => parseNotification({ text, postedAt: NOW.toISOString() });

describe("parser rejects non-transactions", () => {
  test.each([
    ["empty text", ""],
    ["only whitespace", "   \n  "],
    ["unrelated chat message", "Hey, are we meeting at 7 tonight?"],
    ["amount but no transaction word", "Your bill of Rs.500 is generated for Card XX1234."],
    ["delivery update with a price", "Your order worth Rs 499 has been shipped via card courier."],
  ])("%s → ignored, not captured", (_, text) => {
    expect(parse(text).kind).toBe("ignore");
  });

  test("missing text/title fields do not crash", () => {
    expect(parseNotification({}).kind).toBe("ignore");
    expect(parseNotification({ title: null, text: undefined }).kind).toBe("ignore");
  });

  test("a failed card payment is ignored even though it names a merchant and amount", () => {
    expect(parse("Txn of Rs.2,000 at AMAZON on Card XX1234 was not successful.").ignoreReason).toBe("failed");
  });

  test("a reversal is a credit, never a debit", () => {
    expect(parse("Reversal of Rs.100 spent at ZOMATO on Card XX1234 on 01-09-26").direction).toBe("credit");
  });

  test("impossible dates fall back to the notification time", () => {
    const p = parse("Rs.100 spent on Card XX1234 at STORE on 31-02-26");
    expect(p.dateFromText).toBe(false);
    expect(p.confidence).not.toBe("high");
  });

  test("a 3-digit masked number is not taken as a card suffix", () => {
    expect(parse("Rs.100 spent on Card XX123 at STORE on 01-09-26").cardLastFour).toBeNull();
  });
});

describe("no automatic assignment when unsure", () => {
  const { state } = liveplusState();
  const reasonsFor = (text) => decideAssignment(parse(text), state).reasons;

  test("missing amount", () => {
    expect(reasonsFor("Your HSBC Credit Card ending 5678 was used at BIGBASKET on 14 Sep 2026 at 18:05")).toContain("missing-amount");
  });

  test("zero amount", () => {
    expect(reasonsFor("Your HSBC Credit Card ending 5678 has been used for INR 0.00 at BIGBASKET on 14 Sep 2026 at 18:05")).toContain("missing-amount");
  });

  test("card suffix that matches no card, even if the merchant is known", () => {
    const d = decideAssignment(parse(hsbcAlert("BIGBASKET", 899, "14 Sep 2026 at 18:05", "9999").text), state);
    expect(d.decision).toBe("review");
    expect(d.suggestion.groupId).toBeNull();
  });

  test("a card with no suffix set never matches", () => {
    const noSuffix = { ...state, templates: [{ ...state.templates[0], cardLastFour: "" }] };
    expect(decideAssignment(parse(hsbcAlert("BIGBASKET").text), noSuffix).reasons).toContain("no-card-match");
  });

  test("no cards configured at all", () => {
    const d = decideAssignment(parse(hsbcAlert("BIGBASKET").text), { templates: [], groups: [] });
    expect(d).toMatchObject({ decision: "review", reasons: expect.arrayContaining(["no-card-match"]) });
  });

  test("merchant name only partially matching a keyword is not enough (keyword 'uber' vs 'Ube')", () => {
    const t = buildTemplate("hdfc-millennia", {}, NOW);
    expect(matchCategory(t, t.categories, "UBE CAFE").status).toBe("unknown");
  });

  test("empty or symbol-only merchant never matches a rule", () => {
    const t = { ...state.templates[0], merchantRules: [{ id: "r", merchantKey: "", categoryId: "grocery-10" }] };
    expect(merchantKey("***")).toBe("");
    expect(matchCategory(t, t.categories, "***").status).toBe("unknown");
    expect(matchCategory(t, t.categories, null).status).toBe("unknown");
  });

  test("a learned rule pointing at a deleted category is ignored", () => {
    const t = { ...state.templates[0], merchantRules: [{ id: "r", merchantKey: "boutique", categoryId: "gone" }] };
    expect(matchCategory(t, t.categories, "Boutique").status).toBe("unknown");
  });
});

describe("no false duplicates", () => {
  const a = { amount: 100, direction: "debit", cardLastFour: "1234", occurredAt: "2026-09-14T10:00:00Z" };
  test("missing amounts are never duplicates", () => {
    expect(isDuplicate({ ...a, amount: null }, { ...a, amount: null })).toBe(false);
  });
  test("a debit and its refund are not merged", () => {
    expect(isDuplicate(a, { ...a, direction: "credit" })).toBe(false);
  });
  test("₹0.01 difference is a different spend", () => {
    expect(isDuplicate(a, { ...a, amount: 100.01 })).toBe(false);
  });
});

describe("review actions reject bad input without changing state", () => {
  const pending = () => {
    const ctx = liveplusState();
    const r = ingestNotification(ctx.state, hsbcAlert("BOUTIQUE"), NOW);
    return { ...ctx, state: r.state, candidateId: r.candidateId };
  };

  test.each([
    ["unknown candidate", (s, id, g) => assignCandidate(s, "nope", { groupId: g, categoryId: "grocery-10" }), "Candidate not found"],
    ["unknown group", (s, id) => assignCandidate(s, id, { groupId: "nope", categoryId: "grocery-10" }), "Choose a cashback group"],
    ["category from another group", (s, id, g) => assignCandidate(s, id, { groupId: g, categoryId: "nope" }), "Choose a category"],
    ["no category chosen", (s, id, g) => assignCandidate(s, id, { groupId: g, categoryId: null }), "Choose a category"],
    ["No cashback without a group", (s, id) => assignNoCashback(s, id, null), "Choose a cashback group"],
    ["ignore an unknown candidate", (s) => ignoreCandidate(s, "nope"), "Candidate not found"],
    ["create a cycle for an unknown card", (s, id) => createGroupForCandidate(s, id, "nope"), "Card not found"],
    ["link a refund to an unknown transaction", (s, id, g) => linkRefund(s, id, g, "nope"), "Choose the original transaction"],
    ["link a refund in an unknown group", (s, id) => linkRefund(s, id, "nope", "nope"), "Choose the original transaction"],
  ])("%s", (_, act, message) => {
    const { state, candidateId, group } = pending();
    const before = JSON.stringify(state);
    expect(() => act(state, candidateId, group.id)).toThrow(message);
    expect(JSON.stringify(state)).toBe(before);
    expect(pendingCandidates(state)).toHaveLength(1);
  });

  test("a refund cannot be linked to another refund", () => {
    const { state, candidateId, group } = pending();
    const withRefund = addTransaction(state.groups, group.id, { name: "Refund", amount: -50, categoryId: "grocery-10" });
    const s = { ...state, groups: withRefund.groups };
    expect(() => linkRefund(s, candidateId, group.id, withRefund.transaction.id)).toThrow("only be linked to a spend");
  });
});

describe("group operations reject bad input", () => {
  const { state, group } = liveplusState();

  test.each([
    ["add to an unknown group", () => addTransaction(state.groups, "nope", { amount: 10 }), "Group not found"],
    ["add a non-numeric amount", () => addTransaction(state.groups, group.id, { amount: "abc" }), "Enter a valid amount"],
    ["edit an unknown transaction", () => updateTransaction(state.groups, group.id, "nope", { name: "x" }), "Transaction not found"],
    ["edit an unknown group", () => updateTransaction(state.groups, "nope", "nope", {}), "Group not found"],
    ["delete from an unknown group", () => deleteTransaction(state.groups, "nope", "x"), "Group not found"],
    ["move an unknown transaction", () => moveTransaction(state.groups, group.id, "nope", group.id, "grocery-10"), "Transaction not found"],
    ["move to an unknown group", () => moveTransaction(state.groups, group.id, "tx", "nope", "grocery-10"), "Group not found"],
  ])("%s", (_, act, message) => {
    expect(act).toThrow(message);
  });

  test("setting a non-numeric amount is rejected", () => {
    const { groups, transaction } = addTransaction(state.groups, group.id, { amount: 10, categoryId: "grocery-10" });
    expect(() => updateTransaction(groups, group.id, transaction.id, { amount: "ten" })).toThrow("Enter a valid amount");
  });

  test("deleting a category in use is refused and nothing changes", () => {
    const { groups } = addTransaction(state.groups, group.id, { amount: 10, categoryId: "grocery-10" });
    const g = groups[0];
    const r = deleteCategory(g, "grocery-10");
    expect(r.ok).toBe(false);
    expect(r.group).toBe(g);
  });
});

describe("cashback never goes wrong on bad data", () => {
  test("never negative, never above caps, unknown category earns 0", () => {
    const r = computeCycle({
      groupCap: 100,
      categories: [{ id: "a", percentage: 50, cap: 60 }],
      transactions: [
        { id: "1", amount: 1000, categoryId: "a", occurredAt: "2026-09-01" },
        { id: "2", amount: 1000, categoryId: "missing", occurredAt: "2026-09-02" },
        { id: "3", amount: -5000, categoryId: "missing", occurredAt: "2026-09-03" },
      ],
    });
    expect(r.perTransaction["1"].cashback).toBe(60);
    expect(r.perTransaction["2"].cashback).toBe(0);
    expect(r.perTransaction["3"].cashback).toBe(0);
    expect(r.total).toBe(60);
  });

  test("non-numeric rates and amounts count as zero", () => {
    const r = computeCycle({
      categories: [{ id: "a", percentage: "abc", cap: "xyz" }],
      transactions: [{ id: "1", amount: "oops", categoryId: "a" }],
    });
    expect(r.total).toBe(0);
    expect(r.totalSpent).toBe(0);
  });

  test("negative caps behave as no cap rather than negative cashback", () => {
    const r = computeCycle({ categories: [{ id: "a", percentage: 10, cap: -5 }], transactions: [{ id: "1", amount: 100, categoryId: "a" }] });
    expect(r.total).toBe(10);
  });
});

describe("cycles and templates reject bad configuration", () => {
  test.each([0, 32, -1, 10.5, "10", null, undefined])("start day %p is not a valid cycle", (startDay) => {
    expect(isCycleConfigured({ mode: "billing-cycle", startDay })).toBe(false);
    expect(cycleForDate({ mode: "billing-cycle", startDay }, "2026-09-14")).toBeNull();
  });

  test("unknown cycle mode and missing cycle", () => {
    expect(cycleForDate({ mode: "weekly" }, "2026-09-14")).toBeNull();
    expect(cycleForDate(undefined, "2026-09-14")).toBeNull();
  });

  test("unknown card and invalid variant are rejected", () => {
    expect(() => buildTemplate("no-such-card")).toThrow("Unknown card template");
    expect(() => buildTemplate("phonepe-sbi", { variant: "GOLD" })).toThrow("Card variant is required");
    expect(() => buildTemplate("amazon-icici", { prime: "Maybe" })).toThrow("Amazon Prime member is required");
  });
});

describe("backups and old data", () => {
  test("a backup with a malformed group is rejected", () => {
    const json = JSON.stringify({
      app: "SplitVCM", schemaVersion: 1, cashbackGroups: [{ id: "g", name: "Bad" }], cardTemplates: [], candidates: [],
    });
    expect(() => parseBackup(json)).toThrow('Cashback group "Bad" is malformed');
  });

  test("an empty string and null are not backups", () => {
    expect(() => parseBackup("")).toThrow("not valid JSON");
    expect(() => parseBackup("null")).toThrow("not a SplitVCM backup");
  });

  test("old groups with missing fields migrate without crashing", () => {
    const g = migrateGroupV0({ id: 1, name: "Old" });
    expect(g).toMatchObject({ categories: [], transactions: [], totalCashback: 0 });
  });

  test("old transactions with non-numeric amounts become 0", () => {
    const g = migrateGroupV0({ id: 1, name: "Old", categories: [{ name: "A", percentage: 10 }], transactions: [{ id: 2, amount: "abc", category: "A" }] });
    expect(g.transactions[0].amount).toBe(0);
  });
});
