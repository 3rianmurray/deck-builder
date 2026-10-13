/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addMissingCards,
  cardCount,
  createTable,
  discardHand,
  draw,
  findCard,
  flip,
  missingCards,
  moveCard,
  pruneTable,
  resetTable,
  shuffleDiscardIntoDeck,
  takeTopOfDiscard,
} from './table.ts';
import type { Deck } from './types.ts';

function makeDeck(n: number): Deck {
  return {
    id: 'd',
    name: 'Test',
    backImage: null,
    createdAt: 0,
    updatedAt: 0,
    cards: Array.from({ length: n }, (_, i) => ({ id: `c${i}`, name: `Card ${i}`, image: `${i}.jpg` })),
  };
}

const noShuffle = () => 0.999999; // Fisher-Yates with rng≈1 leaves order unchanged

test('createTable puts every card face down in the deck', () => {
  const t = createTable(makeDeck(5), noShuffle);
  assert.equal(t.deck.length, 5);
  assert.ok(t.deck.every((c) => !c.faceUp));
  assert.deepEqual(t.deck.map((c) => c.cardId), ['c0', 'c1', 'c2', 'c3', 'c4']);
});

test('draw moves cards from the top of the deck into hand, face up', () => {
  const t = draw(createTable(makeDeck(5), noShuffle), 2);
  assert.deepEqual(t.hand.map((c) => c.cardId), ['c0', 'c1']);
  assert.ok(t.hand.every((c) => c.faceUp));
  assert.equal(t.deck.length, 3);
});

test('draw stops when the deck runs out', () => {
  const t = draw(createTable(makeDeck(2), noShuffle), 5);
  assert.equal(t.hand.length, 2);
  assert.equal(t.deck.length, 0);
});

test('discard goes on top of the pile and can be taken back', () => {
  let t = draw(createTable(makeDeck(3), noShuffle), 2);
  t = moveCard(t, t.hand[0].iid, 'discard');
  t = moveCard(t, t.hand[0].iid, 'discard');
  assert.deepEqual(t.discard.map((c) => c.cardId), ['c1', 'c0']);
  t = takeTopOfDiscard(t);
  assert.deepEqual(t.hand.map((c) => c.cardId), ['c1']);
  assert.deepEqual(t.discard.map((c) => c.cardId), ['c0']);
});

test('moving a card to the deck turns it face down, top or bottom', () => {
  let t = draw(createTable(makeDeck(3), noShuffle), 2);
  t = moveCard(t, t.hand[0].iid, 'deck', 'bottom');
  assert.equal(t.deck.at(-1)!.cardId, 'c0');
  assert.equal(t.deck.at(-1)!.faceUp, false);
  t = moveCard(t, t.hand[0].iid, 'deck', 'top');
  assert.equal(t.deck[0].cardId, 'c1');
});

test('searching the deck lets any card be pulled out', () => {
  let t = createTable(makeDeck(5), noShuffle);
  const target = t.deck[3].iid;
  t = moveCard(t, target, 'hand');
  assert.equal(findCard(t, target)?.zone, 'hand');
  assert.equal(t.deck.length, 4);
});

test('flip toggles a card in place', () => {
  let t = draw(createTable(makeDeck(1), noShuffle));
  t = moveCard(t, t.hand[0].iid, 'table');
  t = flip(t, t.table[0].iid);
  assert.equal(t.table[0].faceUp, false);
});

test('discardHand and shuffleDiscardIntoDeck keep every card', () => {
  let t = discardHand(draw(createTable(makeDeck(6)), 4));
  assert.equal(t.discard.length, 4);
  t = shuffleDiscardIntoDeck(t);
  assert.equal(t.deck.length, 6);
  assert.ok(t.deck.every((c) => !c.faceUp));
  assert.equal(cardCount(t), 6);
});

test('resetTable gathers everything back into the deck', () => {
  let t = draw(createTable(makeDeck(6)), 4);
  t = moveCard(t, t.hand[0].iid, 'table');
  t = moveCard(t, t.hand[0].iid, 'discard');
  t = resetTable(t);
  assert.equal(t.deck.length, 6);
  assert.equal(t.hand.length + t.table.length + t.discard.length, 0);
});

test('pruneTable drops cards removed from the deck', () => {
  const deck = makeDeck(3);
  const t = draw(createTable(deck, noShuffle), 1);
  const pruned = pruneTable(t, { ...deck, cards: deck.cards.filter((c) => c.id !== 'c0') });
  assert.equal(pruned.hand.length, 0);
  assert.equal(cardCount(pruned), 2);
});

test('state is never mutated', () => {
  const t = createTable(makeDeck(3), noShuffle);
  const snapshot = JSON.stringify(t);
  draw(t, 2);
  moveCard(t, t.deck[1].iid, 'discard');
  resetTable(t);
  assert.equal(JSON.stringify(t), snapshot);
});

test('cards added to the deck after the game started can be shuffled in', () => {
  const deck = makeDeck(2);
  const t = draw(createTable(deck, noShuffle), 1);
  const bigger = { ...deck, cards: [...deck.cards, { id: 'new', name: 'New', image: 'n.jpg' }] };
  assert.deepEqual(missingCards(t, bigger), ['new']);
  const next = addMissingCards(t, bigger);
  assert.equal(cardCount(next), 3);
  assert.equal(next.hand.length, 1);
  assert.deepEqual(missingCards(next, bigger), []);
});
