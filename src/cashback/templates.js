import { ROUNDING, withComputed } from "./compute";
import { cycleForDate, cycleGroupName, isCycleConfigured } from "./cycles";
import { toDateKey } from "./dates";
import { ensureExcludedCategory } from "./groups";
import { newId, slugify } from "./ids";

// Built-in card catalogue. Rates and caps are starting values from the
// issuers' published terms (see CASHBACK_AUTOMATION_PLAN.md) and stay
// editable, because issuers change them. `percentage: null` means the rate
// is unknown: transactions in that category always go to review.

const EXCLUDED_COMMON = [
  "fuel", "petrol", "diesel", "hpcl", "bpcl", "iocl", "indian oil",
  "rent", "wallet", "emi", "insurance", "govt", "government",
];

const category = (id, name, percentage, cap, keywords = [], extra = {}) => ({
  id,
  name,
  percentage,
  cap,
  keywords,
  mccNotes: "",
  active: true,
  excluded: false,
  isDefault: false,
  ...extra,
});

const excludedCategory = (keywords) =>
  category("excluded", "0% / excluded", 0, null, keywords, { excluded: true });

export const CATALOGUE = {
  "hdfc-millennia": {
    name: "HDFC Millennia",
    options: [],
    build: () => ({
      cycle: { mode: "billing-cycle", startDay: null },
      categories: [
        category("partners-5", "5% partner merchants", 5, 1000, [
          "amazon", "bookmyshow", "cultfit", "cult.fit", "flipkart", "myntra",
          "sonyliv", "swiggy", "tatacliq", "uber", "zomato",
        ]),
        category("other-1", "1% other eligible", 1, 1000, [], { isDefault: true }),
        excludedCategory(EXCLUDED_COMMON),
      ],
      notes:
        "Set your billing-cycle start day before creating a cycle. Cashback is issued as CashPoints and posted by calendar month, which can differ from your billing cycle.",
      sourceLinks: [
        "https://www.hdfcbank.com/content/api/contentstream-id/723fb80a-2dde-42a3-9793-7ae1be57c87f/5d94cc09-80b7-4073-8c9f-22fad88054f0",
      ],
    }),
  },
  "hsbc-live-plus": {
    name: "HSBC Live+",
    options: [],
    build: () => ({
      cycle: { mode: "billing-cycle", startDay: 10 },
      categories: [
        category("dining-10", "10% dining & food delivery", 10, null, [
          "swiggy", "zomato", "eatsure", "restaurant", "cafe", "dominos",
          "mcdonald", "kfc", "pizza hut", "starbucks", "dineout",
        ]),
        category("grocery-10", "10% groceries", 10, null, [
          "bigbasket", "blinkit", "zepto", "instamart", "dmart", "jiomart",
          "reliance fresh", "grocery", "supermarket",
        ]),
        category("other-1-5", "1.5% other eligible", 1.5, null, [], { isDefault: true }),
        excludedCategory([
          ...EXCLUDED_COMMON, "atm", "cash withdrawal", "credit card payment", "toll", "fastag",
        ]),
      ],
      capPools: [
        { id: "accelerated", name: "Accelerated 10% cap", cap: 1000, categoryIds: ["dining-10", "grocery-10"] },
      ],
      sourceLinks: ["https://www.hsbc.co.in/credit-cards/how-does-cashback-work/"],
    }),
  },
  "hsbc-rupay": {
    name: "HSBC RuPay",
    options: [],
    build: () => ({
      cycle: { mode: "billing-cycle", startDay: 15 },
      upiEnabled: true,
      categories: [
        category("base", "Base eligible spend", null, null, [], { isDefault: true }),
        category("upi-offer", "UPI / merchant offer", null, null),
        category("promo", "Promotional offer", null, null),
        excludedCategory(EXCLUDED_COMMON),
      ],
      notes:
        "Rates and caps are blank until the exact HSBC RuPay variant and its current benefits are confirmed. Transactions stay in review until rates are set.",
      sourceLinks: [],
    }),
  },
  "airtel-axis": {
    name: "Airtel Axis",
    options: [],
    build: () => ({
      cycle: { mode: "billing-cycle", startDay: 12 },
      categories: [
        category("airtel-25", "25% Airtel bills (Airtel Thanks)", 25, 250, ["airtel"]),
        category("utility-10", "10% utilities via Airtel Thanks", 10, 250, []),
        category("swiggy-10", "10% Swiggy", 10, null, ["swiggy"]),
        category("zomato-10", "10% Zomato", 10, null, ["zomato"]),
        category("bigbasket-10", "10% BigBasket", 10, null, ["bigbasket"]),
        category("other-1", "1% other eligible", 1, null, [], { isDefault: true }),
        excludedCategory([
          ...EXCLUDED_COMMON, "electricity", "bescom", "tata power", "adani electricity", "water board",
        ]),
      ],
      capPools: [
        { id: "food-apps", name: "Swiggy/Zomato/BigBasket cap", cap: 500, categoryIds: ["swiggy-10", "zomato-10", "bigbasket-10"] },
      ],
      sourceLinks: [
        "https://www.axisbank.com/docs/default-source/default-document-library/credit-cards/terms-and-conditions-for-cashback-for-airtel-axis-bank-credit-card.pdf/1000",
      ],
    }),
  },
  "phonepe-sbi": {
    name: "PhonePe SBI",
    options: [
      { key: "variant", label: "Card variant", choices: ["PURPLE", "SELECT BLACK"], required: true },
    ],
    build: ({ variant }) => {
      const black = variant === "SELECT BLACK";
      return {
        name: `PhonePe SBI ${variant}`,
        cycle: { mode: "calendar-month" },
        categories: [
          category("phonepe", `${black ? 10 : 3}% PhonePe / Pincode`, black ? 10 : 3, null, ["phonepe", "pincode"]),
          category("online", `${black ? 5 : 2}% eligible online`, black ? 5 : 2, null, []),
          category("other-1", "1% other eligible", 1, null, [], { isDefault: true }),
          excludedCategory(EXCLUDED_COMMON),
        ],
        rewardValue: 1,
        notes:
          "Rewards are points; the reward-to-rupee value (default ₹1/point) applies where statement-credit redemption is available. SBI Card has announced benefit revisions — confirm against your card's current terms.",
        sourceLinks: [
          "https://www.phonepe.com/credit-cards/phonepe-sbi-card-purple-credit-card/",
          "https://www.sbicard.com/en/customer-notices.page",
        ],
      };
    },
  },
  "amazon-icici": {
    name: "Amazon Pay ICICI",
    options: [
      { key: "prime", label: "Amazon Prime member", choices: ["Yes", "No"], required: true },
    ],
    build: ({ prime }) => {
      const isPrime = prime === "Yes";
      const rate = isPrime ? 5 : 3;
      return {
        cycle: { mode: "billing-cycle", startDay: 12 },
        categories: [
          category("amazon", `${rate}% Amazon & Amazon Pay travel`, rate, null, ["amazon"]),
          category("partners-2", "2% partner merchants", 2, null, []),
          category("other-1", "1% other eligible", 1, null, [], { isDefault: true }),
          excludedCategory(EXCLUDED_COMMON),
        ],
        sourceLinks: [
          "https://www.icici.bank.in/about-us/news-room/2025/amazon-pay-and-icici-bank-renew-partnership-enhance-indias-most-adopted-co-branded-credit-card",
        ],
      };
    },
  },
};

