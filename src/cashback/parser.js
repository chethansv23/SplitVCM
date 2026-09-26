// Parses a bank SMS / app / email notification into a transaction candidate.
// Pure and bank-agnostic; covered by fixtures in __tests__/fixtures.

export const PARSER_RULE_ID = "generic-v1";

const MONTHS = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
  jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11,
};

// Known UPI handles → merchant names. Anything else falls back to the
// handle's prefix.
const VPA_MERCHANTS = [
  ["swiggy", "Swiggy"], ["zomato", "Zomato"], ["bigbasket", "BigBasket"],
  ["blinkit", "Blinkit"], ["zepto", "Zepto"], ["amazon", "Amazon"],
  ["flipkart", "Flipkart"], ["myntra", "Myntra"], ["uber", "Uber"],
  ["phonepe", "PhonePe"], ["airtel", "Airtel"], ["bookmyshow", "BookMyShow"],
];

const AMOUNT_RE = /(?:rs\.?|inr|₹)\s*([\d,]+(?:\.\d{1,2})?)/i;
const CARD_RE =
  /(?:card|cc|a\/c|acct|account)[^\d\n]{0,25}?(?:x+|\*+|ending(?:\s+(?:with|in))?)\s*(\d{4})\b/i;
const MASKED_RE = /(?:xx+|\*{2,})\s*(\d{4})\b/i;
// Not followed by ".com" etc., so email addresses are not taken as UPI handles.
const VPA_RE = /\b([a-z0-9][a-z0-9.\-_]{1,}@[a-z][a-z0-9]{1,})\b(?!\.[a-z])/i;

const IGNORE_RULES = [
  ["otp", /\b(otp|one[\s-]time\s+password|verification\s+code)\b/i],
  ["failed", /\b(declined|failed|unsuccessful|could not be (?:processed|completed)|was not successful)\b/i],
  ["card-repayment", /\bpayment\s+(?:of\s+)?(?:rs\.?|inr|₹)?\s*[\d,.]+\s*(?:has been\s+)?received\b|\bthank you for (?:your )?payment\b/i],
  ["promotional", /\b(pre-?approved|apply now|offer valid|click here to|t&c apply|limited period)\b/i],
];

const CASH_RE = /\b(atm|cash\s+withdrawal|withdrawn\s+at\s+atm)\b/i;
// Direction: a refund/reversal is always a credit; otherwise a debit word
// wins over "credited", because UPI debits often say "…debited; SWIGGY credited".
const REFUND_RE = /\b(refund(?:ed)?|reversal|reversed)\b/i;
const CREDITED_RE = /\bcredited\b/i;
const CASHBACK_POSTING_RE = /\bcashback\b.{0,80}?\bcredited\b|\bcredited\b.{0,80}?\bcashback\b/i;
const CARD_MENTION_RE = /\b(card|cc)\b/i;
const ACCOUNT_MENTION_RE = /\b(a\/c|acct|account)\b/i;
const DEBIT_RE =
  /\b(spent|debited|charged|used|paid|purchase|txn|transaction|sent|done|withdrawn)\b/i;
const BALANCE_RE = /\b(avl|available)\s*(?:bal|balance|lmt|limit|credit\s+limit)\b/i;

const clean = (s) =>
  s
    .replace(/\s+/g, " ")
    .replace(/^[\s:.\-–,]+|[\s:.\-–,]+$/g, "")
    .trim();

export const merchantFromVpa = (vpa) => {
  const handle = vpa.split("@")[0].toLowerCase();
  const known = VPA_MERCHANTS.find(([key]) => handle.includes(key));
  if (known) return known[1];
  return handle.replace(/[._\-]?\d+$/, "").replace(/[._\-]+/g, " ").trim() || handle;
};

