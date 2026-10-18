// Where the player is looking at the table from, for drawing piles in perspective.
//
// The eye sits above the middle of the table, so a pile's top card leans away from the middle: more the
// further out the pile is, as with real cards seen from above. Tilting the phone moves the eye, like looking
// at the table through a window, so the piles shift as the phone turns and feel like real objects.
import { Accelerometer } from 'expo-sensors';
import { useEffect } from 'react';
import { Animated, AppState, Platform } from 'react-native';

/**
 * How far the eye has moved with the phone's tilt, in the same units as `Lean`: (1, 0) leans every pile by
 * its full thickness to the right. JS-driven, so it can be set from the sensor without re-rendering.
 */
export const viewTilt = new Animated.ValueXY({ x: 0, y: 0 });
let current = { x: 0, y: 0 };

/** Which way, and how far, a pile's top card leans from its spot: in pile thicknesses, at most `MAX_LEAN`. */
export interface Lean {
  x: number;
  y: number;
}

/** A pile leans by at most this many of its thicknesses in each direction. */
export const MAX_LEAN = 1.5;
/** How much tilting the phone moves the eye: 1 g of sideways tilt (on its side) is this many thicknesses. */
const TILT_GAIN = 1;
/** The most the tilt can add to (or take from) a pile's lean, in thicknesses: a subtle shift, not a swing. */
const MAX_TILT = 0.5;
/**
 * How often the sensor is read. Each reading moves every pile's edges, so not too often: the effect is slow and
 * subtle, and this is smooth enough for it while keeping the phone cool.
 */
const READ_EVERY_MS = 60;
/** How quickly the eye settles back to wherever the phone is being held, per reading. */
const SETTLE = 0.011;
/** Smoothing of each reading, so the piles don't jitter with the sensor's noise. */
const SMOOTH = 0.4;
/** A change in tilt smaller than this (in thicknesses, well under a point) isn't worth moving the piles for. */
const STILL = 0.004;

const clamp = (v: number) => Math.max(-MAX_LEAN, Math.min(MAX_LEAN, v));

/**
 * How a pile at `at` leans, seen from above `center`, with the phone's tilt. `reach` is how far from the
 * middle a pile leans by its full thickness.
 */
export function leanAt(at: { x: number; y: number }, center: { x: number; y: number }, reach: number): Lean {
  return { x: (at.x - center.x) / reach, y: (at.y - center.y) / reach };
}

/** Where a pile's top card sits relative to its spot right now: its lean (plus the tilt) times its rise. */
export function leanOffset(lean: Lean, rise: number): { x: number; y: number } {
  return { x: clamp(lean.x + current.x) * rise, y: clamp(lean.y + current.y) * rise };
}

let users = 0;
let subscription: { remove: () => void } | null = null;
let appState: { remove: () => void } | null = null;
// How the phone is usually held, adapting slowly: only turning it away from that moves the eye. Null until
// it's known (from the first good reading), and forgotten whenever the app comes back to the foreground, since
// the phone may well be held differently by then.
let rest: { x: number; y: number } | null = null;
let smoothed = { x: 0, y: 0 };

/** Starts over: the next good reading is taken as how the phone is held, with the eye straight above. */
function rebase() {
  rest = null;
  smoothed = { x: 0, y: 0 };
  current = { x: 0, y: 0 };
  viewTilt.setValue(current);
}

/** Starts following the tilt, for as long as a table is on screen (see useViewTilt). */
function start() {
  if (appState) return;
  // The sensor rests while the app is in the background, and starts afresh when it comes back.
  appState = AppState.addEventListener('change', (state) => (state === 'active' ? listen() : unlisten()));
  listen();
}

function listen() {
  if (subscription) return;
  rebase();
  Accelerometer.setUpdateInterval(READ_EVERY_MS);
  subscription = Accelerometer.addListener((a) => {
    // The first readings after starting (or waking) can be junk, e.g. all zeros: only a reading that's about
    // the pull of gravity (1 g) is trusted.
    const strength = Math.hypot(a.x, a.y, a.z);
    if (strength < 0.6 || strength > 1.5) return;
    // Android reports the opposite way round from iOS.
    const sign = Platform.OS === 'android' ? -1 : 1;
    const g = { x: a.x * sign, y: a.y * sign };
    rest = rest ? { x: rest.x + (g.x - rest.x) * SETTLE, y: rest.y + (g.y - rest.y) * SETTLE } : g;
    // Tilting the phone's right edge down moves the eye left (toward the raised edge) as seen on screen, so
    // tops lean right; the top edge down moves it toward the bottom of the screen, so tops lean up.
    const target = { x: (g.x - rest.x) * TILT_GAIN, y: -(g.y - rest.y) * TILT_GAIN };
    smoothed = { x: smoothed.x + (target.x - smoothed.x) * SMOOTH, y: smoothed.y + (target.y - smoothed.y) * SMOOTH };
    const limit = (v: number) => Math.max(-MAX_TILT, Math.min(MAX_TILT, v));
    const next = { x: limit(smoothed.x), y: limit(smoothed.y) };
    // Held still, nothing needs to move: no work at all until the phone does.
    if (Math.abs(next.x - current.x) < STILL && Math.abs(next.y - current.y) < STILL) return;
    current = next;
    viewTilt.setValue(current);
  });
}

function unlisten() {
  subscription?.remove();
  subscription = null;
}

function stop() {
  unlisten();
  appState?.remove();
  appState = null;
  rebase();
}

/** Follows the phone's tilt while enabled: a table is on screen, and motion isn't turned down. */
export function useViewTilt(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let canceled = false;
    users++;
    Accelerometer.isAvailableAsync().then((ok) => {
      if (ok && !canceled && users > 0) start();
    });
    return () => {
      canceled = true;
      users--;
      if (users === 0) stop();
    };
  }, [enabled]);
}