export const blankTemplate = (name) => ({
  cycle: { mode: "billing-cycle", startDay: 1 },
  categories: [
    category("other", "Other eligible", 1, null, [], { isDefault: true }),
    excludedCategory([]),
  ],
  name,
});

export const buildTemplate = (catalogueKey, options = {}, now = new Date()) => {
  const entry = CATALOGUE[catalogueKey];
  if (!entry) throw new Error(`Unknown card template: ${catalogueKey}`);
  for (const opt of entry.options) {
    if (opt.required && !opt.choices.includes(options[opt.key])) {
      throw new Error(`${opt.label} is required`);
    }
  }
  const built = entry.build(options);
  return normaliseTemplate({
    id: newId(slugify(catalogueKey)),
    catalogueKey,
    name: built.name || entry.name,
    options,
    lastVerifiedAt: now.toISOString().slice(0, 10),
    ...built,
  });
};

export const normaliseTemplate = (t) => ({
  cardLastFour: "",
  upiEnabled: false,
  capPools: [],
  groupCap: null,
  rounding: ROUNDING.PER_TRANSACTION_FLOOR,
  rewardValue: 1,
  merchantRules: [],
  notes: "",
  sourceLinks: [],
  options: {},
  ...t,
});

// A new cycle group is a snapshot of the template's categories and caps.
// Category ids are kept, so learned merchant rules apply to every cycle.
export const createCycleGroup = (template, date, now = new Date()) => {
  if (!isCycleConfigured(template.cycle)) {
    throw new Error("Set the billing-cycle start day on this card first.");
  }
  const range = cycleForDate(template.cycle, date);
  return {
    id: newId("group"),
    name: cycleGroupName(template.name, range),
    templateId: template.id,
    cycleStart: range.start,
    cycleEnd: range.end,
    status: "open",
    categories: template.categories.map((c) => ({ ...c, totalCashback: 0, totalSpent: 0 })),
    capPools: template.capPools.map((p) => ({ ...p, categoryIds: [...p.categoryIds] })),
    groupCap: template.groupCap,
    rounding: template.rounding,
    rewardValue: template.rewardValue,
    transactions: [],
    totalCashback: 0,
    totalSpent: 0,
    createdAt: now.toISOString(),
  };
};

export const findCycleGroup = (groups, templateId, range) =>
  groups.find(
    (g) => g.templateId === templateId && g.cycleStart === range.start && g.cycleEnd === range.end
  );

export const LEARNED_RULE_SOURCE = "learned";

