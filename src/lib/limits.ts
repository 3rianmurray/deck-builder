// What the free version holds: up to 60 cards in all, across the player's own decks. The app's own example decks
// (Playing Cards, the walkthrough's sample) don't count, though cards added to them do. Shufflevale Pro takes the
// limit away. Pure logic here, so it can be tested.
import type { Deck } from './types';

/** How many cards the free version holds, across the player's own decks. */
export const FREE_CARD_LIMIT = 60;

/** Example decks, by id, and how many of their cards are the app's own (not counted). */
export type Allowances = ReadonlyMap<string, number>;

/** How many cards count toward the free limit: each card once (copies are free), past any deck's allowance. */
export function cardsUsed(decks: Pick<Deck, 'id' | 'cards'>[], allowances: Allowances): number {
  return decks.reduce((n, d) => n + Math.max(0, d.cards.length - (allowances.get(d.id) ?? 0)), 0);
}

/** How many more cards can be added: unlimited with Pro. */
export function cardRoom(decks: Pick<Deck, 'id' | 'cards'>[], allowances: Allowances, pro: boolean): number {
  return pro ? Infinity : Math.max(0, FREE_CARD_LIMIT - cardsUsed(decks, allowances));
}
