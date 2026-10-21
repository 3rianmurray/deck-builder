import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cardSizeOf, matchStackSizes, newSandbox, pieceAt, scaleItems, scaleOf, SCALE_MAX, SCALE_MIN, stackAt, addPiece, newPiece } from './sandbox.ts';
import type { SandboxCard, SandboxTable } from './sandbox.ts';

// Two decks: a standard one (100 wide) and a mini one (70 wide).
const STD = { w: 100, h: 140 };
const MINI = { w: 70, h: 98 };
const size = (deckId: string) => (deckId === 'mini' ? MINI : STD);
const card = (iid: string, deckId = 'std', scale?: number): SandboxCard => ({ iid, deckId, cardId: iid, faceUp: true, ...(scale ? { scale } : {}) });
const tableWith = (...cards: SandboxCard[][]): SandboxTable => ({
  ...newSandbox('t', 'Test', 0),
  stacks: cards.map((cs, i) => ({ id: `s${i}`, x: 500 + i * 300, y: 500, angle: 0, cards: cs })),
});

test('a card is its deck size at its own scale, and the very same size object unscaled', () => {
  assert.equal(cardSizeOf(card('a'), size), size('std'));
  assert.deepEqual(cardSizeOf(card('a', 'std', 2), size), { w: 200, h: 280 });
});

test('a card put onto a stack of another size takes the stack’s size (its bottom card’s)', () => {
  const t = matchStackSizes(tableWith([card('a'), card('m', 'mini')]), size);
  assert.equal(Math.round(cardSizeOf(t.stacks[0].cards[1], size).w * 100) / 100, 100);
  // Already one size: left as it was.
  const same = tableWith([card('a'), card('b')]);
  assert.equal(matchStackSizes(same, size), same);
});

test('scaling stacks scales every card in them, within the limits, and 1 puts them back', () => {
  let t = tableWith([card('a'), card('m', 'mini')], [card('c')]);
  t = scaleItems(t, ['s0'], [], 1.5, size);
  assert.deepEqual(t.stacks[0].cards.map((c) => Math.round(cardSizeOf(c, size).w)), [150, 150]);
  assert.equal(t.stacks[1].cards[0].scale, undefined);
  assert.equal(scaleOf(t, ['s0'], []), 1.5);
  assert.equal(scaleOf(scaleItems(t, ['s0'], [], 99, size), ['s0'], []), SCALE_MAX);
  assert.equal(scaleOf(scaleItems(t, ['s0'], [], 0, size), ['s0'], []), SCALE_MIN);
  const back = scaleItems(t, ['s0'], [], 1, size);
  assert.deepEqual(back.stacks[0].cards.map((c) => Math.round(cardSizeOf(c, size).w)), [100, 100]);
  assert.equal(back.stacks[0].cards[0].scale, undefined);
});

test('a scaled stack is found across its new size; a scaled counter’s buttons grow with it', () => {
  const t = scaleItems(tableWith([card('a')]), ['s0'], [], 2, size);
  assert.equal(stackAt(t, 500 + 90, 500, size)?.stack.id, 's0');
  const c = scaleItems(addPiece(newSandbox('t', 'T', 0), newPiece('counter', 'c', { x: 0, y: 0 })), [], ['c'], 2, size);
  assert.equal(pieceAt(c, -140, 0)?.part, 'minus');
  assert.equal(pieceAt(c, -40, 0)?.part, 'body');
});