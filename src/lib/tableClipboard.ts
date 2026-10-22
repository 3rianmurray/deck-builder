// What's been copied off a table, to paste on any table (this one, or another) till something else is copied or
// the app's closed. Kept outside React state, as a tiny store, so every table sees it.
import { useSyncExternalStore } from 'react';

import type { TableClip } from './sandbox';

let clip: TableClip | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Copies stacks and pieces (nothing, if both are empty). */
export function setClip(next: TableClip) {
  if (!next.stacks.length && !next.pieces.length) return;
  clip = next;
  listeners.forEach((l) => l());
}

/** What's been copied, if anything. Redraws when something else is. */
export const useClip = () => useSyncExternalStore(subscribe, () => clip);

/** How many things a copy is: its stacks and pieces. */
export const clipSize = (c: TableClip) => c.stacks.length + c.pieces.length;
