/** A card design inside a deck. `image` is a path relative to the app's document directory. */
export interface Card {
  id: string;
  name: string;
  image: string;
  /**
   * The picture the card was cut from, uncropped and turned as it was cropped (relative path), so the card can
   * be cut again to fit when the card size changes. Missing for cards added before this was kept.
   */
  original?: string;
  /** How many copies of this card are in the deck. Missing means 1 (decks saved before this existed). */
  copies?: number;
  /** Its own back (relative path), for a card with two different sides; missing means the deck's back. */
  back?: string;
  /** The picture its own back was cut from, to cut again if the card size changes. */
  backOriginal?: string;
}

export function copiesOf(card: Card): number {
  return card.copies ?? 1;
}

/** Total number of physical cards in a deck, counting copies. */
export function deckSize(deck: Deck): number {
  return deck.cards.reduce((n, c) => n + copiesOf(c), 0);
}

/** The units a custom card size is typed in. */
export type SizeUnit = 'in' | 'mm';

/**
 * A card size that's been settled. Presets are portrait unless `landscape` is set; custom sizes are landscape when
 * wider than tall, in `unit` (sizes saved before units were asked for have none: see `cardSizeMm`).
 */
export type FixedShape =
  | { kind: 'standard'; landscape?: boolean }
  | { kind: 'usMini'; landscape?: boolean }
  | { kind: 'custom'; width: number; height: number; unit?: SizeUnit };

/**
 * The physical card size a deck is printed at: a settled one, or `auto`, worked out from the first art added to
 * the deck (`detected`, once it has been; a standard card until then).
 */
export type CardShape = FixedShape | { kind: 'auto'; detected?: FixedShape };

/** The size a shape stands for now: an automatic one's detected size, or a standard card until it has one. */
export function settledShape(shape: CardShape | undefined): FixedShape {
  if (!shape) return { kind: 'standard' };
  return shape.kind === 'auto' ? (shape.detected ?? { kind: 'standard' }) : shape;
}

export function isLandscape(shape: CardShape): boolean {
  const s = settledShape(shape);
  return s.kind === 'custom' ? s.width > s.height : !!s.landscape;
}

/** Width-to-height ratios of the preset sizes, held upright. */
export const PRESET_RATIOS = {
  /** Poker size, 2.5 × 3.5 in. */
  standard: 5 / 7,
  /** 41 × 63 mm. */
  usMini: 41 / 63,
} as const;

/** Keeps custom sizes to shapes a card could plausibly be, so layouts can't collapse. */
const MIN_RATIO = 0.25;
const MAX_RATIO = 4;

/** The deck's card width divided by its height. */
export function cardRatio(deck: Pick<Deck, 'cardShape'>): number {
  const shape = settledShape(deck.cardShape);
  if (shape.kind !== 'custom') return shape.landscape ? 1 / PRESET_RATIOS[shape.kind] : PRESET_RATIOS[shape.kind];
  const ratio = shape.width / shape.height;
  return Number.isFinite(ratio) ? Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio)) : PRESET_RATIOS.standard;
}

/** Real card sizes of the presets, in millimeters, held upright. */
export const PRESET_SIZES_MM = {
  /** Poker size, 2.5 × 3.5 in. */
  standard: { w: 63.5, h: 88.9 },
  usMini: { w: 41, h: 63 },
} as const;

/**
 * The smallest and biggest a card's side can be, in millimeters (about 0.6 in to 11.8 in): from a tiny token to a
 * big board tile. Much bigger and a table would try to draw pictures far too large for the phone.
 */
export const MIN_SIDE_MM = 15;
export const MAX_SIDE_MM = 300;

/** Whether a typed side is a size a card can be (see `MIN_SIDE_MM`, `MAX_SIDE_MM`). */
export function sideInRange(side: { value: number; unit: SizeUnit }): boolean {
  const mm = side.unit === 'in' ? side.value * 25.4 : side.value;
  return mm >= MIN_SIDE_MM - 0.05 && mm <= MAX_SIDE_MM + 0.05;
}

/** Custom sizes saved without a unit, this small, are taken as inches (no card is 12 mm across). */
const INCH_LIMIT = 12;

/**
 * A deck's real card size, in millimeters, as its cards lie: a landscape card is the same card as a portrait
 * one, turned, so the same size with its sides swapped.
 */
export function cardSizeMm(deck: Pick<Deck, 'cardShape'>): { w: number; h: number } {
  const shape = settledShape(deck.cardShape);
  if (shape.kind !== 'custom') {
    const s = PRESET_SIZES_MM[shape.kind];
    return shape.landscape ? { w: s.h, h: s.w } : { w: s.w, h: s.h };
  }
  const inches = shape.unit ? shape.unit === 'in' : shape.width <= INCH_LIMIT && shape.height <= INCH_LIMIT;
  const k = inches ? 25.4 : 1;
  // The same shape limits as `cardRatio`, kept to the long side.
  const ratio = cardRatio(deck);
  // Kept to sizes a card can be, for sizes saved before there were limits.
  const typed = Math.max(shape.width, shape.height) * k;
  if (!Number.isFinite(typed) || typed <= 0) return { ...PRESET_SIZES_MM.standard };
  const long = Math.min(MAX_SIDE_MM, Math.max(MIN_SIDE_MM, typed));
  return ratio >= 1 ? { w: long, h: long / ratio } : { w: long * ratio, h: long };
}

