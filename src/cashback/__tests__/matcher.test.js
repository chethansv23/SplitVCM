import { decideAssignment, matchCategory, merchantKey } from "../matcher";
import { parseNotification } from "../parser";
import { buildTemplate } from "../templates";
import { hsbcAlert, liveplusState, NOW } from "./helpers";

const parse = (raw) => parseNotification(raw);

describe("matchCategory", () => {
  const template = buildTemplate("hsbc-live-plus", {}, NOW);

  test("keyword match is case- and spacing-insensitive", () => {
    expect(merchantKey("Big Basket")).toBe("bigbasket");
    const m = matchCategory(template, template.categories, "BIG BASKET BLR");
    expect(m.status).toBe("matched");
    expect(m.category.id).toBe("grocery-10");
  });

  test("unknown merchant suggests the default category", () => {
    const m = matchCategory(template, template.categories, "Some Boutique");
    expect(m.status).toBe("unknown");
    expect(m.category.id).toBe("other-1-5");
  });

  test("matches in two categories are ambiguous", () => {
    const m = matchCategory(template, template.categories, "Swiggy Instamart");
    expect(m.status).toBe("ambiguous");
  });

  test("learned rule wins over keywords", () => {
    const t = {
      ...template,
      merchantRules: [{ id: "r1", merchantKey: "swiggyinstamart", categoryId: "grocery-10" }],
    };
    const m = matchCategory(t, t.categories, "Swiggy Instamart");
    expect(m).toMatchObject({ status: "matched", ruleId: "r1", learned: true });
    expect(m.category.id).toBe("grocery-10");
  });

  test("inactive categories are ignored", () => {
    const cats = template.categories.map((c) => (c.id === "grocery-10" ? { ...c, active: false } : c));
    expect(matchCategory(template, cats, "BIGBASKET").status).toBe("unknown");
  });
});

describe("decideAssignment", () => {
  test("clear match is auto-assigned", () => {
    const { state, group } = liveplusState();
    const d = decideAssignment(parse(hsbcAlert("BIGBASKET")), state);
    expect(d).toMatchObject({ decision: "auto", reasons: [] });
    expect(d.suggestion).toMatchObject({ groupId: group.id, categoryId: "grocery-10" });
  });

  const cases = [
    ["no-card-match", (s) => s, hsbcAlert("BIGBASKET", 899, "14 Sep 2026 at 18:05", "0000")],
    ["no-open-cycle", (s) => s, hsbcAlert("BIGBASKET", 899, "14 Oct 2026 at 18:05")],
    ["unknown-merchant", (s) => s, hsbcAlert("BOUTIQUE XYZ")],
    ["excluded-category", (s) => s, hsbcAlert("HPCL PETROL PUMP")],
    ["ambiguous-category", (s) => s, hsbcAlert("SWIGGY INSTAMART")],
    [
      "multiple-cards",
      (s) => ({ ...s, templates: [...s.templates, { ...s.templates[0], id: "dup" }] }),
      hsbcAlert("BIGBASKET"),
    ],
    [
      "multiple-groups",
      (s) => ({ ...s, groups: [...s.groups, { ...s.groups[0], id: "g2" }] }),
      hsbcAlert("BIGBASKET"),
    ],
    [
      "possible-duplicate",
      (s) => ({
        ...s,
        groups: [{
          ...s.groups[0],
          transactions: [{ id: "m1", amount: 899, categoryId: "grocery-10", occurredAt: "2026-09-14T09:00:00.000Z" }],
        }],
      }),
      hsbcAlert("BIGBASKET"),
    ],
  ];

  test.each(cases)("%s → review", (reason, tweak, raw) => {
    const { state } = liveplusState();
    const d = decideAssignment(parse(raw), tweak(state));
    expect(d.decision).toBe("review");
    expect(d.reasons).toContain(reason);
  });

  test("closed cycle groups are not used", () => {
    const { state } = liveplusState();
    const closed = { ...state, groups: [{ ...state.groups[0], status: "closed" }] };
    expect(decideAssignment(parse(hsbcAlert("BIGBASKET")), closed).reasons).toContain("no-open-cycle");
  });

  test("category with unknown rate goes to review (HSBC RuPay)", () => {
    const { state } = liveplusState();
    const s = {
      ...state,
      groups: [{ ...state.groups[0], categories: state.groups[0].categories.map((c) =>
        c.id === "grocery-10" ? { ...c, percentage: null } : c) }],
    };
    expect(decideAssignment(parse(hsbcAlert("BIGBASKET")), s).reasons).toContain("unknown-rate");
  });

  test("credits go to review for refund linking", () => {
    const { state } = liveplusState();
    const p = parse({ text: "Refund of Rs.899.00 from BIGBASKET has been credited to your HSBC Credit Card ending 5678 on 18 Sep 2026." });
    expect(decideAssignment(p, state).reasons).toContain("not-debit");
  });

  test("date-less alerts are not auto-assigned", () => {
    const { state } = liveplusState();
    const p = parse({ text: "INR 899.00 spent on HSBC Credit Card ending 5678 at BIGBASKET", postedAt: "2026-09-14T12:00:00Z" });
    expect(decideAssignment(p, state).reasons).toContain("low-parser-confidence");
  });

  test("UPI alert without card suffix matches the single UPI-enabled card", () => {
    const { state } = liveplusState();
    const s = { ...state, templates: [{ ...state.templates[0], upiEnabled: true }] };
    const p = parse({ text: "Rs 150.00 debited from your Credit Card via UPI to VPA bigbasket@axb on 20-09-2026. UPI Ref 1234" });
    const d = decideAssignment(p, s);
    expect(d.decision).toBe("auto");
    expect(d.suggestion.categoryId).toBe("grocery-10");
  });

  test("UPI alert that does not mention a card is never matched to a UPI card", () => {
    const { state } = liveplusState();
    const s = { ...state, templates: [{ ...state.templates[0], upiEnabled: true }] };
    const p = parseNotification({
      text: "Rs 150.00 debited via UPI to VPA bigbasket@axb on 20-09-2026. UPI Ref 1234",
      includeBankAccountDebits: true,
    });
    expect(decideAssignment(p, s).reasons).toContain("no-card-match");
  });
});
