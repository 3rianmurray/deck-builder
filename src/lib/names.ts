// Names the player types (decks, cards, groups, tables, hands, sessions), kept in title case as they're typed,
// and the app's own prompt for asking for one (iOS's system prompt can't change the text as it's typed).
import { useSyncExternalStore } from 'react';

/**
 * Text in title case: the first letter of every word made a capital, as it's typed. The rest is left as typed,
 * so capitals inside words (e.g. "McDonald", "UNO") stay.
 */
export function titleCase(text: string): string {
  return text.replace(/(^|[\s\-/(])(\p{Ll})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
}

/** A name being asked for: the prompt's title, the name it starts with, and what's done with the new one. */
export interface NameRequest {
  title: string;
  current: string;
  done: (name: string) => void;
}

let request: NameRequest | null = null;
const listeners = new Set<() => void>();
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};
const set = (next: NameRequest | null) => {
  request = next;
  listeners.forEach((l) => l());
};

/** Asks for a name (see NamePrompt); `done` gets it trimmed, and only if it isn't empty. */
export function askName(title: string, current: string, done: (name: string) => void) {
  set({ title, current, done });
}

/** Closes the prompt (with the name it gives, if any). */
export function answerName(name: string | null) {
  const asked = request;
  set(null);
  const trimmed = name?.trim();
  if (asked && trimmed) asked.done(trimmed);
}

export const useNameRequest = () => useSyncExternalStore(subscribe, () => request);
