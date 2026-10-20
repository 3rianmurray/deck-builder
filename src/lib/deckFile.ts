// Deck files: one or more decks, pictures and all, and any tables laid out with them, in a single file to back up,
// move to another phone, or give to a friend. Plain JSON with the pictures inside (as base64), so it survives being
// mailed, AirDropped or kept in Files. Only the packing and unpacking is here; reading and writing the files is in
// deckExport.ts.
import type { SandboxCard, SandboxStack, SandboxTable } from './sandbox';
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
  /** The card's id, for a table's cards to point at (files from before tables had none). */
  id?: string;
  name: string;
  copies?: number;
  /** Key into the file's `images`. */
  image: string;
  /** Its own back, for a two-sided card (key into `images`). */
  back?: string;
}

interface FileDeck {
  /** The deck's id, for a table's cards to point at (files from before tables had none). */
  id?: string;
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
  /** Tables, as they lie, their cards pointing at the file's decks and cards by id (older files have none). */
  tables?: FileTable[];
}

/** A table in a file: everything but its own id and dates. Its cards point at the file's decks and cards. */
export type FileTable = Omit<SandboxTable, 'id' | 'createdAt' | 'updatedAt'>;

/** A file's contents, read back: its decks, and its tables (their cards still pointing at the file's ids). */
export interface UnpackedFile {
  decks: UnpackedDeck[];
  tables: FileTable[];
}

/** A deck read back from a file, ready to be added: its pictures still as base64, to be written out. */
export interface UnpackedDeck {
  /** Its id in the file, which a table's cards point at. */
  fileId?: string;
  name: string;
  cardShape?: CardShape;
  roundness?: number;
  playMode?: PlayMode;
  back: FileImage | null;
  cards: { fileId?: string; name: string; copies?: number; image: FileImage; back?: FileImage }[];
}

/** The type of a picture, from its saved path (e.g. `decks/abc/123.png` is png). */
export function extOf(path: string): string {
  return path.match(/\.(\w{2,5})$/)?.[1]?.toLowerCase() ?? 'jpg';
}

/**
 * Packs decks, and any tables, into a file's contents. `read` gives a saved picture's bytes as base64, by its path.
 * A table's decks must be among `decks` (see `decksOnTable`).
 */
export function packDecks(decks: Deck[], read: (path: string) => string, tables: SandboxTable[] = []): DeckFile {
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
      id: d.id,
      name: d.name,
      ...(d.cardShape ? { cardShape: d.cardShape } : {}),
      ...(d.roundness !== undefined ? { roundness: d.roundness } : {}),
      ...(d.playMode ? { playMode: d.playMode } : {}),
      back: d.backImage ? keyOf(d.backImage) : null,
      cards: d.cards.map((c) => ({
        id: c.id,
        name: c.name,
        ...(c.copies ? { copies: c.copies } : {}),
        image: keyOf(c.image),
        ...(c.back ? { back: keyOf(c.back) } : {}),
      })),
    })),
    images,
    ...(tables.length ? { tables: tables.map(({ id: _id, createdAt: _c, updatedAt: _u, ...t }) => t) } : {}),
  };
}

/** The decks a table's cards come from (on it, in its hands and its trash), in the order given. */
export function decksOnTable(table: SandboxTable, decks: Deck[]): Deck[] {
  const used = new Set([...table.stacks.flatMap((s) => s.cards), ...table.hands.flat(), ...(table.trash ?? [])].map((c) => c.deckId));
  return decks.filter((d) => used.has(d.id));
}

/** Thrown for a file that isn't a deck file, or is damaged; its message is fit to show the player. */
export class DeckFileError extends Error {}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

// What a file may hold. Anyone can send a deck file, so nothing in one is trusted: these keep a damaged or
// made-up file from breaking the app (a million copies of a card, a picture too big to draw, a nonsense size).
/** The most copies of a card (as `MAX_COPIES` in types.ts). */
const MAX_COPIES = 99;
/** The roundest corners can be (as `MAX_ROUNDNESS` in types.ts). */
const MAX_ROUNDNESS = 0.25;
/** The longest a name can be (as `MAX_NAME_LENGTH` in names.ts). */
const MAX_NAME = 60;
/** The biggest a single picture in a file can be, as base64 (about 15 MB of picture). */
const MAX_IMAGE_CHARS = 20_000_000;
/** Picture types the app can show. */
const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'heic', 'webp']);

/** The most pixels a picture's side can have: far sharper than any phone shows a card, and safe to draw. */
const MAX_IMAGE_SIDE = 6000;

/**
 * A picture's size in pixels, read from the start of its base64 (a PNG's header, or a JPEG's frame marker), or
 * null if it can't be told from there.
 */
