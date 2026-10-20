// On-device persistence. Images are copied into the app's document directory and referenced by
// relative path, because iOS can change the absolute container path between app updates.
import { Directory, File, Paths } from 'expo-file-system';
import { Alert } from 'react-native';

import { newId } from './id';
import type { DeckGroup } from './groups';
import type { SandboxTable } from './sandbox';
import type { Deck, Session, TableState } from './types';

const DECKS_FILE = 'decks.json';
const TABLES_FILE = 'tables.json';
const SESSIONS_FILE = 'sessions.json';
const GROUPS_FILE = 'groups.json';
const SETTINGS_FILE = 'settings.json';
const SANDBOXES_FILE = 'sandboxes.json';

/** A file's contents, parsed, or undefined if it's missing or can't be read. */
function parseFile<T>(file: File): T | undefined {
  if (!file.exists) return undefined;
  try {
    return JSON.parse(file.textSync()) as T;
  } catch {
    return undefined;
  }
}

/**
 * Reads a saved file. If it's damaged (e.g. the phone died mid-save in an older version), the last whole copy
 * waiting to be swapped in is used instead, and the damaged file is put aside (never overwritten), so a player's
 * decks are never silently replaced by nothing.
 */
function readJson<T>(name: string, fallback: T): T {
  const file = new File(Paths.document, name);
  const value = parseFile<T>(file);
  if (value !== undefined) return value;
  if (file.exists) {
    console.warn(`Could not read ${name}; keeping it aside`);
    try {
      file.moveSync(new File(Paths.document, `${name}.damaged-${Date.now()}`));
    } catch (e) {
      console.warn(`Could not put ${name} aside`, e);
    }
  }
  return parseFile<T>(new File(Paths.document, `${name}.tmp`)) ?? fallback;
}

/**
 * Saves a file safely: written whole to a temporary file first, then swapped in, so the saved copy is never left
 * half-written (if the app's closed, or the phone dies or runs out of room, mid-save). A save that fails is reported
 * (see `saveFailed`) instead of crashing the app; the last good copy stays.
 */
function writeJson(name: string, value: unknown) {
  // Everything's being erased (see `eraseEverything`): nothing's saved again before the app restarts.
  if (erasing) return;
  try {
    const tmp = new File(Paths.document, `${name}.tmp`);
    tmp.create({ overwrite: true });
    tmp.write(JSON.stringify(value));
    tmp.moveSync(new File(Paths.document, name), { overwrite: true });
  } catch (e) {
    saveFailed(name, e);
  }
}

/** Everything the app keeps: its saved files (by name), and the folder of each deck's pictures. */
const ALL_FILES = [DECKS_FILE, TABLES_FILE, SESSIONS_FILE, GROUPS_FILE, SETTINGS_FILE, SANDBOXES_FILE];
let erasing = false;

/**
 * Erases everything the app keeps on the phone (decks and their pictures, tables, sessions, groups, settings), as
 * if it had just been installed. Nothing's saved after this: the app should be restarted straight away. (A Pro
 * purchase isn't kept here: it belongs to the Apple Account, and is found again as the app starts.)
 */
export function eraseEverything() {
  erasing = true;
  for (const name of ALL_FILES) {
    for (const file of [new File(Paths.document, name), new File(Paths.document, `${name}.tmp`)]) {
      try {
        if (file.exists) file.delete();
      } catch (e) {
        console.warn(`Could not erase ${file.name}`, e);
      }
    }
  }
  try {
    const decks = new Directory(Paths.document, 'decks');
    if (decks.exists) decks.delete();
  } catch (e) {
    console.warn('Could not erase the decks folder', e);
  }
}

/** Below this much free room, a failed save is put down to the phone being full. */
const LOW_SPACE_BYTES = 50 * 1024 * 1024;
/** A failed save is told once in this long, not on every change. */
const FAILURE_NOTICE_MS = 60_000;
let lastNotice = 0;

/** Tells the player a save failed (once a minute at most): their changes since may not be kept. */
function saveFailed(name: string, e: unknown) {
  console.warn(`Could not save ${name}`, e);
  const now = Date.now();
  if (now - lastNotice < FAILURE_NOTICE_MS) return;
  lastNotice = now;
  let full = false;
  try {
    full = Paths.availableDiskSpace < LOW_SPACE_BYTES;
  } catch {}
  Alert.alert(
    full ? 'Your iPhone is out of storage' : 'Couldn’t save your changes',
    full
      ? 'Shufflevale can’t save your latest changes. Free up some space in Settings › General › iPhone Storage, then try again. Everything saved before this is safe.'
      : 'Something stopped Shufflevale saving your latest changes. Everything saved before this is safe.',
  );
}

export const loadDecks = () => readJson<Deck[]>(DECKS_FILE, []);
export const saveDecks = (decks: Deck[]) => writeJson(DECKS_FILE, decks);
export const loadTables = () => readJson<Record<string, TableState>>(TABLES_FILE, {});
export const saveTables = (tables: Record<string, TableState>) => writeJson(TABLES_FILE, tables);
export const loadSessions = () => readJson<Session[]>(SESSIONS_FILE, []);
export const saveSessions = (sessions: Session[]) => writeJson(SESSIONS_FILE, sessions);
export const loadGroups = () => readJson<DeckGroup[]>(GROUPS_FILE, []);
export const saveGroups = (groups: DeckGroup[]) => writeJson(GROUPS_FILE, groups);

export const loadSandboxes = () => readJson<SandboxTable[]>(SANDBOXES_FILE, []);
export const saveSandboxes = (tables: SandboxTable[]) => writeJson(SANDBOXES_FILE, tables);

/** App-wide settings, kept apart from the player's decks and tables. */
export interface Settings {
  /** The welcome has been shown (it's shown by itself only on the first launch). */
  welcomed?: boolean;
  /** The deck the walkthrough made, reused (started again) when it's run again. */
  sampleDeckId?: string;
  /** The Playing Cards deck and its Solitaire table (a Free Play example) have been made, once. */
  solitaireMade?: boolean;
  /** The Playing Cards deck the app made last, reused for new Solitaire tables while it's still there. */
  playingCardsDeckId?: string;
  /** Tips (see lib/tips) are turned off. */
  tipsOff?: boolean;
  /** The tips already shown (each shows once). */
  seenTips?: string[];
  /** Uses of buttons that have a quicker gesture, toward offering that gesture's tip (see lib/tips). */
  tipUses?: Record<string, number>;
  /** Table themes chosen for sessions and decks played on their own (see lib/playThemes). */
  playThemes?: Record<string, string>;
  /** Shufflevale Pro has been bought on this phone's Apple Account (see lib/pro), remembered for offline use. */
  proOwned?: boolean;
  /** The tester switch, in TestFlight builds: act as free or as Pro. */
  proOverride?: 'free' | 'pro';
  /** The tester controls in About are showing (shown by tapping the version 7 times, in TestFlight). */
  testerShown?: boolean;
  /** Where the player's put the tools drawer on tables: which edge, and how far down it (0 top, 1 bottom). */
  toolsSpot?: { side: 'left' | 'right'; at: number };
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

/**
 * Whether a saved picture has see-through parts: only those are kept as PNG (see lib/images), so it's drawn with
 * nothing behind it, rather than on a card.
 */
export const isSeeThrough = (relativePath: string | null | undefined) => !!relativePath && /\.png$/i.test(relativePath);

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
