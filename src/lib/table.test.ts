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
  flipAll,
  gridSpots,
  insertCards,
  missingCards,
  moveCard,
  moveCards,
  orderedTable,
  pinSpots,
  placeOnTable,
  placeStackOnTable,
  pruneTable,
  reorderPile,
  resetTable,
  shuffleDiscardIntoDeck,
  spreadStack,
  stackGroups,
  stackOnto,
  takeTopOfDiscard,
  turnStackOver,
} from './table.ts';
import type { Deck, TableState } from './types.ts';

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

test('moveCard can keep a card face down outside the deck', () => {
  let t = createTable(makeDeck(2), noShuffle);
  t = moveCard(t, t.deck[0].iid, 'table', undefined, false);
  assert.equal(t.table[0].faceUp, false);
  t = moveCard(t, t.table[0].iid, 'hand');
  assert.equal(t.hand[0].faceUp, true);
});

test('moveCards keeps a held stack together, top card on top of a pile', () => {
  let t = draw(createTable(makeDeck(5), noShuffle), 2); // hand: c0, c1
  const stack = [t.hand[1].iid, t.hand[0].iid, t.deck[0].iid]; // c1 on top, then c0, then c2
  t = moveCards(t, stack, 'discard');
  assert.deepEqual(t.discard.map((c) => c.cardId), ['c1', 'c0', 'c2']);
  assert.ok(t.discard.every((c) => c.faceUp));
  assert.equal(t.hand.length, 0);
  t = moveCards(t, t.discard.map((c) => c.iid), 'table', false);
  assert.deepEqual(t.table.map((c) => c.cardId), ['c1', 'c0', 'c2']);
  assert.ok(t.table.every((c) => !c.faceUp));
});

test('insertCards drops cards between others, and rearranges a zone in place', () => {
  let t = draw(createTable(makeDeck(6), noShuffle), 4); // hand: c0 c1 c2 c3
  // Move c3 to the front of the hand.
  t = insertCards(t, [t.hand[3].iid], 'hand', 0);
  assert.deepEqual(t.hand.map((c) => c.cardId), ['c3', 'c0', 'c1', 'c2']);
  // Move c0 to after c2 (index counts the hand without c0: c3 c1 c2 → after c2 is 3).
  t = insertCards(t, [t.hand[1].iid], 'hand', 3);
  assert.deepEqual(t.hand.map((c) => c.cardId), ['c3', 'c1', 'c2', 'c0']);
  // Two cards from the deck go between c3 and c1, in the order given, face down if asked.
  t = insertCards(t, [t.deck[1].iid, t.deck[0].iid], 'hand', 1, false);
  assert.deepEqual(t.hand.map((c) => c.cardId), ['c3', 'c5', 'c4', 'c1', 'c2', 'c0']);
  assert.equal(t.hand[1].faceUp, false);
  assert.equal(t.deck.length, 0);
  assert.equal(cardCount(t), 6);
});

test('cards can be stacked on a table card, and leave the stack when moved off', () => {
  let t = draw(createTable(makeDeck(6), noShuffle), 4); // hand: c0 c1 c2 c3
  t = insertCards(t, [t.hand[0].iid, t.hand[1].iid], 'table', 0); // table: c0 c1
  const c0 = t.table[0].iid;
  // Stack c2 then c3 (held with c3 on top) onto c0.
  t = stackOnto(t, [t.hand[1].iid, t.hand[0].iid], c0);
  assert.deepEqual(t.table.map((c) => c.cardId), ['c0', 'c2', 'c3', 'c1']);
  assert.deepEqual(stackGroups(t.table).map((g) => g.map((c) => c.cardId)), [['c0', 'c2', 'c3'], ['c1']]);
  // Stacking onto any card of a stack puts it on top of that stack, turned to face the stack's way (the deck's
  // card was face down; the stack is face up).
  t = stackOnto(t, [t.deck[0].iid], t.table[1].iid);
  assert.deepEqual(stackGroups(t.table)[0].map((c) => c.cardId), ['c0', 'c2', 'c3', 'c4']);
  assert.ok(stackGroups(t.table)[0].every((c) => c.faceUp));
  // Taking the top three off one at a time leaves a single card, which is no longer a stack.
  for (let i = 0; i < 3; i++) t = moveCard(t, stackGroups(t.table)[0].at(-1)!.iid, 'hand');
  assert.equal(t.table[0].stack, undefined);
  assert.ok(t.hand.every((c) => c.stack === undefined));
});

