# SplitVCM

SplitVCM is an Expo-powered React Native app for keeping track of shared expenses and credit-card cashback.

## Features

- Create expense groups and add members.
- Record expenses, including the payer and amount.
- Calculate equal-share settlements for a group.
- Mark settled groups and manage expense entries.
- Create cashback groups, such as a credit card or offer.
- Define cashback categories with percentage rates and optional category or group caps.
- Record transactions and track cashback earned.
- Store all group and cashback data locally on the device using AsyncStorage.
- Protect app access with device biometric authentication, when available.

## Requirements

- Node.js 20 or later
- npm
- Expo Go on a physical device, or an Android/iOS emulator

## Getting started

Install dependencies:

```bash
npm install
```

Start the Expo development server:

```bash
npm start
```

You can also launch a platform directly:

```bash
npm run android
npm run ios
npm run web
```

## How it works

The app has two tabs:

- **Groups**: create a shared-expense group, add members and expenses, then calculate who should pay whom to settle the group.
- **Cashback**: create a cashback profile, configure categories and limits, and record transactions to calculate earned cashback.

All application data is kept on the device. Expense groups use the `groups` AsyncStorage key; cashback groups use `cashbacks`. Clearing the app's storage removes this data.

## Project structure

```text
.
├── App.js                     # Authentication and navigation setup
├── screens/
│   ├── GroupsScreen.js         # Expense-group list
│   ├── CreateGroupScreen.js    # Expense-group creation
│   ├── GroupDetailsScreen.js   # Expenses and settlements
│   ├── CashbackScreen.js       # Cashback-group list
│   ├── CreateCashbackGroup.js  # Cashback-group creation
│   └── CashbackGroupDetails.js # Transactions and cashback totals
├── components/
│   └── InputModal.js           # Reusable text-input modal
├── assets/                     # App and splash icons
├── app.json                    # Expo application configuration
└── package.json                # Scripts and dependencies
```

For a description of the main data models and screen responsibilities, see [PROJECT.md](PROJECT.md).

## Available scripts

| Command | Description |
| --- | --- |
| `npm start` | Start the Expo development server. |
| `npm run android` | Start Expo and open Android. |
| `npm run ios` | Start Expo and open iOS. |
| `npm run web` | Start Expo for the web. |

## Notes

- This project does not currently define automated tests or linting scripts.
- The Android application identifier is `com.sbchethan235.SplitVCM`.
