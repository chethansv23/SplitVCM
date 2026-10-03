// Recall: a real card spend must never be skipped. False positives (extra
// alerts to review) are acceptable; missed spends are not. Every alert in
// fixtures/corpus.js must pass both gates:
//   1. the Android listener's quick filter (regexes read from the Kotlin file)
//   2. the app's parser and capture pipeline
import { ingestMany, pendingCandidates } from "../inbox";
import { parseNotification } from "../parser";
import { FOREIGN_SPENDS, NOT_SPENDS, VALID_SPENDS } from "./fixtures/corpus";

const { looksLikeTransaction, PATTERNS, source } = require("./nativeGate");

const POSTED = new Date(2026, 9, 3, 12, 0).toISOString();
const SMS_APP = "com.google.android.apps.messaging";
const ALL_SPENDS = [...VALID_SPENDS, ...FOREIGN_SPENDS];
const cases = (list) => list.map((s) => [s.bank, s]);

test("the test mirrors the Kotlin filter exactly", () => {
  expect(source).toContain(
    "AMOUNT.containsMatchIn(text) && (KEYWORD.containsMatchIn(text) || CONTEXT.containsMatchIn(text))"
  );
  expect(PATTERNS.AMOUNT && PATTERNS.KEYWORD && PATTERNS.CONTEXT && PATTERNS.HIDDEN).toBeTruthy();
});

describe("gate 1: the Android listener queues every real spend", () => {
  test.each(cases(ALL_SPENDS))("%s", (_, s) => {
    expect(looksLikeTransaction(s.text)).toBe(true);
  });

  test("…including with the SMS sender as the notification title", () => {
    for (const s of ALL_SPENDS) expect(looksLikeTransaction(`VM-HSBCIN-S ${s.text}`)).toBe(true);
  });

  test("a chat message without an amount is not queued", () => {
    expect(looksLikeTransaction("Are we meeting at the card shop at 7?")).toBe(false);
  });
});

describe("gate 2: the parser keeps every real spend with the right amount", () => {
  test.each(cases(VALID_SPENDS))("%s", (_, s) => {
    const p = parseNotification({ text: s.text, postedAt: POSTED });
    expect(p.kind).toBe("debit");
    expect(p.amount).toBe(s.amount);
    expect(p.currency).toBe("INR");
  });

  test.each(cases(FOREIGN_SPENDS))("foreign currency kept for review: %s", (_, s) => {
    const p = parseNotification({ text: s.text, postedAt: POSTED });
    expect(p.kind).toBe("debit");
    expect(p.currency).not.toBe("INR");
    expect(p.amount).toBeNull(); // not the "Avl Limit INR" figure
  });

  test("card digits are found whenever the alert has them", () => {
    const withoutDigits = new Set(["OneCard short", "Scapia Federal"]);
    for (const s of VALID_SPENDS.filter((x) => !withoutDigits.has(x.bank))) {
      expect([s.bank, parseNotification({ text: s.text }).cardLastFour]).toEqual([s.bank, expect.stringMatching(/^\d{4}$/)]);
    }
  });
});

describe("variations that must not cause a skip", () => {
  const variants = {
    "Android's hidden-text placeholder before it": (t) => `Sensitive notification content hidden\n${t}`,
    "the placeholder after it": (t) => `${t}\nSensitive notification content hidden`,
    "a sender-ID title": (t) => `JD-SBICRD-S\n${t}`,
    "upper case": (t) => t.toUpperCase(),
    "lower case": (t) => t.toLowerCase(),
    "extra line breaks and spaces": (t) => t.replace(/ /g, "  ").replace(/\. /g, ".\n\n"),
  };
  test.each(Object.entries(variants))("%s", (_, vary) => {
    for (const s of VALID_SPENDS) {
      const text = vary(s.text);
      expect([s.bank, looksLikeTransaction(text)]).toEqual([s.bank, true]);
      const p = parseNotification({ text, postedAt: POSTED });
      expect([s.bank, p.kind, p.amount]).toEqual([s.bank, "debit", s.amount]);
    }
  });

  test("the bank-account setting being off never drops a card spend", () => {
    for (const s of VALID_SPENDS) {
      const p = parseNotification({ text: s.text, includeBankAccountDebits: false });
      expect([s.bank, p.ignoreReason]).toEqual([s.bank, undefined]);
    }
  });
});

describe("the whole pipeline", () => {
  test("every real spend arriving as its own SMS is recorded — none ignored or merged", () => {
    const state = { groups: [], templates: [], candidates: [], settings: {} };
    const raws = ALL_SPENDS.map((s, i) => ({
      text: s.text,
      sourceApp: SMS_APP,
      postedAt: new Date(2026, 9, 3, 8, i).toISOString(),
    }));
    const { state: next, summary } = ingestMany(state, raws, new Date(2026, 9, 3, 20));
    expect(summary.ignored).toBe(0);
    expect(summary.duplicate).toBe(0);
    expect(next.candidates).toHaveLength(ALL_SPENDS.length);
    // With no cards set up, every one waits in review rather than vanishing.
    expect(pendingCandidates(next)).toHaveLength(ALL_SPENDS.length);
  });
});

describe("clear non-spends are still ignored (not required, but checked)", () => {
  test.each(NOT_SPENDS.map((s) => [s.kind, s]))("%s", (_, s) => {
    expect(parseNotification({ text: s.text }).kind).toBe("ignore");
  });
});
