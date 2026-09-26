# Cashback automation and card-template plan

## Goal

Extend SplitVCM so Android transaction alerts are assigned automatically to the matching card's current cashback-cycle group whenever the card and cashback category can be identified with high confidence. Only unclear deductions enter a private review inbox and prompt the user when the app opens. Every saved transaction remains editable.

The current manual transaction-entry flow remains available at all times. Automated capture handles clear matches; the user decides unclear matches and can correct any automatic result later.

## Platform and privacy decision

### Android: use notification capture first

The first implementation should use an Android **Notification Listener** in a custom Expo development build. It can read transaction notifications surfaced by the bank app, SMS app, Gmail, or another email app after the user grants notification access.

This is preferable to broad SMS access:

- It works with the notifications the user already receives.
- It can include a transaction notification from an email app when the notification contains enough detail.
- It avoids using `READ_SMS`, which has restrictive Google Play policy requirements.
- It can be disabled at any time in Android notification-access settings.

Expo Go cannot run this native feature. Development and production testing must use a custom Android development build.

### SMS and email scope

- **SMS**: capture deduction messages exposed as Android notifications. Direct SMS reading is a later optional mode only if the permission/distribution requirements are acceptable.
- **Email notifications**: capture notifications from Gmail or the chosen mail app; do not read the mailbox itself.
- **Full email reading**: out of scope for version one. It would require explicit account authorization, secure token storage, message filtering, and a separate privacy review.
- **Storage**: keep captured content locally on the phone. Store only the source text needed for review and allow it to be deleted.

### Security and privacy hardening (required before capturing bank alerts)

- **App PIN**: `App.js` currently falls back to a hardcoded PIN (`"2305"`) and stores the PIN in plain AsyncStorage. Move it to `expo-secure-store` (already installed) and require the user to set a PIN on first run.
- **Cloud backup**: Android backs up AsyncStorage to Google Drive by default. Set `android.allowBackup: false` in `app.json` (or exclude the cashback/candidate data from backup) so captured bank text never leaves the phone.
- **Raw-text retention**: delete `rawText` automatically N days (default 30) after a candidate is resolved or ignored, and offer a "delete all captured text" action.

### Android platform behaviour to handle

- **Restricted settings (Android 13+)**: a sideloaded APK (EAS `internal` distribution) cannot be granted notification access until the user enables "Allow restricted settings" in App info. The consent screen must explain this step.
- **OEM battery optimisation**: Xiaomi, Oppo, Vivo, and Samsung builds often kill notification listeners. Prompt for a battery-optimisation exemption and call `requestRebind` when the listener disconnects.
- **Where assignment runs**: the native listener only parses and queues candidates. The JS layer drains the queue and runs auto-assignment when the app opens or returns to the foreground (a headless JS task is a later option). The native queue must use its own store, not the same AsyncStorage key the JS app writes, to avoid write races.

## User flow

### 1. Collect a candidate transaction

The Android native service sends a normalized candidate to the app's local queue only when it looks like a debit/expense message.

Each candidate contains:

- Source: bank notification, SMS notification, or email notification.
- Original notification text, kept locally for review.
- Parsed amount, merchant, card suffix, transaction date/time, and debit/credit direction.
- Parser confidence and the matching rule used.
- A deterministic fingerprint for duplicate detection.

The parser should ignore OTPs, balance-only alerts, failed payments, cash withdrawals unless explicitly enabled, and duplicate notifications. Credits/refunds are not auto-assigned; see **Refunds and reversals** below.

#### Duplicate detection across sources

One swipe often produces an SMS, a bank-app notification, and a Gmail notification. The fingerprint must **not** include the source. Treat candidates as duplicates when card suffix and amount match and transaction times fall within a ±N-minute window (default 10). Keep the first candidate and attach the others' source text to it.

#### Transaction time and cycle dating

Assign a cycle using the transaction date/time parsed from the message, in the device's local time zone (IST), not the notification's arrival time. Email alerts can arrive hours later. Fall back to arrival time only when the text has no date, and lower confidence when doing so.

#### UPI on credit cards

