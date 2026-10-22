// Shufflevale Pro: a one-time purchase from the App Store (StoreKit, through expo-iap), which takes away the free
// version's card limit and opens up deck files. Owning it is remembered on the phone, so it works offline; the
// App Store is asked again each time the app opens (which also catches a refund).
//
// TestFlight and development builds have a tester switch (in About) to act as free or as Pro without buying.
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { useSyncExternalStore } from 'react';
import { Alert } from 'react-native';

import { loadSettings, saveSettings } from './storage';

/** The Pro product, as set up in App Store Connect. */
export const PRO_PRODUCT_ID = 'com.3rianmurray.shufflevale.pro';

type Iap = typeof import('expo-iap');

/**
 * The App Store module, or null where there isn't one (Expo Go, which doesn't include it). Loaded lazily, so the
 * app still runs there.
 */
let iapModule: Iap | null | undefined;
function iap(): Iap | null {
  if (iapModule !== undefined) return iapModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    iapModule = Constants.executionEnvironment === ExecutionEnvironment.StoreClient ? null : (require('expo-iap') as Iap);
  } catch {
    iapModule = null;
  }
  return iapModule;
}

export type ProOverride = 'free' | 'pro';

export interface ProState {
  /** Bought (or restored) on this Apple Account. */
  owned: boolean;
  /** Pro's price, as the App Store shows it here (e.g. "$4.99"), once it's known. */
  price: string | null;
  /** The App Store can be used here (not Expo Go). */
  available: boolean;
  /** A TestFlight or development build, where the tester switch is offered. */
  testing: boolean;
  /** The tester switch: acting as free or as Pro (only in testing builds). */
  override: ProOverride | null;
  /** A purchase or restore is under way. */
  busy: boolean;
}

let state: ProState = {
  owned: !!loadSettings().proOwned,
  price: null,
  available: true,
  testing: __DEV__,
  override: loadSettings().proOverride ?? null,
  busy: false,
};
const listeners = new Set<() => void>();
const set = (patch: Partial<ProState>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/**
 * A build that comes with Pro on (`extra.unlockPro` in its app config: the iPad test build's, for testing; never
 * one for the App Store).
 */
const UNLOCKED = !!(Constants.expoConfig?.extra as { unlockPro?: boolean } | undefined)?.unlockPro;

/** Whether Pro is on: owned, or switched on for testing. Where there's no App Store (Expo Go), everything's open. */
export function isPro(s: ProState = state): boolean {
  if (UNLOCKED) return true;
  if (s.testing && s.override) return s.override === 'pro';
  return s.owned || !s.available;
}

/** Pro's state, redrawing as it changes. */
export const useProState = () => useSyncExternalStore(subscribe, () => state);
/** Whether Pro is on, redrawing as it changes. */
export const usePro = () => isPro(useProState());

const setOwned = (owned: boolean) => {
  if (owned === state.owned) return;
  saveSettings({ ...loadSettings(), proOwned: owned });
  set({ owned });
};

/** The tester switch: act as free, as Pro, or (null) as the real purchase says. Only in testing builds. */
export function setProOverride(override: ProOverride | null) {
  const { proOverride: _old, ...rest } = loadSettings();
  saveSettings(override ? { ...rest, proOverride: override } : rest);
  set({ override });
}

let started = false;

/**
 * Connects to the App Store once, as the app opens: listens for purchases, looks up Pro's price, checks whether
 * it's owned, and whether this is a TestFlight build.
 */
export async function startPro() {
  if (started) return;
  started = true;
  const m = iap();
  if (!m) {
    set({ available: false });
    return;
  }
  try {
    await m.initConnection();
  } catch (e) {
    console.warn('App Store connection failed', e);
    return;
  }
  m.purchaseUpdatedListener((purchase) => {
    if (purchase.productId !== PRO_PRODUCT_ID) return;
    if (purchase.purchaseState === 'purchased') {
      setOwned(true);
      m.finishTransaction({ purchase, isConsumable: false }).catch((e) => console.warn('finishTransaction failed', e));
      if (state.busy) Alert.alert('Welcome to Shufflevale Pro', 'Unlimited cards and deck files are yours. Thank you!');
    }
    set({ busy: false });
  });
  m.purchaseErrorListener((error) => {
    set({ busy: false });
    if (error.code === m.ErrorCode.UserCancelled) return;
    // Bought before (on this Apple Account): it's theirs, so it's restored.
    if (error.code === m.ErrorCode.AlreadyOwned) {
      void restorePro();
      return;
    }
    Alert.alert('Purchase didn’t go through', error.message || 'Please try again in a moment.');
  });
  // TestFlight runs against Apple's test store ("Sandbox"); the App Store is "Production". Asked on its own, so a
  // price or past purchases that are slow to come (or never do, on a device not signed in to the App Store) can't
  // keep the tester switch away.
  m.getAppTransactionIOS()
    .then((app) => {
      if (app && app.environment !== 'Production') set({ testing: true });
    })
    .catch(() => {});
  const [products, purchases] = await Promise.allSettled([m.fetchProducts({ skus: [PRO_PRODUCT_ID], type: 'in-app' }), m.getAvailablePurchases()]);
  if (products.status === 'fulfilled') {
    const product = (products.value ?? []).find((p) => p.id === PRO_PRODUCT_ID);
    if (product) set({ price: product.displayPrice });
  }
  // What the App Store says now (a refund takes Pro away again).
  if (purchases.status === 'fulfilled') setOwned(purchases.value.some((p) => p.productId === PRO_PRODUCT_ID));
}

/** How many cards the walkthrough's sample deck comes with (see sampleDeck.ts). */
const SAMPLE_CARDS = 12;
/** How many cards the Playing Cards example comes with. */
const PLAYING_CARDS = 52;

/**
 * The app's own example decks (Playing Cards, the walkthrough's sample), with how many of their cards are the app's
 * own: those don't count toward the free limit (cards added to them do).
 */
export function exampleAllowances(): Map<string, number> {
  const s = loadSettings();
  const out = new Map<string, number>();
  if (s.playingCardsDeckId) out.set(s.playingCardsDeckId, PLAYING_CARDS);
  if (s.sampleDeckId) out.set(s.sampleDeckId, SAMPLE_CARDS);
  return out;
}

/** Opens Apple's purchase sheet for Pro. The result arrives through the listeners in `startPro`. */
export async function buyPro() {
  const m = iap();
  if (!m || state.busy) return;
  set({ busy: true });
  try {
    await m.requestPurchase({ request: { apple: { sku: PRO_PRODUCT_ID } }, type: 'in-app' });
  } catch (e) {
    set({ busy: false });
    console.warn('requestPurchase failed', e);
  }
}

/** Looks for Pro on this Apple Account (e.g. on a new phone). Says how it went. */
export async function restorePro(): Promise<boolean> {
  const m = iap();
  if (!m) return false;
  set({ busy: true });
  try {
    await m.restorePurchases();
    const owned = (await m.getAvailablePurchases()).some((p) => p.productId === PRO_PRODUCT_ID);
    setOwned(owned);
    Alert.alert(
      owned ? 'Pro restored' : 'No purchase found',
      owned
        ? 'Shufflevale Pro is unlocked again. Thank you!'
        : 'Shufflevale Pro hasn’t been bought with this Apple Account. If you bought it with another one, sign in with it in Settings.',
    );
    return owned;
  } catch (e) {
    Alert.alert('Couldn’t restore', e instanceof Error ? e.message : 'Please try again in a moment.');
    return false;
  } finally {
    set({ busy: false });
  }
}
