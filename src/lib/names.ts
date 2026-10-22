// Names the player types (decks, cards, groups, tables, hands, sessions), kept in title case as they're typed,
// and the app's own prompt for asking for one (iOS's system prompt can't change the text as it's typed).
import { useSyncExternalStore } from 'react';

/** The longest a name can be (decks, cards, groups, tables, hands, sessions): plenty, and it still fits on screen. */
export const MAX_NAME_LENGTH = 60;

/** A name kept to `MAX_NAME_LENGTH`, trimmed. */
export const clampName = (name: string) => name.trim().slice(0, MAX_NAME_LENGTH).trim();

/**
 * Text in title case: the first letter of every word made a capital, as it's typed. The rest is left as typed,
 * so capitals inside words (e.g. "McDonald", "UNO") stay.
 */
export function titleCase(text: string): string {
  return text.replace(/(^|[\s\-/(])(\p{Ll})/gu, (_, before: string, letter: string) => before + letter.toUpperCase());
}

/**
 * What's being asked for: words (a name, title-cased as it's typed); a whole number (`number`, or `signed` if it can
 * be below 0); or a time (minutes, or minutes:seconds). Each brings up the keyboard it wants.
 */
export type AskKind = 'name' | 'number' | 'signed' | 'time';

/** A name being asked for: the prompt's title, the name it starts with, and what's done with the new one. */
export interface NameRequest {
  title: string;
  current: string;
  done: (name: string) => void;
  kind?: AskKind;
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

/** Asks for a number (or a time) the same way, with the number keyboard (see AskKind). */
export function askNumber(title: string, current: string, done: (text: string) => void, kind: Exclude<AskKind, 'name'> = 'number') {
  set({ title, current, done, kind });
}

/** Closes the prompt (with the name it gives, if any). */
export function answerName(name: string | null) {
  const asked = request;
  set(null);
  const trimmed = name ? clampName(name) : undefined;
  if (asked && trimmed) asked.done(trimmed);
}

export const useNameRequest = () => useSyncExternalStore(subscribe, () => request);
