// Pure functions for the play table. Every function returns a new state and never mutates its input.
import { newId } from './id.ts';
import { moveItems } from './order.ts';
import { copiesOf } from './types.ts';
import type { CardInstance, Deck, Spot, TableState, Zone } from './types.ts';

export const ZONES: Zone[] = ['deck', 'hand', 'table', 'discard'];

export type Rng = () => number;

export function shuffled<T>(items: T[], rng: Rng = Math.random): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function createTable(deck: Deck, rng: Rng = Math.random): TableState {
  const ordered = orderedTable(deck);
  return { ...ordered, deck: shuffled(ordered.deck, rng) };
}

/**
 * Every card back in the deck, face down, in the order the deck is arranged in the editor: the first card
 * is on top, and a card's copies sit together.
 */
export function orderedTable(deck: Deck): TableState {
  const instances = deck.cards.flatMap((c) =>
    Array.from({ length: copiesOf(c) }, () => ({ iid: newId(), cardId: c.id, faceUp: false })),
  );
  return { deck: instances, hand: [], table: [], discard: [] };
}

/** Zones whose cards are kept first when a card's copy count drops: cards in play outrank piles. */
const KEEP_ORDER: Zone[] = ['hand', 'table', 'discard', 'deck'];

/**
 * Drops cards whose design was deleted from the deck since the table was saved, and extra copies
 * when a card's copy count was lowered.
 */
export function pruneTable(state: TableState, deck: Deck): TableState {
  const allowed = new Map(deck.cards.map((c) => [c.id, copiesOf(c)]));
  const keep = new Set<string>();
  for (const z of KEEP_ORDER) {
    for (const ci of state[z] ?? []) {
      const left = allowed.get(ci.cardId) ?? 0;
      if (left > 0) {
        keep.add(ci.iid);
        allowed.set(ci.cardId, left - 1);
      }
    }
  }
  const next = { ...state };
  for (const z of ZONES) next[z] = (state[z] ?? []).filter((ci) => keep.has(ci.iid));
  return next;
}

/**
 * Card copies in the deck that are not anywhere on the table, e.g. ones added after the game started.
 * A card id appears once per missing copy.
 */
export function missingCards(state: TableState, deck: Deck): string[] {
  const present = new Map<string, number>();
  for (const z of ZONES) for (const ci of state[z]) present.set(ci.cardId, (present.get(ci.cardId) ?? 0) + 1);
  return deck.cards.flatMap((c) => Array(Math.max(0, copiesOf(c) - (present.get(c.id) ?? 0))).fill(c.id));
}

/** Shuffles cards that are missing from the table into the deck. */
export function addMissingCards(state: TableState, deck: Deck, rng: Rng = Math.random): TableState {
  const added = missingCards(state, deck).map((cardId) => ({ iid: newId(), cardId, faceUp: false }));
  if (added.length === 0) return state;
  return { ...state, deck: shuffled([...state.deck, ...added], rng) };
}

export function findCard(state: TableState, iid: string): { zone: Zone; index: number } | null {
  for (const zone of ZONES) {
    const index = state[zone].findIndex((c) => c.iid === iid);
    if (index !== -1) return { zone, index };
  }
  return null;
}

export type Position = 'top' | 'bottom';

/** Cards face down in the deck, face up everywhere else. */
function defaultFace(zone: Zone): boolean {
  return zone !== 'deck';
}

// ---- Stacks on the play table ----

/** The play table's cards in groups: each stack together (bottom first), and every other card on its own. */
export function stackGroups(cards: CardInstance[]): CardInstance[][] {
  const groups: CardInstance[][] = [];
  for (const c of cards) {
    const last = groups[groups.length - 1];
    if (c.stack && last && last[0].stack === c.stack) last.push(c);
    else groups.push([c]);
  }
  return groups;
}

/** A copy of a card that has left its stack and its spot on the table (it's moving, maybe off the table). */
const unstacked = (c: CardInstance): CardInstance => {
  const { stack: _, spot: __, ...rest } = c;
  return rest;
};

