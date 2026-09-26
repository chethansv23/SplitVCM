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
  // An OTP delivery has the code next to the word. Transaction alerts often
  // end with "Never share your OTP", which must not match.
  ["otp", /\b\d{4,8}\b[^.\n]{0,30}\b(otp|one[\s-]time\s+password|verification\s+code)\b|\b(otp|one[\s-]time\s+password|verification\s+code)\b[^.\n\d]{0,20}\b\d{4,8}\b/i],
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
    // "used at MERCHANT for INR 867.00 on …" (HSBC) stops at "for INR".
    /\bat\s+(.+?)(?=\s+for\s+(?:rs\.?|inr|₹)|\s+on\s+\d|\s+on\s+\w{3}|\s+dated|\s+via|\s+using|\s+ref|\s+txn|\s+avl|\s+available|\.\s|\.$|,|;|$)/i,
    /\btowards\s+(.+?)(?=\s+for\s+(?:rs\.?|inr|₹)|\s+on\s+|\s+ref|\.\s|\.$|,|;|$)/i,
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

const buildTime = (date, hasTime) => (date ? { date, hasTime } : null);

// Returns { date, hasTime } or null. hasTime is false when the alert gives
// only a date (the time is then midnight and not meaningful).
export const extractDateTime = (text) => {
  // "2026-09-23:10:30:00" / "2026-09-23T10:30" / "2026-09-23 10:30"
  let m = /\b(\d{4})-(\d{2})-(\d{2})(?:[:T ](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(text);
  if (m) {
    return buildTime(
      buildDate(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0)),
      m[4] !== undefined
    );
  }
  // A standalone time, not part of a date like 23-09-26 or 2026-09-23.
  const time = /(?<![\d:\-/.])(\d{1,2}):(\d{2})(?::(\d{2}))?\s*(am|pm)?\b/i.exec(text);
  let h = 0, mi = 0, s = 0;
  if (time) {
    h = +time[1];
    mi = +time[2];
    s = time[3] ? +time[3] : 0;
    const ampm = time[4]?.toLowerCase();
    if (ampm === "pm" && h < 12) h += 12;
    if (ampm === "am" && h === 12) h = 0;
  }
  const hasTime = Boolean(time);
  m = /\b(\d{1,2})[-/ ]([a-z]{3,4})[a-z]*[-/ ,]+(\d{2,4})\b/i.exec(text);
  if (m && MONTHS[m[2].toLowerCase()] !== undefined) {
    return buildTime(buildDate(+m[3], MONTHS[m[2].toLowerCase()], +m[1], h, mi, s), hasTime);
  }
  m = /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})\b/.exec(text);
  if (m) return buildTime(buildDate(+m[3], +m[2] - 1, +m[1], h, mi, s), hasTime);
  return null;
};

export const extractDate = (text) => extractDateTime(text)?.date ?? null;

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

  const found = extractDateTime(text);
  const textDate = found?.date ?? null;
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
    timeFromText: Boolean(found?.hasTime),
    confidence,
  };
};
