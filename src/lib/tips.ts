// Tips: one-line hints that slide in now and then, the first times things are used, about gestures that can't be
// seen on screen. Not a tutorial: each shows once, one at a time, never during the walkthrough, and they can be turned
// off (and back on, or shown again) from the home screen's menu. Kept outside React state, as a tiny store.
import { useSyncExternalStore } from 'react';

import { loadSettings, saveSettings } from './storage';
import { tourRunning } from './tour';

export const TIPS = {
  'tables-lasso': 'Double-tap the table, then hold and draw round cards, to pick several out at once.',
  'tables-hold-stack': 'Hold a stack a moment before dragging to pick up the whole thing.',
  'tables-second-finger': 'While carrying cards, tap others with a second finger to pick them up too.',
  'tables-fold-hand': 'Tap the hand’s tab to fold it away: its cards turn face down, so the phone can be passed round.',
  'session-swipe': 'You can also swipe sideways to move between this session’s decks.',
  'home-swipe': 'Quicker: swipe a row right to duplicate it, or left to delete it.',
  'deck-hold-reorder': 'Hold a card and drag it to reorder the deck.',
  'tables-tap-twice': 'Tap a card to pick it out; tap it again for all its options.',
  'tables-double-tap': 'Quicker: double-tap a card to turn it over.',
  'reveal-hold': 'Hold a card to see it full size.',
  'search-take-out': 'Hold a card, then tap Close with another finger, to take it out onto the table.',
  'sprite-slide': 'Slide a finger across a number to change it.',
  'tables-quick-pinch': 'Quicker: tap twice with two fingers to fit everything in view.',
  'tables-tools-drag': 'Hold the tools tab to move it: up or down, or across to the other side.',
  'tables-drag-to-hand': 'You can also drag a card straight down into the hand to draw it.',
} as const;

export type TipId = keyof typeof TIPS;

let showing: TipId | null = null;
const listeners = new Set<() => void>();
const set = (next: TipId | null) => {
  showing = next;
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Counts something done since the app opened (e.g. cards turned over), for tips that come after a few. */
const counts = new Map<string, number>();
export function countFor(what: string): number {
  const n = (counts.get(what) ?? 0) + 1;
  counts.set(what, n);
  return n;
}

/** Tips are on (they are, unless turned off in the menu). */
export const tipsOn = () => !loadSettings().tipsOff;

/**
 * Shows a tip, if it's never been shown, tips are on, no other is showing and the walkthrough isn't running. It
 * counts as seen once shown (so it never comes back).
 */
export function offerTip(id: TipId) {
  const settings = loadSettings();
  if (settings.tipsOff || settings.seenTips?.includes(id) || showing || tourRunning()) return;
  saveSettings({ ...settings, seenTips: [...(settings.seenTips ?? []), id] });
  set(id);
}

/**
 * The gesture a tip is about has been used: it's been figured out, so its tip never needs to show (it counts as
 * seen). Puts it away if it's showing right now, since it's just been done.
 */
export function tipLearned(id: TipId) {
  const settings = loadSettings();
  if (showing === id) set(null);
  if (settings.seenTips?.includes(id)) return;
  saveSettings({ ...settings, seenTips: [...(settings.seenTips ?? []), id] });
}

/** How many times this many uses of a button go by before its gesture's tip is offered (see `offerTipAfterUses`). */
export const USES_BEFORE_TIP = 3;

/**
 * Counts a use of a button that has a quicker hidden gesture (e.g. Fit All, and a two-finger double tap). After a few
 * uses (remembered across launches), that gesture's tip is offered: once someone's shown they want the thing, and
 * not before.
 */
export function offerTipAfterUses(id: TipId, uses = USES_BEFORE_TIP, delayMs = 700) {
  const settings = loadSettings();
  if (settings.seenTips?.includes(id)) return;
  const n = (settings.tipUses?.[id] ?? 0) + 1;
  saveSettings({ ...settings, tipUses: { ...settings.tipUses, [id]: n } });
  if (n >= uses) offerTipSoon(id, delayMs);
}

/** Offers a tip after a moment (once the screen has settled); returns a way to call it off. */
export function offerTipSoon(id: TipId, delayMs = 1800) {
  const timer = setTimeout(() => offerTip(id), delayMs);
  return () => clearTimeout(timer);
}

export const dismissTip = () => set(null);

/** Turns tips on or off (off also puts away any showing). */
export function setTipsOn(on: boolean) {
  saveSettings({ ...loadSettings(), tipsOff: !on });
  if (!on) set(null);
}

/** Every tip can show again. */
export function resetTips() {
  saveSettings({ ...loadSettings(), seenTips: [], tipUses: {}, tipsOff: false });
}

/** The tip showing now, if any. */
export const useTip = () => useSyncExternalStore(subscribe, () => showing);
