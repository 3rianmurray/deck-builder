// The table themes chosen for sessions and for decks played on their own (Tables keep theirs on the table
// itself). Kept in the settings, by `session:<id>` or `deck:<id>`; charcoal till one's chosen.
import { useSyncExternalStore } from 'react';

import { loadSettings, saveSettings } from './storage';

const DEFAULT = 'charcoal';
const listeners = new Set<() => void>();
let themes: Record<string, string> | null = null;
const all = () => (themes ??= loadSettings().playThemes ?? {});

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

/** The theme key for a session's tables, or a deck played on its own. */
export const playThemeKey = (deckId: string, sessionId?: string) => (sessionId ? `session:${sessionId}` : `deck:${deckId}`);

/** The theme chosen for these tables (a key of TABLE_THEMES). Redraws when it changes. */
export const usePlayTheme = (key: string) => useSyncExternalStore(subscribe, () => all()[key] ?? DEFAULT);

export function setPlayTheme(key: string, theme: string) {
  themes = { ...all(), [key]: theme };
  saveSettings({ ...loadSettings(), playThemes: themes });
  listeners.forEach((l) => l());
}
