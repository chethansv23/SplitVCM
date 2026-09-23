# Project guide

## Purpose

SplitVCM combines two personal-finance workflows in one mobile app:

1. Splitting a group's shared expenses evenly among its members.
2. Tracking cashback earned across configurable categories and spending caps.

## Application flow

`App.js` checks for biometric support and enrollment when the app starts. Once authenticated, it renders two tab navigators:

- **Groups stack**: group list, group creation, and group details.
- **Cashback stack**: cashback-group list, cashback-group creation, and cashback-group details.

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

### Cashback group

Cashback groups are stored under the `cashbacks` AsyncStorage key. A typical record has this shape:

```js
{
  id: 1760000000000,
  name: "Credit Card A",
  groupCap: 1000,
  totalCashback: 120,
  categories: [
    { name: "Recharge", percentage: 10, cap: 200, totalCashback: 120 }
  ],
  transactions: [
    { id: 1760000000001, name: "Mobile plan", amount: 1200, category: "Recharge", cashback: 120 }
  ]
}
```

Cashback is calculated from the selected category percentage, then constrained by the category cap and the group cap when present.

## Key implementation details

- Shared-expense settlements calculate each member's equal share, then match debtors to creditors until balances are cleared.
- Currency is displayed in Indian rupees (`₹`).
- Data persists locally only; there is no backend, account, or cross-device synchronization.
- Expo configuration, icons, splash screen, Android package ID, and EAS project metadata live in `app.json`.

## Development conventions

- Keep screens focused on one workflow and place reusable UI in `components/`.
- Preserve the existing AsyncStorage keys (`groups` and `cashbacks`) unless a data migration is added.
- Update this guide and the README when adding new screens, storage models, scripts, or setup requirements.