test('cards can be placed in any spot of the table grid, leaving gaps', () => {
  let t = draw(createTable(makeDeck(6), noShuffle), 4); // hand: c0 c1 c2 c3
  t = placeOnTable(t, [t.hand[0].iid], { row: 2, col: 1 }, 3);
  t = placeOnTable(t, [t.hand[0].iid], { row: 0, col: 2 }, 3);
  assert.deepEqual(gridSpots(t.table, 3), [{ row: 0, col: 2 }, { row: 2, col: 1 }]);
  // Kept in reading order, so stepping through the table goes along the rows.
  assert.deepEqual(t.table.map((c) => c.cardId), ['c1', 'c0']);
  // Several cards go into the spot and the free ones after it, wrapping onto the next row.
  t = placeOnTable(t, [t.hand[0].iid, t.hand[1].iid], { row: 0, col: 1 }, 3);
  assert.deepEqual(
    t.table.map((c) => [c.cardId, c.spot]),
    [['c2', { row: 0, col: 1 }], ['c1', { row: 0, col: 2 }], ['c3', { row: 1, col: 0 }], ['c0', { row: 2, col: 1 }]],
  );
});

test('cards without a spot fill the first free ones, and pinning keeps them there', () => {
  let t = draw(createTable(makeDeck(4), noShuffle), 3);
  t = placeOnTable(t, [t.hand[0].iid], { row: 0, col: 1 }, 3); // c0 at (0,1)
  t = moveCard(t, t.hand[0].iid, 'table'); // c1, no spot yet
  assert.equal(t.table[1].spot, undefined);
  assert.deepEqual(gridSpots(t.table, 3)[1], { row: 0, col: 0 });
  t = pinSpots(t, 3);
  assert.deepEqual(t.table.map((c) => [c.cardId, c.spot]), [['c1', { row: 0, col: 0 }], ['c0', { row: 0, col: 1 }]]);
  assert.equal(pinSpots(t, 3), t);
  // Taking c0 away leaves c1 where it is, and c0 loses its spot.
  t = moveCard(t, t.table[1].iid, 'hand');
  assert.deepEqual(t.table[0].spot, { row: 0, col: 0 });
  assert.ok(t.hand.every((c) => c.spot === undefined));
});

test('a narrower grid moves cards that no longer fit into free spots', () => {
  let t = draw(createTable(makeDeck(2), noShuffle), 2);
  t = placeOnTable(t, [t.hand[0].iid], { row: 0, col: 0 }, 4);
  t = placeOnTable(t, [t.hand[0].iid], { row: 0, col: 3 }, 4);
  assert.deepEqual(gridSpots(t.table, 3), [{ row: 0, col: 0 }, { row: 0, col: 1 }]);
});

test('stacking puts cards in the stack\'s spot', () => {
  let t = draw(createTable(makeDeck(3), noShuffle), 2);
  t = placeOnTable(t, [t.hand[0].iid], { row: 1, col: 2 }, 3);
  t = stackOnto(t, [t.hand[0].iid], t.table[0].iid);
  assert.ok(t.table.every((c) => c.spot?.row === 1 && c.spot?.col === 2));
  assert.deepEqual(gridSpots(t.table, 3), [{ row: 1, col: 2 }]);
});