// Cards whose previous cycle group has ended and whose current cycle has no
// group yet. The app offers to create these; it never creates them silently.
export const cyclesToOffer = (templates, groups, today = new Date()) =>
  templates
    .filter((t) => isCycleConfigured(t.cycle) && groups.some((g) => g.templateId === t.id))
    .map((t) => ({ template: t, range: cycleForDate(t.cycle, today) }))
    .filter(({ template, range }) => !findCycleGroup(groups, template.id, range));

// Template categories carry no transactions, so they can always be deleted;
// cap pools and learned rules that point at them are cleaned up. Existing
// cycle groups keep their own copy.
export const deleteTemplateCategory = (template, categoryId) => ({
  ...template,
  categories: template.categories.filter((c) => c.id !== categoryId),
  capPools: template.capPools.map((p) => ({
    ...p,
    categoryIds: p.categoryIds.filter((id) => id !== categoryId),
  })),
  merchantRules: template.merchantRules.filter((r) => r.categoryId !== categoryId),
});

// Pushes edited template rates/caps into an existing cycle group. Template
// categories replace or join the group's; group-only categories (which may
// hold transactions) are kept.
export const applyTemplateToGroup = (template, group) => {
  const fromTemplate = new Map(template.categories.map((c) => [c.id, c]));
  const categories = group.categories.map((c) =>
    fromTemplate.has(c.id) ? { ...c, ...fromTemplate.get(c.id) } : c
  );
  for (const c of template.categories) {
    if (!group.categories.some((g) => g.id === c.id)) categories.push({ ...c });
  }
  return withComputed({
    ...group,
    categories,
    capPools: template.capPools.map((p) => ({ ...p, categoryIds: [...p.categoryIds] })),
    groupCap: template.groupCap,
    rounding: template.rounding,
    rewardValue: template.rewardValue,
  });
};

export const isValidCardDigits = (digits) => /^\d{4}$/.test(digits || "");

// Turns a manual group into a tracked card: creates a card from the group's
// categories and caps, and makes the group that card's current cycle, so
// alerts with these card digits are matched to it from now on.
// Returns { state, template, range, outsideCycle } or throws with a message
// the user can act on.
export const trackGroupWithCard = (state, groupId, { cardLastFour, cycle }, now = new Date()) => {
  const group = state.groups.find((g) => g.id === groupId);
  if (!group) throw new Error("Group not found");
  // A group whose card was deleted can be linked again.
  if (group.templateId && state.templates.some((t) => t.id === group.templateId)) {
    throw new Error("This group is already linked to a card.");
  }
  if (!isValidCardDigits(cardLastFour)) throw new Error("Enter the card's last four digits.");
  if (!isCycleConfigured(cycle)) throw new Error("Enter the billing-cycle start day (1–31) or choose calendar month.");
  const other = state.templates.find((t) => t.cardLastFour === cardLastFour);
  if (other) throw new Error(`${other.name} already uses •••• ${cardLastFour}.`);

  // Every card needs a 0% category for excluded spends.
  const { group: ensured } = ensureExcludedCategory(group);
  // Review suggests the default category for unknown merchants; old groups
  // have none, so use the first normal category.
  const firstNormal = ensured.categories.find((c) => !c.excluded);
  const withExcluded =
    ensured.categories.some((c) => c.isDefault) || !firstNormal
      ? ensured
      : { ...ensured, categories: ensured.categories.map((c) => (c === firstNormal ? { ...c, isDefault: true } : c)) };
  const template = normaliseTemplate({
    id: newId("card"),
    name: group.name,
    cardLastFour,
    cycle,
    categories: withExcluded.categories.map(({ totalCashback, totalSpent, ...c }) => ({
      keywords: [],
      mccNotes: "",
      active: true,
      excluded: false,
      isDefault: false,
      ...c,
    })),
    capPools: (withExcluded.capPools || []).map((p) => ({ ...p, categoryIds: [...p.categoryIds] })),
    groupCap: withExcluded.groupCap ?? null,
    rounding: withExcluded.rounding || ROUNDING.PER_TRANSACTION_FLOOR,
    rewardValue: withExcluded.rewardValue ?? 1,
    lastVerifiedAt: toDateKey(now),
    notes: "Created from a manual cashback group. Add merchant keywords to categories, or use Remember in review, so alerts can be categorised.",
  });
  const range = cycleForDate(cycle, now);
  const linked = withComputed({
    ...withExcluded,
    templateId: template.id,
    cycleStart: range.start,
    cycleEnd: range.end,
    status: "open",
  });
  const outsideCycle = linked.transactions.filter((tx) => {
    const day = tx.occurredAt ? toDateKey(tx.occurredAt) : null;
    return day && (day < range.start || day > range.end);
  }).length;
  return {
    state: {
      ...state,
      templates: [...state.templates, template],
      groups: state.groups.map((g) => (g.id === groupId ? linked : g)),
    },
    template,
    range,
    outsideCycle,
  };
};
