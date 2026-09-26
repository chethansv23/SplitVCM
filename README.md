# SplitVCM

SplitVCM is an Expo-powered React Native app for keeping track of shared expenses and credit-card cashback. On Android it can also read your card's transaction alerts (SMS, bank-app, and email notifications) and file them into the right cashback cycle automatically.

## Features

**Shared expenses**

- Create expense groups, add members, and record who paid what.
- Calculate equal-share settlements and mark groups as settled.

**Cashback tracking**

- Card templates for HDFC Millennia, HSBC Live+, HSBC RuPay, Airtel Axis, PhonePe SBI (PURPLE / SELECT BLACK), and Amazon Pay ICICI (Prime / non-Prime), plus custom cards. Every rate, cap, keyword, and cycle is editable.
- One cycle group per card per billing cycle (for example `HSBC Live+ · 10 Sep–09 Oct 2026`), created on request. The app offers the next cycle when one ends, but never creates it silently.
- Category caps, shared cap pools (such as Airtel Axis's combined ₹500 for Swiggy, Zomato, and BigBasket), an overall cycle cap, per-card rounding, and a reward-point value.
- Cashback is recalculated from scratch after every change, so edits, moves, deletions, refunds, and late alerts always give the same result.
- Edit any transaction, or move it to another cycle or category. You get a warning if its date is outside the destination cycle.
- Link an existing manual group to its card's last four digits and billing cycle (**Track this card automatically**), so alerts are added to it.
- A 0% / excluded category on every card. Categories that still hold transactions can only be deleted after those transactions are reassigned.
- Manual cashback groups work as before.

**Automatic capture (Android development build)**

- Reads transaction notifications from apps you allow (Messages, Gmail, bank apps). It does not use SMS permissions.
- Clear alerts are added automatically. Unclear ones go to a **Needs review** inbox, and the app prompts you when it opens.
- Review actions: Add, Edit and add, No cashback, Skip, Ignore, Create cycle group, and Link refund.
- "Remember this merchant" teaches the card a rule, so the next alert from that merchant is added automatically.
- Alerts that arrived before their card or cycle was set up are re-checked and moved in automatically once it is.
- The same spend arriving by SMS, app notification, and email is recorded only once.
- **Paste an alert** runs any text through the same pipeline. It works in Expo Go too.

**Security and privacy**

- Unlock with fingerprint, or with a PIN stored in the device keystore (SecureStore). On first run you choose a PIN; there is no default.
- All data stays on the phone. Android cloud backup is disabled.
- Captured alert text is deleted automatically after 30 days (you can change this), and can be deleted immediately.
- JSON export and import for moving to a new phone.

## Requirements

- Node.js 20 or later, and npm
- Expo Go on a phone, or an Android/iOS emulator, for everything except automatic capture
- For automatic capture: an Android phone with a **development build** of SplitVCM (see below)

## Getting started

```bash
npm install
npm start
```

Scan the QR code with Expo Go, or press `a` for an Android emulator. On first launch, choose a PIN.

| Command | Description |
| --- | --- |
| `npm start` | Start the Expo development server. |
| `npm run android` | Start Expo and open Android. |
| `npm run ios` | Start Expo and open iOS. |
| `npm run web` | Start Expo for the web. |
| `npm test` | Run the unit and screen tests (Jest). |
| `npm run test:watch` | Re-run tests on file changes. |

## Setting up cashback tracking

1. Open **Cashback → Cards & cycles → Add a card** and pick your card (and its variant or Prime status where asked).
2. On the card screen:
   - Enter the **last four digits** if you want alerts matched automatically. They are stored only on this phone.
   - Set the **billing-cycle start day**. HDFC Millennia has no default, so you must enter it.
   - Enable **UPI** for a RuPay card that you use for UPI payments.
3. Tap **Create current cycle**.
4. Add transactions manually, or turn on automatic capture.

**Already have a manual group?** Open it and tap **Track this card automatically** in its *Card* section. Enter the card's last four digits and billing cycle; the group becomes that card's current cycle and keeps its categories. You can also enter the digits when creating a manual group. An alert that says "No configured card matches" has a **Set up card •••• 1234** button that takes you to the right place.

Card rates and caps are starting values from the issuers' published terms (links are on each card screen). Issuers change them, so check them and tap **Mark terms verified today**. After you edit a card, use **Apply to open cycles** to update cycles that already exist.

## Automatic capture on Android

Notification capture uses a custom native module (`modules/notification-capture`). **Expo Go cannot run it**, so you need a development build.

### Build and install

With EAS (builds in the cloud; no Android Studio needed):

```bash
npm install -g eas-cli
eas login
eas build --profile development --platform android
```

Install the APK it produces, then start the dev server for that build:

```bash
npx expo start --dev-client
```

Alternatively, to build locally, install Android Studio (which provides the JDK and SDK) and run:

```bash
npx expo run:android
```

### Turn it on

Open **Cashback → Settings → Capture & Privacy**:

1. Switch on **Capture transaction alerts** and accept the explanation.
2. **Sideloaded APK on Android 13 or later:** open **App info → ⋮ → Allow restricted settings** first. Android blocks notification access for sideloaded apps until you do this.
3. Tap **Open notification access** and enable SplitVCM.
4. Tap **Open battery settings** and set SplitVCM to *Unrestricted* / *Don't optimise*. Xiaomi, Oppo, Vivo, and Samsung phones otherwise stop the listener.
5. Check **Allowed apps**. Messages, Gmail, Outlook, and common bank apps are allowed by default. If a bank app posts transaction alerts but isn't on the list, its package name appears under *Transaction-like alerts seen from* with an **Allow** button.

Captured alerts are processed each time the app opens or returns to the foreground. Use **Process captured alerts now** to process them immediately.

### How an alert is handled

```text
notification ──► native listener (allowlisted app + looks like a transaction?) ──► native queue
                                                                                      │
app opens / foregrounds ◄─────────────────────────────────────────────────────────────┘
  └─► parse (amount, merchant, card suffix, date, UPI handle)
        ├─ OTP / failed / balance-only / bill payment / cashback posting / promo /
        │  bank-account (non-card) debit ─► dropped (account debits can be enabled)
        ├─ duplicate of an earlier alert (±10 min) ─► merged, not recorded again
        └─ decide
             ├─ one card, one open cycle, one category, known rate, high confidence ─► added automatically
             └─ anything uncertain ─► Needs review inbox (with a suggestion)
```

An alert goes to review, rather than being added automatically, if any of the following apply:

- It is a credit or refund.
- The amount is missing.
- The alert was only partly understood (for example, it had no date).
- No card or several cards match.
- There is no open cycle or several.
- The merchant is unknown or matches several categories.
- It matches an exclusion rule.
- The category's rate isn't set.
- It looks like a transaction you already entered manually.

### Testing without a build

Under **Capture & Privacy → Paste an alert to test**, paste any SMS or notification text and choose its source. It goes through exactly the same pipeline.

## Tests

```bash
npm test
```

323 tests in 24 files, about 96% of lines covered. The suites cover:

| Suite | Tests | What it checks |
| --- | ---: | --- |
| `src/cashback/__tests__/parser.test.js` | 33 | Sample alerts per bank (`__tests__/fixtures/alerts.js`, including real HSBC wording with digits changed), ignored message types (OTP, failed, bill payment, cashback posting, bank-account debit), date and time formats, UPI handles |
| `negative.test.js` | 56 | Things that must not happen: non-transaction texts captured, auto-add when unsure, false duplicates; bad IDs, amounts, cycles, cards and backups rejected without changing data |
| `inbox.test.js` | 25 | Capture pipeline, duplicates across sources (including date-only alerts), every review action, retention, failed-alert recovery, re-checking waiting alerts after a card or cycle is set up |
| `matcher.test.js` | 20 | Auto-add vs each review reason, learned rules, UPI matching |
| `compute.test.js` | 14 | Rates, category caps, cap pools, group cap, refunds, rounding modes, arrival order |
| `templates.test.js` | 14 | Card catalogue, variants, cycle groups, next-cycle offers, applying card edits |
| `trackGroup.test.js` | 13 | Linking a manual group to its card digits and cycle, alerts reaching it afterwards, invalid or duplicate digits |
| `groups.test.js` | 12 | Edit, move and delete with recalculation; category deletion protection |
| `cycles.test.js` | 11 | Statement and calendar cycles, start days 29–31, year boundaries, IST midnight |
| `migration.test.js` | 11 | Upgrading data from the original app version, backup export and import |
| `captureDiagnostics.test.js` | 7 | Each "Capture status" message |
| `store.test.js` | 6 | One-time migration, ordered writes, retry after a failed load, unreadable old data |
| `capture.test.js` | 6 | Native queue → pipeline, Expo Go behaviour, consent-gated listener config, pasted alerts |
| `src/auth/__tests__/pin.test.js` | 8 | PIN rules, SecureStore, legacy PIN migration |
| `src/groups/__tests__/settlement.test.js` | 6 | Expense-split totals and settlements, including uneven decimal splits |
| `modules/notification-capture/__tests__/index.test.js` | 3 | JS wrapper with and without the native module |
| `components/__tests__/select.test.js` | 4 | The in-app dropdown: the chosen value is visible in a fixed colour (dark-mode regression), open, choose, cancel |
| `screens/__tests__/reviewAndSettings.test.js` | 22 | Every review action, "Set up card" shortcut, Capture & Privacy (consent, setup steps, allowed apps, paste test, backup) |
| `screens/__tests__/cards.test.js` | 16 | Cashback list, Cards & cycles, card editor, setting up a card from a review item |
| `screens/__tests__/groupScreens.test.js` | 16 | Group screen actions, linking a manual group to its card, expense-split screens |
| `screens/__tests__/editors.test.js` | 11 | Category and transaction editors, moving between cycles |
| `screens/__tests__/cashbackScreens.test.js` | 4 | Review inbox, group details, manual category edit and delete |
| `__tests__/App.test.js`, `App.review.test.js` | 5 | PIN setup and unlock, when the "Needs review" prompt appears |

Shared mocks (AsyncStorage) live in `jest.setup.js`; screen helpers (`seed`, `mockAlerts`, `choose`) are in `screens/__tests__/testUtils.js`. For a coverage report:

```bash
npx jest --coverage
```

The tests run on your computer, not on a phone. They check behaviour and what text appears, but not how Android draws a screen (for example in dark mode), so give each new build a quick look on the device.

Tests run in the `Asia/Kolkata` time zone (`jest.global-setup.js`) so cycle boundaries match the phone.

**Add your own alerts.** Real bank wording varies. Add anonymised copies of your alerts (remove your name, balances, and reference numbers) to `src/cashback/__tests__/fixtures/alerts.js`, along with the values you expect, and run `npm test`. If one fails, adjust the patterns in `src/cashback/parser.js`.

The Kotlin listener cannot be unit-tested here. Check it on a device with a development build.

## Data and storage

All data is local. AsyncStorage keys:

| Key | Contents |
| --- | --- |
| `groups` | Expense groups |
| `cashbacks` | Cashback groups (cycle and manual) |
| `cardTemplates` | Your cards |
| `captureCandidates` | Captured alerts and their review status |
| `captureSettings` | Capture on/off, consent, allowed apps, retention |
| `cashbackSchemaVersion` | Data format version (currently `1`) |
| `cashbacks_backup_v0` | Your cashback data as it was before the one-time upgrade |

The PIN is stored in SecureStore, not AsyncStorage. The native listener keeps its queue in a separate SharedPreferences file (`splitvcm_capture`) until the app reads it.

When you update from the original version, existing cashback groups are upgraded once: categories get IDs, and totals are recalculated. The original data is kept under `cashbacks_backup_v0`. Totals can change slightly because the old running totals could drift after deletions.

## Project structure

```text
.
├── App.js                         # PIN/biometric unlock, navigation, capture sync, review prompt
├── screens/
│   ├── GroupsScreen.js            # Expense-group list
│   ├── CreateGroupScreen.js       # Expense-group creation
│   ├── GroupDetailsScreen.js      # Expenses and settlements
│   ├── CashbackScreen.js          # Cashback-group list, review/cards/settings entry points
│   ├── CreateCashbackGroup.js     # Manual cashback group
│   ├── CashbackGroupDetails.js    # Cycle totals, caps, categories, transactions
│   └── cashback/
│       ├── CardTemplatesScreen.js # Cards, current/next cycle creation
│       ├── TemplateEditor.js      # Card settings, cap pools, learned rules
│       ├── CategoryEditor.js      # Category edit/delete (group or card)
│       ├── TransactionEditor.js   # Edit or move a transaction
│       ├── TrackCardScreen.js     # Link a manual group to its card digits and cycle
│       ├── ReviewInbox.js         # Needs review inbox
│       └── CaptureSettings.js     # Capture setup, allowlist, paste test, privacy, backup
├── src/
│   ├── auth/pin.js                # SecureStore PIN
│   └── cashback/                  # Pure logic (all unit-tested) + store
│       ├── compute.js             # computeCycle: derived cashback
│       ├── cycles.js, dates.js    # Cycle date maths
│       ├── templates.js           # Card catalogue, cycle groups
│       ├── parser.js              # Alert parser
│       ├── matcher.js             # Auto-assign vs review decision
│       ├── dedupe.js              # Cross-source duplicate detection
│       ├── inbox.js               # Capture pipeline, review actions, retention
│       ├── groups.js              # Transaction/category operations
│       ├── migration.js, backup.js
│       ├── store.js               # AsyncStorage-backed state with serialised writes
│       └── capture.js             # Bridges the native queue to the pipeline
├── modules/notification-capture/  # Android NotificationListenerService (Expo module, Kotlin)
├── components/                    # Cashback UI (buttons, fields, in-app dropdown), card tracking fields
├── app.json                       # Expo config (allowBackup: false)
└── jest.config.js
```

See [PROJECT.md](PROJECT.md) for data models, [CASHBACK_AUTOMATION_PLAN.md](CASHBACK_AUTOMATION_PLAN.md) for the design and its remaining open questions, and [docs/system-design.html](docs/system-design.html) (open in a browser) for the system design with diagrams.

## Notes

- The Android application identifier is `com.sbchethan235.SplitVCM`.
- Automatic capture is Android-only. iOS doesn't let apps read other apps' notifications.
- Direct SMS reading and mailbox access (plan Phase 4) are deliberately not implemented.