/** How close (as a share) a picture's shape must come to a preset's to be taken for it. */
const PRESET_MATCH = 0.03;

/**
 * The card size a picture of a card looks like, from its shape (width / height): Standard or US Mini, either way
 * up, when it's within a few percent of one; otherwise its own shape, as tall (or as wide) as a standard card.
 */
export function detectShape(ratio: number): FixedShape {
  const landscape = ratio > 1;
  const upright = landscape ? 1 / ratio : ratio;
  for (const kind of ['standard', 'usMini'] as const) {
    if (Math.abs(upright / PRESET_RATIOS[kind] - 1) <= PRESET_MATCH) return { kind, landscape };
  }
  const long = PRESET_SIZES_MM.standard.h;
  const short = Math.round(long * Math.min(MAX_RATIO, Math.max(MIN_RATIO, upright)) * 10) / 10;
  return landscape ? { kind: 'custom', width: long, height: short, unit: 'mm' } : { kind: 'custom', width: short, height: long, unit: 'mm' };
}

/** A typed size, e.g. "2.5in", "63.5 mm" or "2,5 in": its number and unit, or null if either is missing. */
export function parseSizeWithUnit(text: string): { value: number; unit: SizeUnit } | null {
  const m = text.trim().match(/^(\d+(?:[.,]\d*)?|[.,]\d+)\s*(in|inch|inches|"|mm)$/i);
  if (!m) return null;
  const value = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return null;
  return { value, unit: m[2].toLowerCase() === 'mm' ? 'mm' : 'in' };
}
/** How round a card's corners are when a deck doesn't say: its corner radius, as a share of its width. */
export const DEFAULT_ROUNDNESS = 0.06;
/** The roundest corners can be (a quarter of the width: very round). */
export const MAX_ROUNDNESS = 0.25;

/** A card's corner radius, in points, drawn this wide: the deck's roundness (square cards have none). */
export function cardRadius(deck: Pick<Deck, 'roundness'>, width: number): number {
  const r = Math.min(MAX_ROUNDNESS, Math.max(0, deck.roundness ?? DEFAULT_ROUNDNESS));
  // Small cards keep a little rounding, so they don't look square, unless they're meant to be.
  return r === 0 ? 0 : Math.max(Math.min(4, width * MAX_ROUNDNESS), width * r);
}

/** `table`: deck, discard, play area and hand. `reveal`: just the deck and discard pile, for turning cards over one at a time. */
export type PlayMode = 'table' | 'reveal';

export interface Deck {
  id: string;
  name: string;
  /** Missing means 'table' (decks saved before modes existed). */
  playMode?: PlayMode;
  /** The hand's tray on the play table is folded away (giving the table more room). Missing means open. */
  handFolded?: boolean;
  /** Missing means standard (decks saved before sizes existed). */
  cardShape?: CardShape;
  /** How round the cards' corners are: the corner radius as a share of the width. Missing means the default. */
  roundness?: number;
  /** The home-screen group it's filed under, if any (see lib/groups.ts). */
  groupId?: string;
  /** Relative image path for the card back, or null to use the built-in back. */
  backImage: string | null;
  /**
   * The picture the back was cut from, uncropped (relative path), so it can be cut again to fit when the card
   * size changes (a landscape photo cropped for portrait cards has lost its sides). Missing for backs set
   * before this was kept.
   */
  backOriginal?: string | null;
  cards: Card[];
  createdAt: number;
  updatedAt: number;
}

/** A set of decks played together, e.g. a game's spawn, item and event decks. Swipe between them while playing. */
export interface Session {
  id: string;
  name: string;
  /** In the order they appear when swiping. */
  deckIds: string[];
  createdAt: number;
  updatedAt: number;
}

/**
 * Where a card can sit while playing. `trash` is out of the game, but kept: trashed cards can be found in the
 * search and brought back, and resetting the table gathers them back into the deck.
 */
export type Zone = 'deck' | 'hand' | 'table' | 'discard' | 'trash';

/** One physical copy of a card on the table. */
export interface CardInstance {
  /** Unique per instance, so duplicate cards can be told apart. */
  iid: string;
  cardId: string;
  faceUp: boolean;
  /**
   * On the play table only: cards sharing this id form a stack. They sit next to each other in the table's
   * list, bottom first, so the last of them is the top card. Cards elsewhere, or alone, have none.
   */
  stack?: string;
  /**
   * On the play table only: the grid spot it lies in. Every card of a stack shares its stack's spot. Cards
   * without one (e.g. played from a menu, or saved before the table had a grid) get the first free spot.
   */
  spot?: Spot;
}

/** A spot in the play table's grid, counted from the top left. */
export interface Spot {
  row: number;
  col: number;
}

/** Index 0 is the top of the deck/discard pile (and the most recently trashed card), and the leftmost card in hand/table. */
export type TableState = Record<Zone, CardInstance[]>;
