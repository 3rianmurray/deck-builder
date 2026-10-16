# Shufflevale

A sandbox for physical-style card decks on iPhone. Users import their own art to build decks, then play with them on a virtual table, like Tabletop Simulator in your pocket.

## What it does

**Deck builder**
- Create, rename, and delete decks
- Add cards from Photos (multi-select); each image becomes a card
- Rename cards, add extra copies, remove cards
- Set a custom card back (or use the built-in one)

**Table**
- Tap the deck to draw; long-press it (or tap **Deck…**) to draw 3/5, deal to the table, shuffle, or search
- Hand along the bottom; tap any card to play it, discard it, or put it on the top or bottom of the deck
- Play area where cards can be flipped face up or down
- Discard pile: take the top card, search the whole pile, or shuffle it back into the deck
- Search the deck or discard pile and pull out any card, then **Shuffle & close**
- `•••` menu: discard your hand, reset the table, or jump to the deck editor
- Games are saved automatically. Leave and come back later, and the table is as you left it.

Everything is stored on the device. There are no accounts and no server.

## Run it on your iPhone (no Mac needed)

1. Install [Node.js](https://nodejs.org) (LTS) on your computer.
2. Install **Expo Go** from the App Store on your iPhone.
3. In this folder:
   ```bash
   npm install
   npx expo start
   ```
4. Scan the QR code with your iPhone camera. The app opens in Expo Go and reloads live as the code changes.

The phone and computer need to be on the same Wi-Fi. If they can't be, run `npx expo start --tunnel`.

## Project layout

```
src/app/            Screens (Expo Router: each file is a route)
  index.tsx         Deck list
  deck/[id].tsx     Deck editor
  play/[id].tsx     The table: piles, play area, hand, search
src/components/     CardView, ActionSheet, Button
src/lib/
  table.ts          Pure game logic: draw, move, shuffle, flip, reset
  table.test.ts     Unit tests for table.ts
  storage.ts        Saving decks/tables and importing images on device
  DecksContext.tsx  App-wide state
src/theme.ts        Colors and card proportions
```

## Checks

```bash
npm run typecheck
npm test
```

## Publishing to the App Store

1. Join the [Apple Developer Program](https://developer.apple.com/programs/) ($99/year).
2. Create a free [Expo](https://expo.dev) account, then:
   ```bash
   npx eas-cli@latest login
   npx eas-cli@latest build:configure
   ```
3. Set a unique `ios.bundleIdentifier` in `app.json` (e.g. `com.yourname.shufflevale`), and replace `assets/icon.png` and `assets/splash-icon.png` with real artwork.
4. Build and upload in the cloud. EAS handles certificates and signing:
   ```bash
   npx eas-cli@latest build --platform ios --profile production
   npx eas-cli@latest submit --platform ios
   ```
5. Test it with TestFlight, then complete the listing in App Store Connect (screenshots, description, privacy details, price) and submit it for review.
