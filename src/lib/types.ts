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
}

export function copiesOf(card: Card): number {
  return card.copies ?? 1;
}

/** Total number of physical cards in a deck, counting copies. */
export function deckSize(deck: Deck): number {
  return deck.cards.reduce((n, c) => n + copiesOf(c), 0);
}

/**
 * The physical card size a deck is printed at. Presets are portrait unless `landscape` is set; custom sizes are
 * in any unit, since only the ratio matters, and are landscape when wider than tall.
 */
export type CardShape =
  | { kind: 'standard'; landscape?: boolean }
  | { kind: 'usMini'; landscape?: boolean }
  | { kind: 'custom'; width: number; height: number };

export function isLandscape(shape: CardShape): boolean {
  return shape.kind === 'custom' ? shape.width > shape.height : !!shape.landscape;
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
  const shape = deck.cardShape ?? { kind: 'standard' };
  if (shape.kind !== 'custom') return shape.landscape ? 1 / PRESET_RATIOS[shape.kind] : PRESET_RATIOS[shape.kind];
  const ratio = shape.width / shape.height;
  return Number.isFinite(ratio) ? Math.min(MAX_RATIO, Math.max(MIN_RATIO, ratio)) : PRESET_RATIOS.standard;
}

/** Real card sizes of the presets, in millimetres, held upright. */
export const PRESET_SIZES_MM = {
  /** Poker size, 2.5 × 3.5 in. */
  standard: { w: 63.5, h: 88.9 },
  usMini: { w: 41, h: 63 },
} as const;

/** Custom sizes this small are taken as inches (no card is 12 mm across); anything larger, as millimetres. */
const INCH_LIMIT = 12;

/**
 * A deck's real card size, in millimetres, as its cards lie: a landscape card is the same card as a portrait
 * one, turned, so the same size with its sides swapped. Custom sizes may be typed in inches or millimetres.
 */
export function cardSizeMm(deck: Pick<Deck, 'cardShape'>): { w: number; h: number } {
  const shape = deck.cardShape ?? { kind: 'standard' };
  if (shape.kind !== 'custom') {
    const s = PRESET_SIZES_MM[shape.kind];
    return shape.landscape ? { w: s.h, h: s.w } : { w: s.w, h: s.h };
  }
  const inches = shape.width <= INCH_LIMIT && shape.height <= INCH_LIMIT;
  const k = inches ? 25.4 : 1;
  // The same shape limits as `cardRatio`, kept to the long side.
  const ratio = cardRatio(deck);
  const long = Math.max(shape.width, shape.height) * k;
  if (!Number.isFinite(long) || long <= 0) return { ...PRESET_SIZES_MM.standard };
  return ratio >= 1 ? { w: long, h: long / ratio } : { w: long * ratio, h: long };
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