RuPay UPI alerts (e.g. HSBC RuPay) often show a VPA such as `swiggy@icici` instead of a merchant name, and sometimes omit the card suffix. The parser needs a VPA-to-merchant mapping, and a UPI alert without a card suffix may only be auto-assigned when exactly one configured card has UPI enabled.

### 2. Assign clear matches automatically

A candidate is automatically added only when all of the following are true:

- It is confidently identified as a successful debit transaction.
- The notification identifies one configured card, preferably by its last four digits.
- The transaction date belongs to exactly one open monthly cycle group for that card.
- One active merchant/category rule matches without ambiguity.
- The matching category has a known rate and the result does not conflict with an exclusion rule.

The app then creates the cashback transaction immediately, calculates cashback against that category's and cycle's remaining caps, and records that it was auto-assigned. It does not display a popup for this case.

Any uncertain condition sends the candidate to the review inbox instead: no card match, multiple possible cards/categories, unknown merchant, missing amount, failed parsing, an excluded/ambiguous MCC rule, or a duplicate suspicion.

### 3. Review only unclear deductions on app open

When SplitVCM opens and unresolved candidates exist, show a **Needs review** modal after authentication. If every captured deduction was assigned with high confidence, do not show a popup.

For each item, show:

- Merchant, amount, card suffix, and transaction time.
- The source and the original captured text.
- Suggested card template, open cycle group, and cashback category.
- Calculated cashback, category cap remaining, and cycle cap remaining.

Available actions:

- **Add**: accept the suggestion or choose a group and category, then save.
- **Edit and add**: change merchant, amount, date, group, or category before saving.
- **No cashback**: record it in the selected group under a 0% category.
- **Skip for now**: keep it in the review inbox.
- **Ignore**: remove it from the inbox without creating a transaction.
- **Create cycle group**: when no open cycle group exists for the matched card and date, offer to create it from the template, then assign the item.

When saving a reviewed item, offer **Remember this merchant → category** (default on). This adds a merchant rule to the template so future alerts from that merchant are auto-assigned and the inbox shrinks over time.

The user can also open the inbox manually later; the popup must never block access to the rest of the app.

### Refunds and reversals

Issuers claw back cashback on refunded spends. Credit/refund alerts go to the review inbox with a **Link to original transaction** action that suggests matches by card, merchant, and amount. A linked refund is stored as a negative-amount transaction in the original's group and category, and cashback is recomputed.

### 4. Edit or move after saving

Every saved transaction remains editable from cashback group details/history. The available actions are:

- Edit merchant, amount, transaction date, card label, or cashback category.
- Move the transaction to another open or past cashback-cycle group.
- Move the transaction to another category inside the same group.
- Delete the transaction.

When a transaction moves, SplitVCM recomputes both the original and destination groups from scratch (see **Cashback calculation**), so cap room freed in the source group is correctly given back to other transactions. The original notification link and auto-assignment audit record remain attached. If the edited date is outside the destination cycle, the app should show a warning but allow the user to proceed deliberately.

## Data model additions

### Cashback calculation: derive, don't accumulate

Today `CashbackGroupDetails.js` clips each new transaction against running `totalCashback` values stored on the category and group. That gives wrong results once transactions can be edited, moved, deleted, or arrive out of order (auto-capture and late email alerts): a deleted transaction frees cap room, but earlier clipped transactions stay clipped, and totals depend on arrival order.

Replace it with a pure function:

```js
computeCycle(group) // → { perTransaction: { [txId]: cashback }, byCategory, byCapPool, total }
```

It sorts transactions by transaction date (then id), applies rates, category caps, cap pools, and the group cap in that order, and runs after every add/edit/move/delete. Cashback totals are no longer stored as mutable state; any stored values are caches only.

Rounding is a per-template setting: `rounding: "per-transaction-floor" | "cycle-total-floor" | "none"`, because issuers differ.

### Shared cap pools

Several cards share one cap across several categories (Airtel Axis: Swiggy + Zomato + BigBasket share ₹500; HSBC Live+: dining + food delivery + groceries share ₹1,000). Templates and groups gain:

