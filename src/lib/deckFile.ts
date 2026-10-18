// Deck files: one or more decks, pictures and all, in a single file to back up, move to another phone, or give
// to a friend. Plain JSON with the pictures inside (as base64), so it survives being mailed, AirDropped or kept
// in Files. Only the packing and unpacking is here; reading and writing the files is in deckExport.ts.
import type { CardShape, Deck, PlayMode } from './types';

/** Marks a file as ours, and which version of the format it's in. */
const KIND = 'shufflevale-decks';
const VERSION = 1;

/** A picture in the file: its type (from the file name it had) and its bytes, as base64. */
interface FileImage {
  ext: string;
  data: string;
}

interface FileCard {
  name: string;
  copies?: number;
  /** Key into the file's `images`. */
  image: string;
}

interface FileDeck {
  name: string;
  cardShape?: CardShape;
  roundness?: number;
  playMode?: PlayMode;
  /** Key into the file's `images`, or null for the built-in back. */
  back: string | null;
  cards: FileCard[];
}

export interface DeckFile {
  kind: typeof KIND;
  version: number;
  decks: FileDeck[];
  /** Each picture once, even if several cards (or decks) use it. */
  images: Record<string, FileImage>;
}

/** A deck read back from a file, ready to be added: its pictures still as base64, to be written out. */
export interface UnpackedDeck {
  name: string;
  cardShape?: CardShape;
  roundness?: number;
  playMode?: PlayMode;
  back: FileImage | null;
  cards: { name: string; copies?: number; image: FileImage }[];
}

/** The type of a picture, from its saved path (e.g. `decks/abc/123.png` is png). */
export function extOf(path: string): string {
  return path.match(/\.(\w{2,5})$/)?.[1]?.toLowerCase() ?? 'jpg';
}

/** Packs decks into a file's contents. `read` gives a saved picture's bytes as base64, by its path. */
export function packDecks(decks: Deck[], read: (path: string) => string): DeckFile {
  const images: Record<string, FileImage> = {};
  const keys = new Map<string, string>();
  const keyOf = (path: string) => {
    const known = keys.get(path);
    if (known) return known;
    const key = `i${keys.size + 1}`;
    keys.set(path, key);
    images[key] = { ext: extOf(path), data: read(path) };
    return key;
  };
  return {
    kind: KIND,
    version: VERSION,
    decks: decks.map((d) => ({
      name: d.name,
      ...(d.cardShape ? { cardShape: d.cardShape } : {}),
      ...(d.roundness !== undefined ? { roundness: d.roundness } : {}),
      ...(d.playMode ? { playMode: d.playMode } : {}),
      back: d.backImage ? keyOf(d.backImage) : null,
      cards: d.cards.map((c) => ({ name: c.name, ...(c.copies ? { copies: c.copies } : {}), image: keyOf(c.image) })),
    })),
    images,
  };
}

/** Thrown for a file that isn't a deck file, or is damaged; its message is fit to show the player. */
export class DeckFileError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Reads a deck file's contents back into decks. Throws a DeckFileError if it isn't one, or can't be read. */
export function unpackDecks(text: string): UnpackedDeck[] {
  let file: unknown;
  try {
    file = JSON.parse(text);
  } catch {
    throw new DeckFileError("This file isn't a Shufflevale deck.");
  }
  if (!isObject(file) || file.kind !== KIND) throw new DeckFileError("This file isn't a Shufflevale deck.");
  if (typeof file.version !== 'number' || file.version > VERSION) {
    throw new DeckFileError('This deck was saved by a newer version of Shufflevale. Update the app to open it.');
  }
  const images = isObject(file.images) ? file.images : {};
  const image = (key: unknown): FileImage => {
    const found = typeof key === 'string' ? images[key] : undefined;
    if (!isObject(found) || typeof found.data !== 'string' || typeof found.ext !== 'string' || !found.data) {
      throw new DeckFileError('This deck file is damaged: some of its pictures are missing.');
    }
    return { ext: found.ext, data: found.data };
  };
  if (!Array.isArray(file.decks) || !file.decks.length) throw new DeckFileError('This file has no decks in it.');
  return file.decks.map((d: unknown) => {
    if (!isObject(d) || !Array.isArray(d.cards)) throw new DeckFileError('This deck file is damaged.');
    return {
      name: typeof d.name === 'string' && d.name.trim() ? d.name.trim() : 'Imported deck',
      ...(isObject(d.cardShape) ? { cardShape: d.cardShape as unknown as CardShape } : {}),
      ...(typeof d.roundness === 'number' && Number.isFinite(d.roundness) ? { roundness: d.roundness } : {}),
      ...(d.playMode === 'table' || d.playMode === 'reveal' ? { playMode: d.playMode } : {}),
      back: d.back ? image(d.back) : null,
      cards: d.cards.map((c: unknown, i: number) => {
        if (!isObject(c)) throw new DeckFileError('This deck file is damaged.');
        const copies = typeof c.copies === 'number' && c.copies >= 1 ? Math.floor(c.copies) : undefined;
        return {
          name: typeof c.name === 'string' && c.name ? c.name : `Card ${i + 1}`,
          ...(copies ? { copies } : {}),
          image: image(c.image),
        };
      }),
    };
  });
}

/** A file name for a deck file: the deck's name (or "Shufflevale decks" for several), made safe for any disk. */
export function deckFileName(decks: Pick<Deck, 'name'>[]): string {
  const base = decks.length === 1 ? decks[0].name : 'Shufflevale decks';
  const safe = base.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Deck';
  return `${safe}.shufflevale.json`;
}
