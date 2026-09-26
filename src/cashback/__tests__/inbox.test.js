import { fingerprint, isDuplicate } from "../dedupe";
import {
  applyRetention,
  assignCandidate,
  assignNoCashback,
  createGroupForCandidate,
  deleteAllCapturedText,
  ignoreCandidate,
  ingestMany,
  ingestNotification,
  linkRefund,
  pendingCandidates,
} from "../inbox";
import { hsbcAlert, liveplusState, NOW } from "./helpers";

describe("ingestNotification", () => {
  test("clear alert is auto-assigned with an audit trail and no review item", () => {
    const { state, group } = liveplusState();
    const { state: next, outcome } = ingestNotification(state, hsbcAlert("BIGBASKET"), NOW);
    expect(outcome).toBe("assigned");
    const g = next.groups.find((x) => x.id === group.id);
    expect(g.transactions).toHaveLength(1);
    expect(g.transactions[0]).toMatchObject({
      name: "BIGBASKET",
      amount: 899,
      categoryId: "grocery-10",
      assignmentMode: "automatic",
      assignmentRuleId: "keyword:grocery-10",
    });
    expect(g.totalCashback).toBe(89);
    expect(next.candidates[0].status).toBe("assigned");
    expect(next.candidates[0].transactionId).toBe(g.transactions[0].id);
    expect(pendingCandidates(next)).toHaveLength(0);
  });

  test("unclear alert goes to review with suggestion", () => {
    const { state, group } = liveplusState();
    const { state: next, outcome } = ingestNotification(state, hsbcAlert("BOUTIQUE XYZ"), NOW);
    expect(outcome).toBe("review");
    const [c] = pendingCandidates(next);
    expect(c).toMatchObject({
      suggestedGroupId: group.id,
      suggestedCategoryId: "other-1-5",
      reviewReasons: ["unknown-merchant"],
      source: "sms-notification",
    });
    expect(c.rawText).toContain("BOUTIQUE XYZ");
  });

  test("non-transactions are dropped and not stored", () => {
    const { state } = liveplusState();
    const r = ingestNotification(state, { text: "Your OTP is 123456 for Rs.100 at X" }, NOW);
    expect(r.outcome).toBe("ignored");
    expect(r.state.candidates).toHaveLength(0);
  });

  test("the same spend from SMS and email is recorded once", () => {
    const { state } = liveplusState();
    const email = {
      text: "Rs.899.00 has been debited from your HSBC Credit Card ending 5678 towards BIGBASKET on 14 Sep 2026 at 18:09.",
      sourceApp: "com.google.android.gm",
    };
    const { state: next, summary } = ingestMany(state, [hsbcAlert("BIGBASKET"), email], NOW);
    expect(summary).toEqual({ assigned: 1, review: 0, duplicate: 1, ignored: 0 });
    expect(next.groups[0].transactions).toHaveLength(1);
    expect(next.candidates[0].duplicateSources[0].sourceApp).toBe("com.google.android.gm");
  });
});

describe("dedupe", () => {
  const a = { amount: 100, direction: "debit", cardLastFour: "1234", occurredAt: "2026-09-14T10:00:00Z" };
  test("within the window, source-independent", () => {
    expect(isDuplicate(a, { ...a, occurredAt: "2026-09-14T10:09:00Z" })).toBe(true);
    expect(isDuplicate(a, { ...a, occurredAt: "2026-09-14T10:11:00Z" })).toBe(false);
  });
  test("different card, amount, or direction is not a duplicate", () => {
    expect(isDuplicate(a, { ...a, cardLastFour: "9999" })).toBe(false);
    expect(isDuplicate(a, { ...a, amount: 101 })).toBe(false);
    expect(isDuplicate(a, { ...a, direction: "credit" })).toBe(false);
  });
  test("an alert without a card suffix can match one with a suffix", () => {
    expect(isDuplicate(a, { ...a, cardLastFour: null })).toBe(true);
  });
  test("fingerprint excludes the source", () => {
    expect(fingerprint(a)).toBe(fingerprint({ ...a, source: "email" }));
  });
});