test('a whole stack can be moved to another spot, staying a stack', () => {
  let t = draw(createTable(makeDeck(4), noShuffle), 3); // hand: c0 c1 c2
  t = placeOnTable(t, [t.hand[0].iid], { row: 0, col: 0 }, 3); // c0
  t = stackOnto(t, [t.hand[1].iid, t.hand[0].iid], t.table[0].iid); // c0, c1, c2 (c2 on top)
  // Flipping a card in a stack turns the whole stack's cards.
  t = flip(t, t.table[0].iid);
  assert.ok(t.table.every((c) => !c.faceUp));
  const held = stackGroups(t.table)[0].map((c) => c.iid).reverse(); // top first
  const moved = placeStackOnTable(t, held, { row: 1, col: 2 }, 3);
  assert.deepEqual(stackGroups(moved.table).map((g) => g.map((c) => c.cardId)), [['c0', 'c1', 'c2']]);
  assert.deepEqual(gridSpots(moved.table, 3), [{ row: 1, col: 2 }]);
  assert.ok(moved.table.every((c) => !c.faceUp));
  // Turned over as a whole, where it lies: the order reverses and every card turns face up.
  const turned = turnStackOver(moved, moved.table[0].iid, 3);
  assert.deepEqual(turned.table.map((c) => [c.cardId, c.faceUp]), [['c2', true], ['c1', true], ['c0', true]]);
  assert.deepEqual(gridSpots(turned.table, 3), [{ row: 1, col: 2 }]);
});

test('held cards from anywhere can be put down together as a new stack', () => {
  let t = draw(createTable(makeDeck(4), noShuffle), 2); // hand: c0 c1; deck: c2 c3
  // Held top first: c1, then c0, then the deck's top card.
  t = placeStackOnTable(t, [t.hand[1].iid, t.hand[0].iid, t.deck[0].iid], { row: 0, col: 1 }, 3, true);
  assert.deepEqual(stackGroups(t.table).map((g) => g.map((c) => c.cardId)), [['c2', 'c0', 'c1']]);
  assert.ok(t.table.every((c) => c.faceUp && c.spot?.row === 0 && c.spot?.col === 1));
  assert.equal(t.hand.length + t.deck.length, 1);
});

test('a stack never mixes faces: cards put on it turn to match, and a stack is put down one way up', () => {
  let t = draw(createTable(makeDeck(4), noShuffle), 3); // hand: c0 c1 c2
  t = placeOnTable(t, [t.hand[0].iid], { row: 0, col: 0 }, 3, false); // c0, face down
  t = stackOnto(t, [t.hand[1].iid, t.hand[0].iid], t.table[0].iid); // face-up c1, c2 onto it
  assert.deepEqual(t.table.map((c) => [c.cardId, c.faceUp]), [['c0', false], ['c1', false], ['c2', false]]);
  // Held cards facing different ways, put down as a new stack, all face the way its top card does.
  t = flip(t, t.deck[0].iid); // c3 face up
  t = placeStackOnTable(t, [t.deck[0].iid, t.table[2].iid], { row: 0, col: 2 }, 3);
  assert.deepEqual(stackGroups(t.table)[1].map((c) => [c.cardId, c.faceUp]), [['c2', true], ['c3', true]]);
});

test('a held stack turned over lands turned over, whatever its size', () => {
  for (const size of [2, 3, 4]) {
    let t = draw(createTable(makeDeck(size), noShuffle), size);
    t = placeOnTable(t, [t.hand[0].iid], { row: 0, col: 0 }, 3);
    t = stackOnto(t, t.hand.map((c) => c.iid).reverse(), t.table[0].iid); // all face up
    // Held top first, then turned over: the order reverses, and it's put down somewhere else.
    const held = stackGroups(t.table)[0].map((c) => c.iid); // bottom first, i.e. top first once turned over
    const moved = placeStackOnTable(flipAll(t, held), held, { row: 1, col: 1 }, 3);
    assert.ok(moved.table.every((c) => !c.faceUp), `stack of ${size}`);
  }
});

test('a stack spreads out into single cards, pushing cards in the way down the grid', () => {
  let t = draw(createTable(makeDeck(6), noShuffle), 6); // hand: c0..c5
  // A stack of c0, c1, c2 (c2 on top) at (0,0); c3 at (0,1); a gap at (0,2); c4 at (1,0).
  t = placeOnTable(t, [t.hand[0].iid], { row: 0, col: 0 }, 3);
  t = stackOnto(t, [t.hand[1].iid, t.hand[0].iid], t.table[0].iid);
  t = placeOnTable(t, [t.hand[0].iid], { row: 0, col: 1 }, 3); // c3
  t = placeOnTable(t, [t.hand[0].iid], { row: 1, col: 0 }, 3); // c4
  const spread = spreadStack(t, t.table[0].iid, 3);
  assert.ok(spread.table.every((c) => c.stack === undefined));
  // Top card first, from the stack's spot, filling (0,2) too; c3 pushed on to (1,0), then c4 on to (1,1).
  assert.deepEqual(
    spread.table.map((c) => [c.cardId, c.spot]),
    [
      ['c2', { row: 0, col: 0 }],
      ['c1', { row: 0, col: 1 }],
      ['c0', { row: 0, col: 2 }],
      ['c3', { row: 1, col: 0 }],
      ['c4', { row: 1, col: 1 }],
    ],
  );
  assert.equal(cardCount(spread), 6);
});