```js
capPools: [{ id: "airtel-food", cap: 500, categoryIds: ["swiggy", "zomato", "bigbasket"] }]
```

### Schema migration

Existing `cashbacks` groups key categories by **name** and have no `templateId`, cycle dates, or category ids. Add `schemaVersion` to stored data and a one-time migration on app start that:

- gives every category a stable `id` and rewrites each transaction's `category` name to `categoryId`;
- adds `templateId: null`, `cycle: null`, `status: "open"` to existing groups (they stay manual groups);
- recomputes totals with `computeCycle`.

Back up the pre-migration JSON under a separate key until the migration is verified.

### Cycle group status and date edge cases

- Groups carry `status: "open" | "closed"` and explicit `cycleStart` / `cycleEnd` dates. "Open cycle group" in the auto-assignment rules means `status: "open"` and the transaction date falls inside those dates.
- `startDay` values of 29–31 clamp to the last day of shorter months.
- `cycleEnd` is inclusive and is always the day before the next cycle's start.

### Card template

Templates are reusable card definitions. They do not hold transactions themselves.

```js
{
  id: "hsbc-live-plus",
  name: "HSBC Live+",
  cardLastFour: "", // optional user-set value for matching notifications
  cycle: { startDay: 10, endDay: 10, mode: "billing-cycle" },
  categories: [],
  capPools: [],
  rounding: "per-transaction-floor",
  merchantRules: [],
  exclusions: [],
  sourceLinks: [],
  lastVerifiedAt: "2026-09-23"
}
```

### Monthly cycle group

Each template creates a separate monthly cycle group. For example, an HSBC Live+ transaction dated 14 September belongs to the cycle beginning 10 September and ending 9 October.

The app should offer a **Create current cycle** action on every template. It should also offer to create the next cycle when the prior one ends, but it must not create it silently. A group name should make the period explicit, such as `HSBC Live+ · 10 Sep–09 Oct 2026`.

### Pending deduction

```js
{
  id: "candidate-uuid",
  fingerprint: "hash-of-card-amount-time-bucket", // source excluded
  duplicateSources: [],
  source: "notification",
  sourceApp: "com.google.android.apps.messaging",
  rawText: "...",
  parsed: {
    amount: 1250,
    merchant: "Example Store",
    cardLastFour: "1234",
    occurredAt: "2026-09-23T10:30:00.000Z",
    direction: "debit"
  },
  suggestedTemplateId: "hsbc-live-plus",
  suggestedCategoryId: "live-plus-grocery",
  confidence: "medium",
  status: "pending-review"
}
```

Automatically added transactions retain `sourceCandidateId`, `assignmentMode: "automatic"`, and `assignmentRuleId`. Manually reviewed transactions retain the same source link with `assignmentMode: "reviewed"`.

## Template rules

### Common rules for every template

- All categories are user-editable: name, rate, cap, merchant keywords, MCC notes, and active status.
- Every template includes a **0% / excluded** category. This keeps excluded spends visible without inflating cashback.
- A category may be deleted only when it has no transactions. If it has transactions, the app must require the user to reassign or delete those transactions first.
- SMS/notification content rarely includes an MCC. MCC rules are guidance, not automatic classification. Merchant keywords, card suffix, payment channel, and manual confirmation determine the initial category.
- The app must show caps as configurable values, because issuers can change them.

### HDFC Bank Millennia

- Cycle: user-configurable billing-cycle start day; do not assume a date.
- 5%: Amazon, BookMyShow, Cult.fit, Flipkart, Myntra, Sony LIV, Swiggy, Tata CLiQ, Uber, and Zomato.
- 1%: other eligible spends.
- 0% / excluded: fuel, EMI, wallet loads, rent, government transactions, and any other excluded spend.
- Per-cycle cap: start at ₹1,000 for 5% and ₹1,000 for other eligible spends; keep editable.
- Note: cashback is issued as CashPoints and the issuer's posted terms refer to calendar-month posting, so the template must separate the user-selected billing cycle from issuer posting timing.