describe("review actions", () => {
  const pending = (merchant = "BOUTIQUE XYZ") => {
    const ctx = liveplusState();
    const { state, candidateId } = ingestNotification(ctx.state, hsbcAlert(merchant), NOW);
    return { ...ctx, state, candidateId };
  };

  test("Add with remember rule teaches the template", () => {
    const { state, candidateId, group, template } = pending();
    const next = assignCandidate(state, candidateId, {
      groupId: group.id, categoryId: "grocery-10", rememberRule: true,
    }, NOW);
    expect(next.candidates[0].status).toBe("reviewed");
    expect(next.groups[0].transactions[0].assignmentMode).toBe("reviewed");
    const rules = next.templates.find((t) => t.id === template.id).merchantRules;
    expect(rules).toEqual([expect.objectContaining({ merchantKey: "boutiquexyz", categoryId: "grocery-10" })]);

    // The next alert from that merchant is assigned automatically.
    const again = ingestNotification(next, hsbcAlert("BOUTIQUE XYZ", 500, "20 Sep 2026 at 10:00"), NOW);
    expect(again.outcome).toBe("assigned");
  });

  test("Edit and add applies overrides", () => {
    const { state, candidateId, group } = pending();
    const next = assignCandidate(state, candidateId, {
      groupId: group.id,
      categoryId: "other-1-5",
      overrides: { merchant: "Boutique", amount: 1000 },
    }, NOW);
    expect(next.groups[0].transactions[0]).toMatchObject({ name: "Boutique", amount: 1000, cashback: 15 });
  });

  test("No cashback records it under the 0% category", () => {
    const { state, candidateId, group } = pending();
    const next = assignNoCashback(state, candidateId, group.id, NOW);
    const tx = next.groups[0].transactions[0];
    expect(tx.categoryId).toBe("excluded");
    expect(tx.cashback).toBe(0);
  });

  test("Ignore resolves without a transaction", () => {
    const { state, candidateId } = pending();
    const next = ignoreCandidate(state, candidateId, NOW);
    expect(next.candidates[0].status).toBe("ignored");
    expect(next.groups[0].transactions).toHaveLength(0);
    expect(pendingCandidates(next)).toHaveLength(0);
  });

  test("Create cycle group from the inbox, then assign", () => {
    const ctx = liveplusState();
    const { state, candidateId } = ingestNotification(
      ctx.state, hsbcAlert("BIGBASKET", 899, "14 Oct 2026 at 18:05"), NOW
    );
    expect(pendingCandidates(state)[0].reviewReasons).toContain("no-open-cycle");
    const { state: withGroup, groupId } = createGroupForCandidate(state, candidateId, ctx.template.id, NOW);
    const g = withGroup.groups.find((x) => x.id === groupId);
    expect([g.cycleStart, g.cycleEnd]).toEqual(["2026-10-10", "2026-11-09"]);
    expect(withGroup.candidates[0].suggestedGroupId).toBe(groupId);
    // Creating again reuses the same group.
    expect(createGroupForCandidate(withGroup, candidateId, ctx.template.id, NOW).state.groups).toHaveLength(2);
  });

  test("Link refund claws back the cashback", () => {
    const ctx = liveplusState();
    let { state } = ingestNotification(ctx.state, hsbcAlert("BIGBASKET"), NOW);
    const original = state.groups[0].transactions[0];
    const refund = ingestNotification(state, {
      text: "Refund of Rs.899.00 from BIGBASKET has been credited to your HSBC Credit Card ending 5678 on 18 Sep 2026.",
    }, NOW);
    state = linkRefund(refund.state, refund.candidateId, ctx.group.id, original.id, NOW);
    const g = state.groups[0];
    expect(g.transactions).toHaveLength(2);
    expect(g.transactions[1]).toMatchObject({ amount: -899, refundOf: original.id });
    expect(g.totalCashback).toBe(0);
  });
});

describe("retention", () => {
  const DAY = 86400000;
  const withCandidates = (candidates) => ({ ...liveplusState().state, candidates });

  test("raw text is removed after the retention period; pending items keep it", () => {
    const old = new Date(NOW - 31 * DAY).toISOString();
    const s = applyRetention(withCandidates([
      { id: "a", status: "reviewed", resolvedAt: old, rawText: "x", duplicateSources: [{ rawText: "y" }] },
      { id: "b", status: "pending-review", resolvedAt: null, rawText: "x" },
      { id: "c", status: "reviewed", resolvedAt: NOW.toISOString(), rawText: "x" },
    ]), NOW);
    expect(s.candidates.map((c) => c.rawText)).toEqual([null, "x", "x"]);
    expect(s.candidates[0].duplicateSources[0].rawText).toBeNull();
  });

  test("resolved candidates are dropped after 180 days", () => {
    const s = applyRetention(withCandidates([
      { id: "a", status: "ignored", resolvedAt: new Date(NOW - 181 * DAY).toISOString(), rawText: null },
    ]), NOW);
    expect(s.candidates).toHaveLength(0);
  });

  test("delete all captured text", () => {
    const s = deleteAllCapturedText(withCandidates([{ id: "a", status: "pending-review", rawText: "x" }]));
    expect(s.candidates[0].rawText).toBeNull();
  });
});
