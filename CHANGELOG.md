# Changelog

Each merged release gets a version. The version is set in `app.json` (`expo.version`) and `package.json`, shown at the bottom of **Cashback → Settings (Capture & Privacy)**, and tagged in git as `vX.Y.Z` on the `master` commit it was merged as.

- **Minor** (1.2.0 → 1.3.0): new features or a batch of fixes, one per PR.
- **Patch** (1.3.0 → 1.3.1): a small fix released on its own.

Work for the next version happens on a `release/X.Y.Z` branch cut from `master`. The Android build number (`versionCode`) is increased automatically by EAS for every preview APK, so a newer APK always installs over an older one.

## [1.3.0] — in progress (branch `release/1.3.0`)

### Changed
- Versioning: app version shown in Capture & Privacy; each preview APK gets a new Android build number.

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
