# Market Keeper

Market Keeper is an offline-first sales and debt ledger built for shop owners and market traders. It operates completely in the browser without requiring external backends, user sign-ups, or continuous internet access. Every sale record and voice note stays securely stored on the device.

## Features

- **Offline-First Architecture**: Uses browser `localStorage` for fast, offline persistence with graceful fallback on storage constraints.
- **Fast One-Handed Sale Recording**:
  - **Cash Sale**: Quick entry for paid sales.
  - **Debt Sale**: Track credit sales tied to individual customers.
  - **Voice Sale Recognition**: Web Speech API integration that understands Nigerian market speech patterns (e.g., "Sold rice 2000 to Emeka debt") and fills forms automatically.
  - **Voice Note Recording & Playback**: Audio recording using MediaRecorder with one-tap audio review directly from sale and debt cards.
- **Auditory & Visual Feedback**: Instant chime sound synthesis via Web Audio API on save and non-intrusive toast alerts.
- **Daily Ledger ("Today's Sales")**:
  - Live today's take aggregate in Naira (₦).
  - Categorized breakdown of total cash sales vs. total debt sales.
- **Debtors Ledger ("Owing Me")**:
  - Unpaid debts grouped by customer name with cumulative balances and owed item history.
  - One-tap "Mark all paid" action to clear debts once settled.
- **End of Day Shop Closing & History**:
  - "Close Shop — Clear Today" archives today's sales into historical logs while preserving unpaid customer debts.
  - Expandable accordion history view showing previous business days, close timestamps, totals, and item breakdowns.
- **PWA Ready**: Offline service worker caching and web app manifest for home screen installation.

## Tech Stack

- **Framework**: React 18 with TypeScript
- **Bundler & Dev Server**: Vite
- **Styling**: Responsive CSS with theme tokens (Forest Navy `#0F2D2A`, Gold `#D4A017`, Cream `#F7F5F0`)
- **Speech & Audio**: Web Speech API, MediaRecorder, Web Audio API

## Running Locally

```bash
npm install
npm run dev
```

App runs on `http://0.0.0.0:3000`.
