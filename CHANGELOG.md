# Changelog

Each merged release gets a version. The version is set in `app.json` (`expo.version`) and `package.json`, shown at the bottom of **Cashback → Settings (Capture & Privacy)**, and tagged in git as `vX.Y.Z` on the `master` commit it was merged as.

- **Minor** (1.2.0 → 1.3.0): new features or a batch of fixes, one per PR.
- **Patch** (1.3.0 → 1.3.1): a small fix released on its own.

Work for the next version happens on a `release/X.Y.Z` branch cut from `master`. The Android build number (`versionCode`) is increased automatically by EAS for every preview APK, so a newer APK always installs over an older one.

## [1.3.0] — in progress (branch `release/1.3.0`)

### Added
- **How cashback is calculated**, per card and per group, set in a popup: **No round-off** (exact, to the paisa) or **Round off per ₹ [value]** with any value: 1 rounds each spend down (HSBC: 10% of ₹125 = ₹12), 100 counts only whole ₹100 (SBI: 10% of ₹325.50 = ₹30), 150 or 120 count whole ₹150/₹120 (₹30 / ₹24). PhonePe SBI cards default to per ₹100.
- **Cashback calculator** on each group, with every value editable: spend amount, rate (filled in from a category), and round-off (none, or per ₹ value). Shows the cashback and, for a category, the caps left. Nothing is saved.

### Fixed
- Two spends of the same amount on the same day (e.g. ₹100 at a pani puri stall in the morning and ₹100 at another shop in the evening) were merged as one. Alerts with different UPI/bank references, different merchants, or two SMS that arrived at different times (even with identical text, e.g. two ₹100 at the same shop) are now separate spends; the same spend from SMS and email is still merged.
- Loan and limit offers ("updated pre-approved loan limit of Rs.800000", instant loan, limit increased) were captured as debits. They are now ignored.
- A notification that bundles several messages (a Google Messages conversation, a Gmail inbox summary) is now split into separate alerts, each with its own time, instead of being read as one text.

### Changed
- Versioning: app version shown in Capture & Privacy; each preview APK gets a new Android build number.
- "Round down cycle total" is no longer offered in the popup; groups already using it keep working.

### Tests
- 417 tests in 26 files (about 96% line coverage), including a full retest of the 1.3.0 features: round-off with caps, pools, refunds, reward points, old data and bad values; duplicates in every direction; reference formats; calculator with 0% and unset rates.

## [1.2.0] — 2026-09-28 (PR #6, `6018e4e`)

### Fixed
- HSBC SMS in Google Messages were skipped: the capture listener now reads the message text from every notification field, including messaging-style messages.
- "Review now" no longer traps you on Needs review; the empty review screen has "Back to My Cashback".
- Alerts that give only a date use the time the notification arrived that day instead of 00:00.
- Running newer app code on an older development build no longer crashes Capture & Privacy.

### Added
- Capture status separates other apps from allowed apps, and lists the last texts skipped from allowed apps (long numbers masked).

## [1.1.0] — 2026-09-26 (PR #5, `4344203`)

### Added
- Card templates (HDFC Millennia, HSBC Live+, HSBC RuPay, Airtel Axis, PhonePe SBI, Amazon Pay ICICI), billing-cycle groups, shared cap pools, rounding and reward value.
- Android notification capture with automatic assignment of clear alerts and a Needs review inbox (add, edit, no cashback, skip, ignore, create cycle, link refund, remember merchant).
- Linking a manual group to its card digits and cycle; alerts waiting in review are re-checked when a card or cycle is set up.
- Backup export and import, PIN in SecureStore, captured-text retention, Android cloud backup off.
- Unit and screen tests.

### Fixed
- Dropdowns blank in dark mode; merchant parsing for "used at MERCHANT for INR"; settlement rounding; navigation warnings.

## [1.0.0]

- Shared-expense groups with settlements, and manual cashback groups.