export function imagePixels(base64: string): { w: number; h: number } | null {
  let bytes: Uint8Array;
  try {
    const head = atob(base64.slice(0, 262_144).replace(/=+$/, '').slice(0, Math.floor(Math.min(base64.length, 262_144) / 4) * 4));
    bytes = Uint8Array.from(head, (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
  const u16 = (i: number) => (bytes[i] << 8) | bytes[i + 1];
  const u32 = (i: number) => ((bytes[i] << 24) >>> 0) + (bytes[i + 1] << 16) + (bytes[i + 2] << 8) + bytes[i + 3];
  // PNG: the header chunk comes first.
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes.length >= 24) return { w: u32(16), h: u32(20) };
  // JPEG: walk the markers to a start-of-frame.
  if (bytes[0] === 0xff && bytes[1] === 0xd8) {
    for (let i = 2; i + 9 < bytes.length; ) {
      if (bytes[i] !== 0xff) return null;
      const marker = bytes[i + 1];
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { w: u16(i + 7), h: u16(i + 5) };
      }
      i += 2 + u16(i + 2);
    }
  }
  return null;
}

const nameFrom = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, MAX_NAME).trim() : fallback);
const positive = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0;

/** A card size from a file, if it's one the app knows; anything else is left out (the deck is standard size). */
function shapeFrom(v: unknown, nested = false): CardShape | undefined {
  if (!isObject(v)) return undefined;
  const landscape = v.landscape === true ? { landscape: true } : {};
  if (v.kind === 'standard' || v.kind === 'usMini') return { kind: v.kind, ...landscape };
  if (v.kind === 'custom' && positive(v.width) && positive(v.height)) {
    const unit = v.unit === 'in' || v.unit === 'mm' ? { unit: v.unit as 'in' | 'mm' } : {};
    return { kind: 'custom', width: v.width, height: v.height, ...unit };
  }
  if (v.kind === 'auto' && !nested) {
    const detected = shapeFrom(v.detected, true);
    return detected && detected.kind !== 'auto' ? { kind: 'auto', detected } : { kind: 'auto' };
  }
  return undefined;
}

/** Reads a deck file's contents back into decks (see `unpackFile` for its tables too). */
export const unpackDecks = (text: string): UnpackedDeck[] => unpackFile(text).decks;

/**
 * Reads a deck file's contents back into decks and tables. Throws a DeckFileError if it isn't one, or can't be read.
 */
export function unpackFile(text: string): UnpackedFile {
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
    const ext = found.ext.toLowerCase();
    if (!IMAGE_EXTS.has(ext)) throw new DeckFileError('This deck file has a picture Shufflevale can’t show.');
    const pixels = imagePixels(found.data);
    if (found.data.length > MAX_IMAGE_CHARS || (pixels && Math.max(pixels.w, pixels.h) > MAX_IMAGE_SIDE)) {
      throw new DeckFileError('This deck file has a picture that’s too big to open.');
    }
    return { ext, data: found.data };
  };
  if (!Array.isArray(file.decks) || !file.decks.length) throw new DeckFileError('This file has no decks in it.');
  const decks: UnpackedDeck[] = file.decks.map((d: unknown) => {
    if (!isObject(d) || !Array.isArray(d.cards)) throw new DeckFileError('This deck file is damaged.');
    return {
      ...(idFrom(d.id) ? { fileId: idFrom(d.id) } : {}),
      name: nameFrom(d.name, 'Imported deck'),
      ...(shapeFrom(d.cardShape) ? { cardShape: shapeFrom(d.cardShape) } : {}),
      ...(typeof d.roundness === 'number' && Number.isFinite(d.roundness)
        ? { roundness: Math.min(MAX_ROUNDNESS, Math.max(0, d.roundness)) }
        : {}),
      ...(d.playMode === 'table' || d.playMode === 'reveal' ? { playMode: d.playMode } : {}),
      back: d.back ? image(d.back) : null,
      cards: d.cards.map((c: unknown, i: number) => {
        if (!isObject(c)) throw new DeckFileError('This deck file is damaged.');
        const copies = typeof c.copies === 'number' && c.copies >= 2 ? Math.min(MAX_COPIES, Math.floor(c.copies)) : undefined;
        return {
          ...(idFrom(c.id) ? { fileId: idFrom(c.id) } : {}),
          name: nameFrom(c.name, `Card ${i + 1}`),
          ...(copies ? { copies } : {}),
          image: image(c.image),
          ...(c.back ? { back: image(c.back) } : {}),
        };
      }),
    };
  });
  // Tables: only cards from the file's own decks are kept.
  const known = new Map<string, Set<string>>();
  for (const d of decks) {
    if (d.fileId) known.set(d.fileId, new Set(d.cards.flatMap((c) => (c.fileId ? [c.fileId] : []))));
  }
  const tables = Array.isArray(file.tables) ? file.tables.slice(0, MAX_TABLES).flatMap((t: unknown) => tableFrom(t, known)) : [];
  return { decks, tables };
}

