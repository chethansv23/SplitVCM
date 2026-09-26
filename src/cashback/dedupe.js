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

export const isDuplicate = (a, b, windowMinutes = DEFAULT_DUPLICATE_WINDOW_MINUTES) => {
  if (a.amount == null || b.amount == null) return false;
  if (Math.abs(a.amount - b.amount) >= 0.01) return false;
  if (a.direction !== b.direction) return false;
  const cardA = a.cardLastFour || null;
  const cardB = b.cardLastFour || null;
  // Only compare cards when both alerts name one; an email may omit it.
  if (cardA && cardB && cardA !== cardB) return false;
  const diff = Math.abs(new Date(a.occurredAt) - new Date(b.occurredAt));
  return diff <= windowMinutes * 60 * 1000;
};

export const findDuplicateCandidate = (parsed, candidates, windowMinutes) =>
  candidates.find((c) => c.parsed && isDuplicate(parsed, c.parsed, windowMinutes));
