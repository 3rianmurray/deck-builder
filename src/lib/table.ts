// Pure functions for the play table. Every function returns a new state and never mutates its input.
import { newId } from './id.ts';
import { copiesOf } from './types.ts';
import type { CardInstance, Deck, TableState, Zone } from './types.ts';

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

/** `faceUp` overrides the zone's usual facing, e.g. a card dragged from the deck and not yet revealed. */
export function moveCard(state: TableState, iid: string, to: Zone, position?: Position, faceUp?: boolean): TableState {
  const found = findCard(state, iid);
  if (!found) return state;
  const card = state[found.zone][found.index];
  const next = { ...state, [found.zone]: state[found.zone].filter((c) => c.iid !== iid) };
  const moved: CardInstance = { ...card, faceUp: faceUp ?? defaultFace(to) };
  // Piles grow from the top; hand and table grow to the right.
  const pos = position ?? (to === 'deck' || to === 'discard' ? 'top' : 'bottom');
  next[to] = pos === 'top' ? [moved, ...next[to]] : [...next[to], moved];
  return next;
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

/** Gathers every card back into the deck, face down and shuffled. */
export function resetTable(state: TableState, rng: Rng = Math.random): TableState {
  const all = ZONES.flatMap((z) => state[z]).map((c) => ({ ...c, faceUp: false }));
  return { deck: shuffled(all, rng), hand: [], table: [], discard: [] };
}

export function cardCount(state: TableState): number {
  return ZONES.reduce((n, z) => n + state[z].length, 0);
}
