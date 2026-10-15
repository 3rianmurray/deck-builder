// Where the player is looking at the table from, for drawing piles in perspective.
//
// The eye sits above the middle of the table, so a pile's top card leans away from the middle: more the
// further out the pile is, as with real cards seen from above. Tilting the phone moves the eye, like looking
// at the table through a window, so the piles shift as the phone turns and feel like real objects.
import { Accelerometer } from 'expo-sensors';
import { useEffect } from 'react';
import { Animated, Platform } from 'react-native';

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
/** How quickly the eye settles back to wherever the phone is being held, per reading (about every 33ms). */
const SETTLE = 0.006;
/** Smoothing of each reading, so the piles don't jitter with the sensor's noise. */
const SMOOTH = 0.25;

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

function start() {
  if (subscription) return;
  // How the phone is usually held, adapting slowly: only turning it away from that moves the eye.
  let rest: { x: number; y: number } | null = null;
  let smoothed = { x: 0, y: 0 };
  Accelerometer.setUpdateInterval(33);
  subscription = Accelerometer.addListener((a) => {
    // Android reports the opposite way round from iOS.
    const sign = Platform.OS === 'android' ? -1 : 1;
    const g = { x: a.x * sign, y: a.y * sign };
    rest = rest ? { x: rest.x + (g.x - rest.x) * SETTLE, y: rest.y + (g.y - rest.y) * SETTLE } : g;
    // Tilting the phone's right edge down moves the eye left (towards the raised edge) as seen on screen, so
    // tops lean right; the top edge down moves it towards the bottom of the screen, so tops lean up.
    const target = { x: (g.x - rest.x) * TILT_GAIN, y: -(g.y - rest.y) * TILT_GAIN };
    smoothed = { x: smoothed.x + (target.x - smoothed.x) * SMOOTH, y: smoothed.y + (target.y - smoothed.y) * SMOOTH };
    const limit = (v: number) => Math.max(-MAX_TILT, Math.min(MAX_TILT, v));
    current = { x: limit(smoothed.x), y: limit(smoothed.y) };
    viewTilt.setValue(current);
  });
}

function stop() {
  subscription?.remove();
  subscription = null;
  current = { x: 0, y: 0 };
  viewTilt.setValue(current);
}

/** Follows the phone's tilt while enabled: a table is on screen, and motion isn't turned down. */
export function useViewTilt(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    users++;
    Accelerometer.isAvailableAsync().then((ok) => {
      if (ok && !cancelled && users > 0) start();
    });
    return () => {
      cancelled = true;
      users--;
      if (users === 0) stop();
    };
  }, [enabled]);
}