/** A stack down to one card is just a card again. */
function tidyStacks(state: TableState): TableState {
  const sizes = new Map<string, number>();
  for (const c of state.table) if (c.stack) sizes.set(c.stack, (sizes.get(c.stack) ?? 0) + 1);
  if (![...sizes.values()].some((n) => n < 2)) return state;
  return { ...state, table: state.table.map((c) => (c.stack && sizes.get(c.stack)! < 2 ? unstacked(c) : c)) };
}

/**
 * Puts cards (held top first) on top of the card or stack that `targetIid` belongs to on the play table, all
 * facing `faceUp`, or each the way it already was if that's left out. The held stack's top card ends up on top.
 */
export function stackOnto(state: TableState, iids: string[], targetIid: string, faceUp?: boolean): TableState {
  const target = state.table.find((c) => c.iid === targetIid);
  if (!target || iids.includes(targetIid)) return state;
  const stack = target.stack ?? target.iid;
  const moving: CardInstance[] = [];
  for (const iid of iids.slice().reverse()) {
    const found = findCard(state, iid);
    if (found) {
      const c = state[found.zone][found.index];
      moving.push({ ...c, faceUp: faceUp ?? c.faceUp, stack, spot: target.spot });
    }
  }
  const ids = new Set(moving.map((c) => c.iid));
  const next = { ...state };
  for (const z of ZONES) next[z] = state[z].filter((c) => !ids.has(c.iid));
  const table = next.table.map((c) => (c.iid === targetIid ? { ...c, stack } : c));
  // After the stack's current top card.
  let at = -1;
  table.forEach((c, i) => {
    if (c.stack === stack) at = i;
  });
  next.table = [...table.slice(0, at + 1), ...moving, ...table.slice(at + 1)];
  return tidyStacks(next);
}

// ---- The play table's grid ----
// Cards and stacks lie in a grid of spots and can go in any spot, leaving gaps. The grid is as wide as fits on
// screen (`cols`), and as tall as it needs to be.

const spotKey = (s: Spot) => `${s.row}:${s.col}`;
/** Reading order: along each row, top row first. */
const bySpot = (a: Spot, b: Spot) => a.row - b.row || a.col - b.col;

/** The first spot in reading order, from `from` on, that isn't taken. */
function firstFree(taken: Set<string>, cols: number, from: Spot = { row: 0, col: 0 }): Spot {
  for (let i = from.row * cols + Math.min(from.col, cols - 1); ; i++) {
    const s = { row: Math.floor(i / cols), col: i % cols };
    if (!taken.has(spotKey(s))) return s;
  }
}

/**
 * Where each of the table's groups (see `stackGroups`) lies in a grid `cols` wide: in its own spot if it has
 * one that fits the grid and nothing earlier is in, otherwise in the first free spot.
 */
export function gridSpots(cards: CardInstance[], cols: number): Spot[] {
  const groups = stackGroups(cards);
  const taken = new Set<string>();
  const spots: (Spot | null)[] = groups.map((g) => {
    const s = g[0].spot;
    if (!s || s.col >= cols || taken.has(spotKey(s))) return null;
    taken.add(spotKey(s));
    return s;
  });
  return spots.map((s) => {
    if (s) return s;
    const free = firstFree(taken, cols);
    taken.add(spotKey(free));
    return free;
  });
}

/**
 * Writes every group's spot (from `gridSpots`) onto its cards, so cards without one keep where they were put,
 * and sorts the table into reading order. Returns the state unchanged if there was nothing to do.
 */
export function pinSpots(state: TableState, cols: number): TableState {
  const groups = stackGroups(state.table);
  const spots = gridSpots(state.table, cols);
  const sorted = groups.map((g, i) => ({ g, s: spots[i] })).sort((a, b) => bySpot(a.s, b.s));
  const unchanged = sorted.every(({ g, s }, i) => g[0] === groups[i][0] && g.every((c) => c.spot?.row === s.row && c.spot?.col === s.col));
  if (unchanged) return state;
  return { ...state, table: sorted.flatMap(({ g, s }) => g.map((c) => ({ ...c, spot: s }))) };
}

