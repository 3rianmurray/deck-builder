import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cardRoom, cardsUsed, FREE_CARD_LIMIT } from './limits.ts';

const deck = (id: string, n: number, copies = 1) => ({
  id,
  cards: Array.from({ length: n }, (_, i) => ({ id: `${id}${i}`, name: '', image: '', copies })),
});
const none = new Map<string, number>();

test('the free version counts every card in the player’s own decks once, copies free', () => {
  assert.equal(cardsUsed([deck('a', 10, 4), deck('b', 5)], none), 15);
});
test('the app’s own example cards don’t count, but cards added to an example deck do', () => {
  const examples = new Map([['cards', 52]]);
  assert.equal(cardsUsed([deck('cards', 52), deck('mine', 8)], examples), 8);
  assert.equal(cardsUsed([deck('cards', 60), deck('mine', 8)], examples), 16);
});
test('room left: what’s under the limit, never below none; unlimited with Pro', () => {
  assert.equal(cardRoom([deck('a', 40)], none, false), FREE_CARD_LIMIT - 40);
  assert.equal(cardRoom([deck('a', 70)], none, false), 0);
  assert.equal(cardRoom([deck('a', 70)], none, true), Infinity);
  // Splitting cards across decks doesn't get round it.
  assert.equal(cardRoom([deck('a', 30), deck('b', 30)], none, false), 0);
});
