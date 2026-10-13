// Pure functions for the play table. Every function returns a new state and never mutates its input.
import { newId } from './id.ts';
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
  const instances = deck.cards.map((c) => ({ iid: newId(), cardId: c.id, faceUp: false }));
  return { deck: shuffled(instances, rng), hand: [], table: [], discard: [] };
}

/** Drops cards whose design was deleted from the deck since the table was saved. */
export function pruneTable(state: TableState, deck: Deck): TableState {
  const ids = new Set(deck.cards.map((c) => c.id));
  const next = { ...state };
  for (const z of ZONES) next[z] = (state[z] ?? []).filter((ci) => ids.has(ci.cardId));
  return next;
}

/** Card designs in the deck that have no copy anywhere on the table, e.g. ones added after the game started. */
export function missingCards(state: TableState, deck: Deck): string[] {
  const present = new Set(ZONES.flatMap((z) => state[z].map((c) => c.cardId)));
  return deck.cards.filter((c) => !present.has(c.id)).map((c) => c.id);
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

export function moveCard(state: TableState, iid: string, to: Zone, position?: Position): TableState {
  const found = findCard(state, iid);
  if (!found) return state;
  const card = state[found.zone][found.index];
  const next = { ...state, [found.zone]: state[found.zone].filter((c) => c.iid !== iid) };
  const moved: CardInstance = { ...card, faceUp: defaultFace(to) };
  // Piles grow from the top; hand and table grow to the right.
  const pos = position ?? (to === 'deck' || to === 'discard' ? 'top' : 'bottom');
  next[to] = pos === 'top' ? [moved, ...next[to]] : [...next[to], moved];
  return next;
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