/**
 * Lays cards (listed in the order they should go) on the table starting at `spot`, each in the next free spot
 * after it, in a grid `cols` wide. They face `faceUp`, or face up.
 */
export function placeOnTable(state: TableState, iids: string[], spot: Spot, cols: number, faceUp?: boolean): TableState {
  const moving: CardInstance[] = [];
  for (const iid of iids) {
    const found = findCard(state, iid);
    if (found) moving.push({ ...unstacked(state[found.zone][found.index]), faceUp: faceUp ?? true });
  }
  if (moving.length === 0) return state;
  const ids = new Set(moving.map((c) => c.iid));
  let next: TableState = { ...state };
  for (const z of ZONES) next[z] = state[z].filter((c) => !ids.has(c.iid));
  next = pinSpots(tidyStacks(next), cols);
  const taken = new Set(gridSpots(next.table, cols).map(spotKey));
  const placed = moving.map((c) => {
    const s = firstFree(taken, cols, spot);
    taken.add(spotKey(s));
    return { ...c, spot: s };
  });
  return pinSpots({ ...next, table: [...next.table, ...placed] }, cols);
}

/**
 * Puts cards (listed top first) at `spot` on the table, or the next free spot after it, as one stack: a whole
 * stack moved elsewhere, or held cards put down together. Each card stays the way up it was, unless `faceUp`
 * says otherwise.
 */
export function placeStackOnTable(state: TableState, iids: string[], spot: Spot, cols: number, faceUp?: boolean): TableState {
  const moving: CardInstance[] = [];
  for (const iid of iids.slice().reverse()) {
    const found = findCard(state, iid);
    if (found) {
      const c = state[found.zone][found.index];
      moving.push({ ...unstacked(c), faceUp: faceUp ?? c.faceUp });
    }
  }
  if (moving.length < 2) return placeOnTable(state, iids, spot, cols);
  const ids = new Set(moving.map((c) => c.iid));
  let next: TableState = { ...state };
  for (const z of ZONES) next[z] = state[z].filter((c) => !ids.has(c.iid));
  next = pinSpots(tidyStacks(next), cols);
  const free = firstFree(new Set(gridSpots(next.table, cols).map(spotKey)), cols, spot);
  // Named after its bottom card, as stacks made by `stackOnto` are.
  const stack = moving[0].iid;
  return pinSpots({ ...next, table: [...next.table, ...moving.map((c) => ({ ...c, stack, spot: free }))] }, cols);
}

/** `faceUp` overrides the zone's usual facing, e.g. a card dragged from the deck and not yet revealed. */
export function moveCard(state: TableState, iid: string, to: Zone, position?: Position, faceUp?: boolean): TableState {
  const found = findCard(state, iid);
  if (!found) return state;
  const card = state[found.zone][found.index];
  const next = { ...state, [found.zone]: state[found.zone].filter((c) => c.iid !== iid) };
  const moved: CardInstance = { ...unstacked(card), faceUp: faceUp ?? defaultFace(to) };
  // Piles grow from the top; hand and table grow to the right.
  const pos = position ?? (to === 'deck' || to === 'discard' ? 'top' : 'bottom');
  next[to] = pos === 'top' ? [moved, ...next[to]] : [...next[to], moved];
  return tidyStacks(next);
}

/**
 * Moves a held stack of cards (listed top first) to a zone, all facing the same way. On the deck and discard
 * pile the stack's top card ends up on top; in the hand and on the table they're laid out in stack order.
 */
export function moveCards(state: TableState, iids: string[], to: Zone, faceUp?: boolean): TableState {
  const pile = to === 'deck' || to === 'discard';
  const order = pile ? iids.slice().reverse() : iids;
  return order.reduce((s, iid) => moveCard(s, iid, to, pile ? 'top' : 'bottom', faceUp), state);
}