Source: [HDFC Millennia terms](https://www.hdfcbank.com/content/api/contentstream-id/723fb80a-2dde-42a3-9793-7ae1be57c87f/5d94cc09-80b7-4073-8c9f-22fad88054f0).

### HSBC Live+

- Cycle: 10th to 10th, interpreted as the 10th through the 9th of the next month.
- 10%: dining, food delivery, and groceries.
- 1.5%: other eligible spends.
- 0% / excluded: fuel, rent/property payments, insurance, cash withdrawals, credit-card repayments, tolls, and any issuer-excluded categories.
- Accelerated cashback cap: ₹1,000 per month; keep editable.

Source: [HSBC Live+ cashback guide](https://www.hsbc.co.in/credit-cards/how-does-cashback-work/).

### HSBC RuPay

- Cycle: 15th to 15th, interpreted as the 15th through the 14th of the next month.
- Start with editable categories: base eligible spend, UPI/merchant offer, promotional offer, and 0% / excluded.
- Rates and caps: intentionally blank until the exact HSBC RuPay card variant and its current benefits are confirmed.

This avoids applying an incorrect reward structure to a card whose terms are variant-specific.

### Airtel Axis Bank Credit Card

- Cycle: 12th to 12th, interpreted as the 12th through the 11th of the next month.
- 25%: active Airtel mobile, broadband, Wi-Fi, and DTH bill payments through Airtel Thanks; cap ₹250 per statement cycle.
- 10%: eligible utility payments through Airtel Thanks; cap ₹250 per statement cycle.
- 10%: eligible Swiggy, Zomato, and BigBasket app spends; combined cap ₹500 per statement cycle.
- 1%: other eligible spends.
- 0% / excluded: utility payments outside Airtel Thanks and issuer-excluded merchant/category cases.

Source: [Airtel Axis cashback terms](https://www.axisbank.com/docs/default-source/default-document-library/credit-cards/terms-and-conditions-for-cashback-for-airtel-axis-bank-credit-card.pdf/1000).

### PhonePe SBI Card

- Cycle: calendar month, 1st through last day of the month.
- Variant selector: **PURPLE** or **SELECT BLACK**. The exact card variant must be selected before creating the group.
- PURPLE starting rules: 3% PhonePe/Pincode eligible spends, 2% eligible online spends, 1% other eligible spends.
- SELECT BLACK starting rules: 10% PhonePe/Pincode eligible spends, 5% eligible online spends, 1% other eligible spends.
- 0% / excluded: issuer-excluded categories and transactions that do not meet the offer channel rules.
- Reward value: track as ₹1 per reward point only where statement-credit redemption is applicable; retain an editable reward-to-rupee value field.

The issuer has announced revisions to PhonePe SBI Card benefits, so these categories must be confirmed against the exact card's current terms before relying on them.

Sources: [PhonePe card benefits](https://www.phonepe.com/credit-cards/phonepe-sbi-card-purple-credit-card/) and [SBI Card notices](https://www.sbicard.com/en/customer-notices.page).

### Amazon Pay ICICI Bank Credit Card

- Cycle: 12th to 12th, interpreted as the 12th through the 11th of the next month.
- 5%: eligible Amazon shopping and Amazon Pay travel bookings for Prime members.
- 3%: corresponding eligible Amazon spends for non-Prime members.
- 2%: eligible partner merchants; leave the merchant list editable.
- 1%: other eligible spends.
- 0% / excluded: issuer-excluded spend categories.
- Prime status: a required template setting, because it changes the Amazon rate.

Source: [ICICI Bank Amazon Pay partnership update](https://www.icici.bank.in/about-us/news-room/2025/amazon-pay-and-icici-bank-renew-partnership-enhance-indias-most-adopted-co-branded-credit-card).

## Implementation phases

### Phase 1: data and manual experience

1. Move the PIN to SecureStore, remove the hardcoded default, and disable Android cloud backup.
2. Add `schemaVersion`, category ids, and the one-time migration of existing groups.
3. Replace incremental cashback with `computeCycle`, including cap pools and per-template rounding.
4. Add reusable card templates and monthly cycle-group creation.
5. Add category deletion with reassignment protection.
6. Add a transaction history editor, transaction move flow, and 0% category.
7. Add JSON export/import of all local data (a lost phone otherwise means lost history).
8. Preserve all existing manual cashback-group behaviour.

### Phase 2: review inbox

1. Add pending-deduction storage, duplicate detection, parser interface, confidence rules, and review modal.
2. Add manual paste/import of an SMS or notification for testing.
3. Auto-assign high-confidence matches to their current cashback-cycle group; show the review modal only for unresolved matches.
4. Add card/category suggestions and full edit-before-save support.
5. Add "Remember this merchant → category", "Create cycle group" from the inbox, and refund linking.
6. Set up Jest with a fixtures folder of anonymised real alert texts per bank and source; every parser change must pass these tests, since banks reword messages without notice.

### Phase 3: Android capture

1. Create an Expo native module for Android notification access.
2. Build and install an Android development build; Expo Go will not be used for this feature.
3. Add an in-app consent/explanation screen (including the restricted-settings and battery-optimisation steps) and source-app allowlist.
4. Test with bank SMS, bank-app notification, and Gmail notification examples supplied by the user.

### Phase 4: optional direct SMS and email integrations

Evaluate direct SMS or mailbox APIs only after Phase 3 proves insufficient. These require additional privacy, permission, and distribution decisions.

## Decisions already made

- Platform: Android.
- Capture preference: SMS notifications, bank notifications, and email notifications where they contain transaction details.
- Review model: automatically add high-confidence matches; request review only for uncertain matches.
- Fallback: manual entry remains supported.
- Group model: one manually created cycle group per card per month, generated from editable templates.

## Remaining confirmations before implementation

1. Provide the exact HSBC RuPay card variant/name and current reward/cashback terms.
2. Choose PhonePe SBI variant: PURPLE or SELECT BLACK.
3. Provide the billing-cycle start day for HDFC Millennia.
4. Provide the last four digits of each card only if you want automatic matching; they stay local on the phone.
5. Confirm whether an unclassified deduction should stay in **Needs review** (recommended) or be placed automatically in 0% / excluded.
6. Provide 2–3 sample alert texts per card and source (SMS, bank app, email), anonymised, for parser fixtures.
7. Choose distribution: Play Store (requires a prominent disclosure for notification access) or sideloaded APK (requires the restricted-settings step).
8. Confirm rounding behaviour and refund clawback handling for each card.

## Implementation status (2026-09-26)

Phases 1–3 are implemented; see the README for usage and tests.

- **Phase 1**: done. The PIN is in SecureStore with no default, `allowBackup: false`, schema v1 migration (the original data is kept in `cashbacks_backup_v0`), `computeCycle` with cap pools and rounding, card templates and cycle groups, category protection, the transaction editor and move flow, JSON export/import.
- **Phase 2**: done. Parser with fixtures, duplicate detection across sources, auto-assign vs review, the review inbox and prompt on app open, remembered merchant rules, creating a cycle group from the inbox, refund linking, and "Paste an alert to test".
- **Phase 3**: code complete (`modules/notification-capture`) but **not yet built or tested on a device**. No Android toolchain was available on the machine it was written on. Verify with a development build and real alerts.
- **Phase 4**: not started, by design.

Decisions taken where confirmations were still open (all can be changed in the app):

- HSBC RuPay rates are left blank, so its transactions stay in review until you set rates (confirmation 1).
- The PhonePe SBI variant and Amazon Prime status are chosen when the card is added (confirmations 2 and 8).
- HDFC Millennia has no default cycle start day; you must set one before creating a cycle (confirmation 3).
- Unclassified deductions stay in **Needs review**, and the default category is only suggested (confirmation 5).
- A merchant that matches an exclusion keyword goes to review. Once you remember a rule for it, later alerts are filed as 0% automatically.
- Savings-account debits (alerts that mention an account but not a card) are dropped by default, so they don't fill the inbox. A UPI alert without a card suffix is matched to a UPI-enabled card only when the alert mentions a card. There is a setting to include account debits.
- Two genuine identical spends on the same card within the duplicate window (10 minutes by default) are merged. The window can be changed in settings.
