// The player's sandbox tables, kept on the phone. Outside React state (a small store), like the walkthrough's:
// a table changes with every card moved, and only the screens showing it need to hear about it.
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { newId } from './id';
import { newSandbox } from './sandbox';
import type { SandboxTable } from './sandbox';
import { loadSandboxes, saveSandboxes } from './storage';

/** Changes are written to the phone this long after the last one (and straight away if the app is left). */
const SAVE_DELAY_MS = 400;

let tables: SandboxTable[] | null = null;
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

const all = () => (tables ??= loadSandboxes());
const flush = () => {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  if (tables) saveSandboxes(tables);
};
const set = (next: SandboxTable[]) => {
  tables = next;
  listeners.forEach((l) => l());
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, SAVE_DELAY_MS);
};
AppState.addEventListener('change', (s) => s !== 'active' && flush());

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** Every sandbox table, newest first. Redraws when any changes. */
export const useSandboxes = () => useSyncExternalStore(subscribe, all);

/** One table, or undefined if it's gone. Redraws when it changes. */
export const useSandbox = (id: string) => useSyncExternalStore(subscribe, () => all().find((t) => t.id === id));

export function createSandbox(name: string): SandboxTable {
  const table = newSandbox(newId(), name, Date.now());
  set([table, ...all()]);
  return table;
}

/** A new table made from an empty one (e.g. with a ready-made layout on it), added to the top. */
export function createSandboxWith(name: string, lay: (empty: SandboxTable) => SandboxTable): SandboxTable {
  const table = lay(newSandbox(newId(), name, Date.now()));
  set([table, ...all()]);
  return table;
}

/** Saves a changed table. */
export function updateSandbox(table: SandboxTable) {
  set(all().map((t) => (t.id === table.id ? { ...table, updatedAt: Date.now() } : t)));
}

export function deleteSandbox(id: string) {
  set(all().filter((t) => t.id !== id));
}