const extractMerchant = (text) => {
  const patterns = [
    /\binfo[:\s]+(.+?)(?:\.\s|\s+avl|\s+available|$)/i,
    /\bat\s+(.+?)(?=\s+on\s+\d|\s+on\s+\w{3}|\s+dated|\s+via|\s+using|\s+ref|\s+txn|\s+avl|\s+available|\.\s|\.$|,|$)/i,
    /\btowards\s+(.+?)(?=\s+on\s+|\s+ref|\.\s|\.$|,|$)/i,
    /\bto\s+(?!vpa\b)([a-z][\w&' ]{2,40}?)(?=\s+on\s+|\s+ref|\s+via|\.\s|\.$|,|$)/i,
  ];
  for (const re of patterns) {
    const m = re.exec(text);
    if (m) {
      const value = clean(m[1]);
      // Skip amounts, times, and dates captured by a loose pattern.
      if (value && !/^(rs|inr|₹)\b/i.test(value) && !/^\d/.test(value)) return value;
    }
  }
  return null;
};

const buildDate = (y, mo, d, h = 0, mi = 0, s = 0) => {
  const year = y < 100 ? 2000 + y : y;
  const date = new Date(year, mo, d, h, mi, s);
  return date.getMonth() === mo && date.getDate() === d ? date : null;
};

export const extractDate = (text) => {
  const time = /\b(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?\b/i.exec(text);
  let h = 0, mi = 0, s = 0;
  if (time) {
    h = +time[1];
    mi = +time[2];
    s = time[3] ? +time[3] : 0;
    const ampm = time[4]?.toLowerCase();
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
  }
  let m = /\b(\d{4})-(\d{2})-(\d{2})\b/.exec(text);
  if (m) return buildDate(+m[1], +m[2] - 1, +m[3], h, mi, s);
  m = /\b(\d{1,2})[-/ ]([a-z]{3,4})[a-z]*[-/ ,]+(\d{2,4})\b/i.exec(text);
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) {
    return buildDate(+m[3], MONTHS[m[2].toLowerCase()], +m[1], h, mi, s);
  }
  m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/.exec(text);
  if (m) return buildDate(+m[3], +m[2] - 1, +m[1], h, mi, s);
  return null;
};

// input: { text, title?, sourceApp?, postedAt?, includeCashWithdrawals?, includeBankAccountDebits? }
export const parseNotification = (input) => {
  const text = [input.title, input.text].filter(Boolean).join(" \n ");
  const base = { ruleId: PARSER_RULE_ID };

  for (const [reason, re] of IGNORE_RULES) {
    if (re.test(text)) return { ...base, kind: "ignore", ignoreReason: reason };
  }
  if (CASH_RE.test(text) && !input.includeCashWithdrawals) {
    return { ...base, kind: "ignore", ignoreReason: "cash-withdrawal" };
  }

  const amountMatch = AMOUNT_RE.exec(text);
  const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, "")) : null;
  const isRefund = REFUND_RE.test(text);
  const isDebit = DEBIT_RE.test(text);
  const isCredit = isRefund || (!isDebit && CREDITED_RE.test(text));

  if (!isRefund && CASHBACK_POSTING_RE.test(text)) {
    return { ...base, kind: "ignore", ignoreReason: "cashback-posting" };
  }
  // Savings/current-account debits are not card spends.
  const accountType = CARD_MENTION_RE.test(text)
    ? "card"
    : ACCOUNT_MENTION_RE.test(text)
    ? "account"
    : "unknown";
  if (accountType === "account" && !input.includeBankAccountDebits) {
    return { ...base, kind: "ignore", ignoreReason: "bank-account" };
  }

  if (!isCredit && !isDebit) {
    return {
      ...base,
      kind: "ignore",
      ignoreReason: BALANCE_RE.test(text) ? "balance-only" : "not-a-transaction",
    };
  }

  const direction = isCredit ? "credit" : "debit";
  const vpaMatch = VPA_RE.exec(text);
  const cardMatch = CARD_RE.exec(text) || MASKED_RE.exec(text);
  const cardLastFour = cardMatch ? cardMatch[1] : null;

  let merchant = extractMerchant(text);
  let channel = "card";
  let vpa = null;
  if (vpaMatch) {
    vpa = vpaMatch[1].toLowerCase();
    channel = "upi";
    if (!merchant || merchant.toLowerCase().includes(vpa)) merchant = merchantFromVpa(vpa);
  }

  const textDate = extractDate(text);
  const postedAt = input.postedAt ? new Date(input.postedAt) : new Date();
  const occurredAt = (textDate || postedAt).toISOString();

  let score = 0;
  if (amount != null) score += 1;
  if (merchant) score += 1;
  if (cardLastFour || channel === "upi") score += 1;
  if (textDate) score += 1;
  const confidence = score === 4 ? "high" : score >= 2 ? "medium" : "low";

  return {
    ...base,
    kind: direction,
    direction,
    amount,
    merchant,
    cardLastFour,
    channel,
    vpa,
    accountType,
    occurredAt,
    dateFromText: Boolean(textDate),
    confidence,
  };
};
