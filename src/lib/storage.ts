// On-device persistence. Images are copied into the app's document directory and referenced by
// relative path, because iOS can change the absolute container path between app updates.
import { Directory, File, Paths } from 'expo-file-system';

import { newId } from './id';
import type { DeckGroup } from './groups';
import type { Deck, Session, TableState } from './types';

const DECKS_FILE = 'decks.json';
const TABLES_FILE = 'tables.json';
const SESSIONS_FILE = 'sessions.json';
const GROUPS_FILE = 'groups.json';
const SETTINGS_FILE = 'settings.json';

function readJson<T>(name: string, fallback: T): T {
  try {
    const file = new File(Paths.document, name);
    if (!file.exists) return fallback;
    return JSON.parse(file.textSync()) as T;
  } catch (e) {
    console.warn(`Could not read ${name}`, e);
    return fallback;
  }
}

function writeJson(name: string, value: unknown) {
  const file = new File(Paths.document, name);
  if (!file.exists) file.create();
  file.write(JSON.stringify(value));
}

export const loadDecks = () => readJson<Deck[]>(DECKS_FILE, []);
export const saveDecks = (decks: Deck[]) => writeJson(DECKS_FILE, decks);
export const loadTables = () => readJson<Record<string, TableState>>(TABLES_FILE, {});
export const saveTables = (tables: Record<string, TableState>) => writeJson(TABLES_FILE, tables);
export const loadSessions = () => readJson<Session[]>(SESSIONS_FILE, []);
export const saveSessions = (sessions: Session[]) => writeJson(SESSIONS_FILE, sessions);
export const loadGroups = () => readJson<DeckGroup[]>(GROUPS_FILE, []);
export const saveGroups = (groups: DeckGroup[]) => writeJson(GROUPS_FILE, groups);

/** App-wide settings, kept apart from the player's decks and tables. */
export interface Settings {
  /** The welcome has been shown (it's shown by itself only on the first launch). */
  welcomed?: boolean;
  /** The deck the walkthrough made, reused (started again) when it's run again. */
  sampleDeckId?: string;
}
export const loadSettings = () => readJson<Settings>(SETTINGS_FILE, {});
export const saveSettings = (settings: Settings) => writeJson(SETTINGS_FILE, settings);

function deckDir(deckId: string): Directory {
  return new Directory(Paths.document, 'decks', deckId);
}

/** Copies a picked image into the deck's folder and returns its relative path. */
export function importImage(deckId: string, sourceUri: string): string {
  const dir = deckDir(deckId);
  if (!dir.exists) dir.create({ intermediates: true });
  const ext = sourceUri.match(/\.(\w{3,4})(?:\?.*)?$/)?.[1]?.toLowerCase() ?? 'jpg';
  const name = `${newId()}.${ext}`;
  new File(sourceUri).copySync(new File(dir, name));
  return `decks/${deckId}/${name}`;
}

/** Saves a picture given as base64 (e.g. from a deck file) into the deck's folder, and returns its relative path. */
export function saveImageData(deckId: string, ext: string, base64: string): string {
  const dir = deckDir(deckId);
  if (!dir.exists) dir.create({ intermediates: true });
  const name = `${newId()}.${ext.replace(/\W/g, '').toLowerCase() || 'jpg'}`;
  const file = new File(dir, name);
  file.create();
  file.write(base64, { encoding: 'base64' });
  return `decks/${deckId}/${name}`;
}

/** A saved picture's bytes, as base64 (for a deck file). */
export const readImageData = (relativePath: string): string => new File(Paths.document, relativePath).base64Sync();

export function imageUri(relativePath: string): string {
  return new File(Paths.document, relativePath).uri;
}

export function deleteImage(relativePath: string) {
  try {
    const file = new File(Paths.document, relativePath);
    if (file.exists) file.delete();
  } catch (e) {
    console.warn('Could not delete image', e);
  }
}

export function deleteDeckFiles(deckId: string) {
  try {
    const dir = deckDir(deckId);
    if (dir.exists) dir.delete();
  } catch (e) {
    console.warn('Could not delete deck folder', e);
  }
}
