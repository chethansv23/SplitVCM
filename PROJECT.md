# Project guide

## Purpose

SplitVCM combines two personal-finance workflows in one mobile app:

1. Splitting a group's shared expenses evenly among its members.
2. Tracking cashback earned across configurable categories and spending caps.

## Application flow

`App.js` asks for a PIN on first run (stored in SecureStore), then unlocks with biometrics or the PIN. Once unlocked it processes captured transaction alerts, shows a **Needs review** prompt when some could not be assigned automatically, and renders two tab navigators:

- **Groups stack**: group list, group creation, and group details.
- **Cashback stack**: cashback-group list, manual group creation, group details, transaction editor, category editor, cards & cycles, card editor, review inbox, and capture & privacy settings.

Cashback screens read and write through `src/cashback/store.js` (`useCashbackState` / `updateState`), which serialises writes so screens never overwrite each other. Screens pass ids in route params, not objects.

## Local data models

### Expense group

Expense groups are stored under the `groups` AsyncStorage key. A typical record has this shape:

```js
{
  name: "Weekend trip",
  members: ["Asha", "Ravi"],
  items: [
    {
      name: "Dinner",
      amount: "1200",
      payer: "Asha",
      createdAt: "2026-09-23T12:00:00.000Z",
      deleted: false
    }
  ],
  isSettled: false
}
```

Deleted expense entries are retained with `deleted: true`, so they are excluded from totals without being removed from the stored group record.

### Cashback group (schema v1)

Stored under `cashbacks`. Cycle groups come from a card template; manual groups have `templateId: null`.

```js
{
  id: "group-…",
  name: "HSBC Live+ · 10 Sep–09 Oct 2026",
  templateId: "hsbc-live-plus-…",   // null for manual groups
  cycleStart: "2026-09-10",         // inclusive local dates; null for manual groups
  cycleEnd: "2026-10-09",
  status: "open",                   // or "closed"
  categories: [
    { id: "grocery-10", name: "10% groceries", percentage: 10, cap: null,
      keywords: ["bigbasket"], mccNotes: "", active: true, excluded: false, isDefault: false,
      totalCashback: 89, totalSpent: 899 }          // caches
  ],
  capPools: [{ id: "accelerated", name: "Accelerated 10% cap", cap: 1000, categoryIds: ["dining-10", "grocery-10"] }],
  groupCap: null,
  rounding: "per-transaction-floor", // or "cycle-total-floor", "none"
  rewardValue: 1,                    // rupees per point
  transactions: [
    { id: "tx-…", name: "BIGBASKET", amount: 899, categoryId: "grocery-10",
      occurredAt: "2026-09-14T12:35:00.000Z", cardLabel: "•••• 5678",
      sourceCandidateId: "cand-…", assignmentMode: "automatic",  // or "reviewed", "manual"
      assignmentRuleId: "keyword:grocery-10", refundOf: null, cashback: 89 }  // cashback is a cache
  ],
  totalCashback: 89, totalSpent: 899, createdAt: "…"
}
```

Cashback is **derived**: `computeCycle` sorts transactions by date and applies rate × reward value, rounding, the category cap, every cap pool the category belongs to, and the group cap, in that order. Refunds (negative amounts) claw back at most what the category has earned. Stored totals are caches that `withComputed` rewrites after every change.

### Card template

Stored under `cardTemplates`. It has the same category, pool, and cap fields, plus `cardLastFour`, `upiEnabled`, `cycle` (`{ mode: "billing-cycle", startDay }` or `{ mode: "calendar-month" }`), `merchantRules` (learned `merchantKey → categoryId`), `options` (variant or Prime), `notes`, `sourceLinks`, and `lastVerifiedAt`. A cycle group copies the template's category ids, so learned rules apply to every cycle.

### Captured alert (candidate)

Stored under `captureCandidates`: `{ id, fingerprint, source, sourceApp, rawText, receivedAt, parsed: { amount, merchant, cardLastFour, channel, vpa, occurredAt, direction, confidence }, suggestedTemplateId, suggestedGroupId, suggestedCategoryId, reviewReasons, status, duplicateSources, assignedGroupId, transactionId, resolvedAt }`. `status` is `pending-review`, `assigned`, `reviewed`, or `ignored`. `rawText` is cleared by retention.

## Key implementation details

- Shared-expense settlements calculate each member's equal share, then match debtors to creditors until balances are cleared.
- Currency is displayed in Indian rupees (`₹`).
- Data persists locally only; there is no backend, account, or cross-device synchronization.
- Expo configuration, icons, splash screen, Android package ID, and EAS project metadata live in `app.json`.

## Development conventions

- Keep screens focused on one workflow and place reusable UI in `components/`.
- Preserve the existing AsyncStorage keys. Changes to the cashback data shape need a new `CURRENT_SCHEMA_VERSION` and a migration in `src/cashback/migration.js`.
- Keep cashback logic in `src/cashback/` pure (no React Native imports) and cover it with tests; screens should only call it.
- Add real (anonymised) alert samples to the parser fixtures whenever a bank's wording isn't parsed.
- Update this guide and the README when adding new screens, storage models, scripts, or setup requirements.
