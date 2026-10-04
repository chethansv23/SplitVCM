# SplitVCM

SplitVCM is an Expo-powered React Native app for keeping track of shared expenses and credit-card cashback. On Android it can also read your card's transaction alerts (SMS, bank-app, and email notifications) and file them into the right cashback cycle automatically.

## Features

**Shared expenses**

- Create expense groups, add members, and record who paid what.
- Calculate equal-share settlements and mark groups as settled.

**Cashback tracking**

- Card templates for HDFC Millennia, HSBC Live+, HSBC RuPay, Airtel Axis, PhonePe SBI (PURPLE / SELECT BLACK), and Amazon Pay ICICI (Prime / non-Prime), plus custom cards. Every rate, cap, keyword, and cycle is editable.
- One cycle group per card per billing cycle (for example `HSBC Live+ · 10 Sep–09 Oct 2026`), created on request. The app offers the next cycle when one ends, but never creates it silently.
- How cashback is calculated, per card or group, set in a popup: no round-off, or round off per ₹ value — 1 rounds each spend down (HSBC), 100 counts only whole ₹100 (SBI), and any other value (120, 150 …) works the same way. A cashback calculator on each group lets you change the amount, rate and round-off to see what a spend would earn.
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
- The same spend arriving by SMS, app notification, and email is recorded only once. Two spends of the same amount on the same day stay separate when their UPI/bank references or merchants differ, or when they are two SMS that arrived at different times (even with identical text).
- Loan and limit offers ("pre-approved loan limit", "instant loan", "limit increased") and cashback or reward offers ("You've earned ₹75 cashback… claim it") are ignored, unless the text is clearly a spend ("spent", "debited", "used at"). A notification that bundles several messages is split into separate alerts.
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

## How cashback is calculated

Tap **How cashback is calculated** on a card, a group, or when creating a manual group. In the popup, choose:

- **No round-off**: exact cashback, to the paisa.
- **Round off per ₹ [value]**: the spend is counted in full steps of the value, then the cashback is rounded down.

| Value | 10% on ₹325.50 | Typical card |
| --- | --- | --- |
| 1 | ₹32 (each spend rounded down) | HSBC |
| 100 | ₹30 (counts ₹300) | SBI |
| 120 | ₹24 (counts ₹240) | — |
| 150 | ₹30 (counts ₹300) | — |
| No round-off | ₹32.55 | — |

Changing it on a group recalculates that group's transactions. On a card, it applies to new cycles; use **Apply to open cycles** to update existing ones.

The **Cashback calculator** on each group lets you change the spend amount, rate (filled in from a category) and round-off, and shows the cashback and caps left. Nothing is saved.

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

SplitVCM reads the **notification** an SMS, bank or email app shows, not your SMS inbox (it has no SMS permission). Newer Android versions sometimes hide a notification's text from apps like SplitVCM ("Sensitive notification content hidden"), usually when they think it contains a one-time code; SplitVCM reads every field of the notification so the text is usually still found, and Capture status counts the ones it couldn't read ("Text hidden by Android"). For those, copy the SMS and use **Paste an alert to test**. An alert is captured only if it produces a notification, so muted conversations aren't read. If alerts don't arrive, **Capture status** lists the last few texts the listener skipped from allowed apps (long numbers hidden), which shows what Android actually passed on.

Many bank alerts give only a date ("on 27 Sep 2026"). When the notification arrived that same day, its arrival time is used as the transaction time and shown as "(time received)"; otherwise the review card says "(no time in alert)".

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

564 tests in 28 files, about 96% of lines covered. The suites cover:

| Suite | Tests | What it checks |
| --- | ---: | --- |
| `src/cashback/__tests__/parser.test.js` | 38 | Sample alerts per bank (`__tests__/fixtures/alerts.js`, including real HSBC wording with digits changed), ignored message types (OTP, failed, bill payment, cashback posting, bank-account debit), date and time formats, arrival time for date-only alerts, UPI handles |
| `negative.test.js` | 56 | Things that must not happen: non-transaction texts captured, auto-add when unsure, false duplicates; bad IDs, amounts, cycles, cards and backups rejected without changing data |
| `v130.test.js` | 31 | 1.3.0 fixes: round-off per ₹ value (1/100/120/150) or none, the popup model, same-amount spends kept separate, loan and limit offers ignored |
| `recall.test.js` | 128 | **No real spend skipped**: every alert in `__tests__/fixtures/corpus.js` (55 formats from 17 banks and card apps, plus foreign currency) must pass the Android listener's filter — read from the Kotlin source — and the parser, including with Android's hidden-text placeholder, sender IDs, case and spacing changes; the whole pipeline records all of them |
| `v131.test.js` | 16 | 1.3.1 fixes: real HSBC and SBI spends read (including next to Android's hidden-text placeholder), reward/cashback offers ignored while real spends that mention cashback are kept, Capture status after Reset counters and for hidden text |
| `v130.edge.test.js` | 45 | 1.3.0 retest: round-off with caps, pools, refunds, reward points, old data and bad values; round-off kept through cards, linking and backups; duplicates in every direction (references, merchants, days, same SMS delivered twice vs two real spends); reference formats |
| `inbox.test.js` | 26 | Capture pipeline, duplicates across sources, every review action, retention, failed-alert recovery, re-checking waiting alerts |
| `matcher.test.js` | 20 | Auto-add vs each review reason, learned rules, UPI matching |
| `compute.test.js` | 14 | Rates, category caps, cap pools, group cap, refunds, arrival order |
| `templates.test.js` | 14 | Card catalogue, variants, cycle groups, next-cycle offers, applying card edits |
| `trackGroup.test.js` | 13 | Linking a manual group to its card digits and cycle |
| `groups.test.js` | 12 | Edit, move and delete with recalculation; category deletion protection |
| `cycles.test.js` | 11 | Statement and calendar cycles, start days 29–31, year boundaries, IST midnight |
| `migration.test.js` | 11 | Upgrading data from the original app version, backup export and import |
| `captureDiagnostics.test.js` | 8 | Each "Capture status" message |
| `store.test.js` | 9 | One-time migration, ordered writes, retry after a failed load, unreadable old data, new default SMS apps merged once |
| `capture.test.js` | 6 | Native queue → pipeline, Expo Go behaviour, consent-gated listener config, pasted alerts |
| `src/auth/__tests__/pin.test.js` | 8 | PIN rules, SecureStore, legacy PIN migration |
| `src/groups/__tests__/settlement.test.js` | 6 | Expense-split totals and settlements, including uneven decimal splits |
| `modules/notification-capture/__tests__/index.test.js` | 4 | JS wrapper with and without the native module, and on an older build |
| `components/__tests__/select.test.js` | 4 | The in-app dropdown (dark-mode regression), open, choose, cancel |
| `screens/__tests__/groupScreens.test.js` | 24 | Group screen actions, round-off popup (1/100/120/150/none, invalid value, cancel), calculator (every value editable, 0% and unset rates, caps), card linking, expense-split screens |
| `screens/__tests__/reviewAndSettings.test.js` | 24 | Every review action, "Set up card", Capture & Privacy, app version |
| `screens/__tests__/cards.test.js` | 16 | Cashback list, Cards & cycles, card editor, setting up a card from a review item |
| `screens/__tests__/editors.test.js` | 11 | Category and transaction editors, moving between cycles |
| `screens/__tests__/cashbackScreens.test.js` | 4 | Review inbox, group details, manual category edit and delete |
| `__tests__/App.test.js`, `App.review.test.js` | 5 | PIN setup and unlock, when the "Needs review" prompt appears |

Shared mocks (AsyncStorage) live in `jest.setup.js`; screen helpers (`seed`, `mockAlerts`, `choose`) are in `screens/__tests__/testUtils.js`. For a coverage report:

```bash
npx jest --coverage
```

The tests run on your computer, not on a phone. They check behaviour and what text appears, but not how Android draws a screen (for example in dark mode), so give each new build a quick look on the device.

Tests run in the `Asia/Kolkata` time zone (`jest.global-setup.js`) so cycle boundaries match the phone.

**Recall comes first.** Capture is tuned so that a real card spend is never skipped; an extra alert in Needs review is acceptable. `fixtures/corpus.js` holds real spend formats, and `recall.test.js` checks each against both the Android listener's filter (its regexes are read from `CaptureListenerService.kt`) and the parser. When a bank alert is ever missed, add its text (with digits changed) to the corpus first.

**Add your own alerts.** Real bank wording varies. Add anonymised copies of your alerts (remove your name, balances, and reference numbers) to `src/cashback/__tests__/fixtures/alerts.js`, along with the values you expect, and run `npm test`. If one fails, adjust the patterns in `src/cashback/parser.js`.

The Kotlin listener cannot be unit-tested here. Check it on a device with a development build.

## Versions and releases

Each merged PR is a version, recorded in [CHANGELOG.md](CHANGELOG.md). The version is set in `app.json` and `package.json`, shown at the bottom of **Capture & Privacy**, and tagged in git as `vX.Y.Z`. Work for the next version happens on a `release/X.Y.Z` branch cut from `master`. Release APKs use the `preview` profile, which gives each build a new Android build number so it installs over the previous one.

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
