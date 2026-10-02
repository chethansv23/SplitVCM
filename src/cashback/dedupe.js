import { toDateKey } from "./dates";

// One swipe often produces an SMS, a bank-app notification, and an email
// notification. The source is deliberately not part of the identity.

export const DEFAULT_DUPLICATE_WINDOW_MINUTES = 10;

export const fingerprint = (parsed, windowMinutes = DEFAULT_DUPLICATE_WINDOW_MINUTES) => {
  const bucket = Math.floor(
    new Date(parsed.occurredAt).getTime() / (windowMinutes * 60 * 1000)
  );
  const amount = parsed.amount == null ? "na" : Number(parsed.amount).toFixed(2);
  return `${parsed.cardLastFour || parsed.vpa || "na"}|${amount}|${parsed.direction}|${bucket}`;
};

const merchantKey = (m) => String(m || "").toLowerCase().replace(/[^a-z0-9]/g, "");

// "Swiggy" and "SWIGGY INSTAMART" can be the same merchant written two
// ways; "AMINAREDDY" and "MM Chalukya Pani Puri Corner" cannot.
const sameMerchant = (a, b) => {
  const ka = merchantKey(a);
  const kb = merchantKey(b);
  return !ka || !kb || ka.includes(kb) || kb.includes(ka);
};

export const isDuplicate = (a, b, windowMinutes = DEFAULT_DUPLICATE_WINDOW_MINUTES) => {
  if (a.amount == null || b.amount == null) return false;
  if (Math.abs(a.amount - b.amount) >= 0.01) return false;
  if (a.direction !== b.direction) return false;
  const cardA = a.cardLastFour || null;
  const cardB = b.cardLastFour || null;
  // Only compare cards when both alerts name one; an email may omit it.
  if (cardA && cardB && cardA !== cardB) return false;
  // A bank reference (UPI ref, RRN) identifies one payment exactly.
  if (a.reference && b.reference) return a.reference === b.reference;
  if (!sameMerchant(a.merchant, b.merchant)) return false;
  // An alert that gives only a date (no time) matches on the same day.
  if (a.dateFromText && b.dateFromText && (a.timeFromText === false || b.timeFromText === false)) {
    return toDateKey(a.occurredAt) === toDateKey(b.occurredAt);
  }
  const diff = Math.abs(new Date(a.occurredAt) - new Date(b.occurredAt));
  return diff <= windowMinutes * 60 * 1000;
};

const SAME_ARRIVAL_MS = 60 * 1000;

// `incoming` is { sourceApp, rawText, postedAt } of the new alert. Duplicates
// are the same spend reported by different apps (SMS and email). From the
// same app, only the same message delivered twice is a duplicate: identical
// text that arrived at the same time. Two real ₹100 spends at one shop give
// identical text too, but arrive at different times.
export const findDuplicateCandidate = (parsed, candidates, windowMinutes, incoming = {}) =>
  candidates.find((c) => {
    if (!c.parsed) return false;
    if (incoming.sourceApp && c.sourceApp === incoming.sourceApp) {
      if (c.rawText == null || c.rawText !== incoming.rawText) return false;
      // Alerts stored before arrival times were kept can't be told apart.
      if (!c.postedAt || !incoming.postedAt) return true;
      return Math.abs(new Date(c.postedAt) - new Date(incoming.postedAt)) <= SAME_ARRIVAL_MS;
    }
    return isDuplicate(parsed, c.parsed, windowMinutes);
  });