/**
 * Puts cards (listed in the order they should appear) into a zone at a position, e.g. dropping them between
 * two cards in the hand. `index` counts the zone's cards once these have been taken out of wherever they were,
 * so the same zone can be rearranged in place. They face `faceUp`, or the zone's usual way.
 */
export function insertCards(state: TableState, iids: string[], to: Zone, index: number, faceUp?: boolean): TableState {
  const moving: CardInstance[] = [];
  for (const iid of iids) {
    const found = findCard(state, iid);
    if (found) moving.push({ ...unstacked(state[found.zone][found.index]), faceUp: faceUp ?? defaultFace(to) });
  }
  if (moving.length === 0) return state;
  const ids = new Set(moving.map((c) => c.iid));
  const next = { ...state };
  for (const z of ZONES) next[z] = state[z].filter((c) => !ids.has(c.iid));
  const at = Math.max(0, Math.min(next[to].length, index));
  next[to] = [...next[to].slice(0, at), ...moving, ...next[to].slice(at)];
  return tidyStacks(next);
}

export function draw(state: TableState, count = 1): TableState {
  let next = state;
  for (let i = 0; i < count && next.deck.length > 0; i++) {
    next = moveCard(next, next.deck[0].iid, 'hand');
  }
  return next;
}

export function takeTopOfDiscard(state: TableState, to: Zone = 'hand'): TableState {
  if (state.discard.length === 0) return state;
  return moveCard(state, state.discard[0].iid, to);
}

/**
 * Rearranges the deck or discard pile, e.g. from the search: the picked cards (by index, in pick order) go
 * together as a block starting at index `to`, where index 0 is the top card.
 */
export function reorderPile(state: TableState, zone: 'deck' | 'discard', picked: number[], to: number): TableState {
  return { ...state, [zone]: moveItems(state[zone], picked, to) };
}

export function shuffleZone(state: TableState, zone: Zone, rng: Rng = Math.random): TableState {
  return { ...state, [zone]: shuffled(state[zone], rng) };
}

/** Puts the whole discard pile into the deck face down, then shuffles the deck. */
export function shuffleDiscardIntoDeck(state: TableState, rng: Rng = Math.random): TableState {
  const returned = state.discard.map((c) => ({ ...c, faceUp: false }));
  return { ...state, discard: [], deck: shuffled([...state.deck, ...returned], rng) };
}

export function discardHand(state: TableState): TableState {
  return { ...state, hand: [], discard: [...state.hand.slice().reverse(), ...state.discard] };
}

export function flip(state: TableState, iid: string): TableState {
  const found = findCard(state, iid);
  if (!found) return state;
  const zone = state[found.zone].map((c) => (c.iid === iid ? { ...c, faceUp: !c.faceUp } : c));
  return { ...state, [found.zone]: zone };
}

/** Turns each of these cards the other way up, wherever they are. */
export function flipAll(state: TableState, iids: string[]): TableState {
  return iids.reduce(flip, state);
}

/**
 * Turns a table stack over as a whole, where it lies: its order reverses, so the bottom card is now on top,
 * and each card is the other way up.
 */
export function turnStackOver(state: TableState, stackIid: string, cols: number): TableState {
  const groups = stackGroups(state.table);
  const i = groups.findIndex((g) => g.some((c) => c.iid === stackIid));
  if (i === -1 || groups[i].length < 2) return state;
  const spot = gridSpots(state.table, cols)[i];
  const ids = groups[i].map((c) => c.iid);
  // Listed top first, the old bottom card is now the top.
  return placeStackOnTable(flipAll(state, ids), ids, spot, cols);
}

/** Gathers every card back into the deck, face down and shuffled. */
export function resetTable(state: TableState, rng: Rng = Math.random): TableState {
  const all = ZONES.flatMap((z) => state[z]).map((c) => ({ ...unstacked(c), faceUp: false }));
  return { deck: shuffled(all, rng), hand: [], table: [], discard: [] };
}

export function cardCount(state: TableState): number {
  return ZONES.reduce((n, z) => n + state[z].length, 0);
}