/** The most tables a file is opened with, and the most cards each can hold (as `MAX_TABLE_CARDS` in sandbox.ts). */
const MAX_TABLES = 50;
const MAX_TABLE_CARDS = 1000;
/** Hands a table has (as `HAND_COUNT` in sandbox.ts), and the grid sizes it can have (as `GRID_SIZES`). */
const HANDS = 4;
const GRID_STEPS = [20, 40, 60];

const idFrom = (v: unknown) => (typeof v === 'string' && v.length > 0 && v.length <= 64 ? v : undefined);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * A table from a file, checked: only its cards from the file's own decks, up to the most a table holds; positions
 * and settings only where they make sense. Its cards still point at the file's ids (see `remapTable`).
 */
function tableFrom(v: unknown, known: Map<string, Set<string>>): FileTable[] {
  if (!isObject(v) || !Array.isArray(v.stacks)) return [];
  let count = 0;
  const card = (c: unknown): SandboxCard[] => {
    if (count >= MAX_TABLE_CARDS || !isObject(c) || typeof c.deckId !== 'string' || typeof c.cardId !== 'string') return [];
    if (!known.get(c.deckId)?.has(c.cardId)) return [];
    count++;
    return [{ iid: '', deckId: c.deckId, cardId: c.cardId, faceUp: c.faceUp === true, ...(c.solo === true ? { solo: true } : {}), ...(c.single === true ? { single: true } : {}) }];
  };
  const cards = (list: unknown) => (Array.isArray(list) ? list.flatMap(card) : []);
  const stacks: SandboxStack[] = v.stacks.flatMap((s: unknown) => {
    if (!isObject(s) || !finite(s.x) || !finite(s.y)) return [];
    const inStack = cards(s.cards);
    if (!inStack.length) return [];
    return [{ id: '', x: s.x, y: s.y, angle: finite(s.angle) ? s.angle : 0, cards: inStack, ...(s.locked === true ? { locked: true } : {}) }];
  });
  const hands = Array.from({ length: HANDS }, (_, i) => cards(Array.isArray(v.hands) ? v.hands[i] : undefined));
  const handNames = Array.from({ length: HANDS }, (_, i) => nameFrom(Array.isArray(v.handNames) ? v.handNames[i] : undefined, `Hand ${i + 1}`));
  const trash = cards(v.trash);
  const flag = (key: string) => (v[key] === true ? { [key]: true } : {});
  const cam = isObject(v.camera) ? v.camera : {};
  const camera = finite(cam.a) && finite(cam.b) && finite(cam.tx) && finite(cam.ty) ? { camera: { a: cam.a, b: cam.b, tx: cam.tx, ty: cam.ty } } : {};
  const area = isObject(v.focus) ? v.focus : {};
  const focus = finite(area.x) && finite(area.y) && finite(area.w) && finite(area.h) ? { focus: { x: area.x, y: area.y, w: area.w, h: area.h } } : {};
  return [
    {
      name: nameFrom(v.name, 'Imported table'),
      stacks,
      hands,
      handNames,
      ...(trash.length ? { trash } : {}),
      ...(typeof v.background === 'string' && v.background.length <= 20 ? { background: v.background } : {}),
      ...(typeof v.gridStep === 'number' && GRID_STEPS.includes(v.gridStep) ? { gridStep: v.gridStep } : {}),
      ...flag('snapToGrid'),
      ...flag('lockCamera'),
      ...flag('showGrid'),
      ...flag('hideCounts'),
      ...camera,
      ...focus,
    },
  ];
}

/** Where a file's decks went once added: each deck's new id, and its cards' new ids, by their ids in the file. */
export type DeckIdMap = Map<string, { id: string; cards: Map<string, string> }>;

/**
 * A table from a file pointed at its decks as they were added (see `DeckIdMap`), with fresh ids for its stacks and
 * cards from `ids`. Cards whose deck or card didn't come through are left out.
 */
export function remapTable(t: FileTable, map: DeckIdMap, ids: () => string): FileTable {
  const card = (c: SandboxCard): SandboxCard[] => {
    const deck = map.get(c.deckId);
    const cardId = deck?.cards.get(c.cardId);
    return deck && cardId ? [{ ...c, iid: ids(), deckId: deck.id, cardId }] : [];
  };
  return {
    ...t,
    stacks: t.stacks.flatMap((s) => {
      const cards = s.cards.flatMap(card);
      return cards.length ? [{ ...s, id: ids(), cards }] : [];
    }),
    hands: t.hands.map((h) => h.flatMap(card)),
    ...(t.trash ? { trash: t.trash.flatMap(card) } : {}),
  };
}

/** A file name for a deck file: the deck's name (or "Shufflevale decks" for several), made safe for any disk. */
export function deckFileName(decks: Pick<Deck, 'name'>[]): string {
  return fileNameFor(decks.length === 1 ? decks[0].name : 'Shufflevale decks');
}

/** A file name for a Shufflevale file called `name`, made safe for any disk. */
export function fileNameFor(name: string): string {
  const safe = name.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Shufflevale';
  return `${safe}.shufflevale.json`;
}
