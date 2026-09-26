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
  recheckPending,
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

describe("review fixes", () => {
  test("a date-only email merges with the timed SMS for the same spend", () => {
    const { state } = liveplusState();
    const email = {
      text: "Rs.899.00 has been debited from your HSBC Credit Card ending 5678 towards BIGBASKET on 14 Sep 2026.",
      sourceApp: "com.google.android.gm",
    };
    const { summary } = ingestMany(state, [hsbcAlert("BIGBASKET"), email], NOW);
    expect(summary).toMatchObject({ assigned: 1, duplicate: 1 });
  });

  test("date-only alerts on different days are not merged", () => {
    const a = { amount: 100, direction: "debit", cardLastFour: "1", occurredAt: "2026-09-14T00:00:00", dateFromText: true, timeFromText: false };
    expect(isDuplicate(a, { ...a, occurredAt: "2026-09-15T00:00:00" })).toBe(false);
    expect(isDuplicate(a, { ...a, occurredAt: "2026-09-14T18:00:00", timeFromText: true })).toBe(true);
  });

  test("retention returns the same state object when nothing changed", () => {
    const { state } = liveplusState();
    const s = { ...state, candidates: [{ id: "a", status: "pending-review", rawText: "x" }] };
    expect(applyRetention(s, NOW)).toBe(s);
  });

  test("an alert that fails to process is kept for review, not lost", () => {
    const { state } = liveplusState();
    const warn = jest.spyOn(console, "warn").mockImplementation(() => {});
    // A malformed cycle group makes category matching throw.
    const broken = { ...state, groups: [{ ...state.groups[0], categories: null }] };
    const { state: next, summary } = ingestMany(broken, [hsbcAlert("BIGBASKET")], NOW);
    expect(summary.review).toBe(1);
    expect(pendingCandidates(next)[0]).toMatchObject({ reviewReasons: ["processing-error"] });
    expect(pendingCandidates(next)[0].rawText).toContain("BIGBASKET");
    warn.mockRestore();
  });
});

describe("recheckPending: alerts that arrived before the card was set up", () => {
  const TATA = {
    text: "HSBC Credit Card xx7342 used at TATA 1MG HEALTHCARE for INR 867.00 on 26/09/26 at 14:10. Avl limit INR 150000.00",
    sourceApp: "com.google.android.apps.messaging",
  };

  test("adding the card digits moves a waiting alert into its cycle automatically", () => {
    const { state } = liveplusState();
    const noDigits = { ...state, templates: [{ ...state.templates[0], cardLastFour: "" }] };
    const r = ingestNotification(noDigits, TATA, NOW);
    expect(pendingCandidates(r.state)[0].reviewReasons).toContain("no-card-match");

    // 1mg is not a keyword yet, so it stays in review, now with a card and group suggested.
    const withDigits = { ...r.state, templates: [{ ...r.state.templates[0], cardLastFour: "7342" }] };
    let { state: after, assigned } = recheckPending(withDigits, NOW);
    expect(assigned).toBe(0);
    expect(pendingCandidates(after)[0]).toMatchObject({
      reviewReasons: ["unknown-merchant"],
      suggestedGroupId: state.groups[0].id,
    });

    // Once 1mg is linked to a category, a re-check adds it without asking.
    after = { ...after, templates: [{ ...after.templates[0], merchantRules: [{ id: "r", merchantKey: "tata1mghealthcare", categoryId: "other-1-5" }] }] };
    ({ state: after, assigned } = recheckPending(after, NOW));
    expect(assigned).toBe(1);
    expect(pendingCandidates(after)).toHaveLength(0);
    expect(after.groups[0].transactions[0]).toMatchObject({ name: "TATA 1MG HEALTHCARE", amount: 867, assignmentMode: "automatic" });
  });

  test("creating the missing cycle moves a clear alert in", () => {
    const ctx = liveplusState();
    const r = ingestNotification(ctx.state, hsbcAlert("BIGBASKET", 899, "14 Oct 2026 at 18:05"), NOW);
    expect(pendingCandidates(r.state)[0].reviewReasons).toEqual(["no-open-cycle"]);
    const october = require("../templates").createCycleGroup(ctx.template, "2026-10-14", NOW);
    const { state: after, assigned } = recheckPending({ ...r.state, groups: [...r.state.groups, october] }, NOW);
    expect(assigned).toBe(1);
    expect(after.groups[1].totalCashback).toBe(89);
  });

  test("nothing changes when nothing new is known (same object back)", () => {
    const { state } = liveplusState();
    const r = ingestNotification(state, hsbcAlert("BOUTIQUE"), NOW);
    const out = recheckPending(r.state, NOW);
    expect(out.assigned).toBe(0);
    expect(out.state).toBe(r.state);
  });

  test("ignored, reviewed and unreadable alerts are left alone", () => {
    const { state } = liveplusState();
    const r = ingestNotification(state, hsbcAlert("BIGBASKET", 899, "14 Oct 2026 at 18:05"), NOW);
    const ignored = ignoreCandidate(r.state, r.candidateId, NOW);
    const october = require("../templates").createCycleGroup(state.templates[0], "2026-10-14", NOW);
    expect(recheckPending({ ...ignored, groups: [...ignored.groups, october] }, NOW).assigned).toBe(0);
  });
});