test('stacks saved with mixed faces are evened out to the bottom card when loaded', () => {
  const deck = makeDeck(2);
  const t = createTable(deck, noShuffle);
  const mixed = { ...t, deck: [], table: [{ ...t.deck[0], stack: 's', faceUp: false }, { ...t.deck[1], stack: 's', faceUp: true }] };
  assert.ok(pruneTable(mixed, deck).table.every((c) => !c.faceUp));
});

test('the deck can be rearranged from the search, several cards at once', () => {
  const t = createTable(makeDeck(5), noShuffle); // c0 (top) .. c4
  // Pick c3 then c1, and put them on top.
  const moved = reorderPile(t, 'deck', [3, 1], 0);
  assert.deepEqual(moved.deck.map((c) => c.cardId), ['c3', 'c1', 'c0', 'c2', 'c4']);
  assert.equal(cardCount(moved), 5);
});

test('trashed cards are kept out of play, can come back, and return to the deck on reset', () => {
  let t = draw(createTable(makeDeck(4), noShuffle), 2); // hand: c0 c1
  t = moveCards(t, [t.hand[0].iid, t.hand[1].iid], 'trash');
  // Like a pile: the first listed (the top of a held stack) ends up on top.
  assert.deepEqual(t.trash.map((c) => c.cardId), ['c0', 'c1']);
  assert.equal(t.hand.length, 0);
  assert.deepEqual(missingCards(t, makeDeck(4)), []);
  t = moveCard(t, t.trash[1].iid, 'hand');
  assert.deepEqual(t.hand.map((c) => c.cardId), ['c1']);
  t = resetTable(t);
  assert.equal(t.deck.length, 4);
  assert.equal(t.trash.length, 0);
});

test('tables saved before the trash existed still load', () => {
  const deck = makeDeck(2);
  const { trash: _, ...old } = createTable(deck, noShuffle);
  const loaded = pruneTable(old as TableState, deck);
  assert.deepEqual(loaded.trash, []);
  assert.equal(cardCount(loaded), 2);
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

test('createTable deals one instance per copy', () => {
  const deck = makeDeck(2);
  deck.cards[0].copies = 3;
  const t = createTable(deck, noShuffle);
  assert.deepEqual(t.deck.map((c) => c.cardId), ['c0', 'c0', 'c0', 'c1']);
});

test('orderedTable stacks the deck in editor order, copies together, first card on top', () => {
  const deck = makeDeck(3);
  deck.cards[1].copies = 2;
  const t = orderedTable(deck);
  assert.deepEqual(t.deck.map((c) => c.cardId), ['c0', 'c1', 'c1', 'c2']);
  assert.ok(t.deck.every((c) => !c.faceUp));
  assert.equal(t.hand.length + t.table.length + t.discard.length, 0);
});

test('lowering copies prunes extras from piles before cards in play', () => {
  const deck = makeDeck(1);
  deck.cards[0].copies = 3;
  const t = draw(createTable(deck, noShuffle), 1);
  const pruned = pruneTable(t, { ...deck, cards: [{ ...deck.cards[0], copies: 1 }] });
  assert.equal(pruned.hand.length, 1);
  assert.equal(pruned.deck.length, 0);
});

test('raising copies reports the extra copies as missing', () => {
  const deck = makeDeck(2);
  const t = createTable(deck, noShuffle);
  const more = { ...deck, cards: [{ ...deck.cards[0], copies: 3 }, deck.cards[1]] };
  assert.deepEqual(missingCards(t, more), ['c0', 'c0']);
  assert.equal(cardCount(addMissingCards(t, more)), 4);
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
