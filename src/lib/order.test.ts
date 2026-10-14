/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { gridHit, gridSlot, moveItem, moveItems } from './order.ts';

test('moveItem moves forwards and backwards without mutating', () => {
  const items = ['a', 'b', 'c', 'd'];
  assert.deepEqual(moveItem(items, 0, 2), ['b', 'c', 'a', 'd']);
  assert.deepEqual(moveItem(items, 3, 0), ['d', 'a', 'b', 'c']);
  assert.deepEqual(moveItem(items, 1, 9), ['a', 'c', 'd', 'b']);
  assert.deepEqual(items, ['a', 'b', 'c', 'd']);
});

test('moveItems gathers picked items into a block, in pick order', () => {
  const items = ['3♠', 'K♥', 'A♠', '2♠', 'Q♦'];
  // Picked A♠, then 2♠, then 3♠, dropped at the front.
  assert.deepEqual(moveItems(items, [2, 3, 0], 0), ['A♠', '2♠', '3♠', 'K♥', 'Q♦']);
  // Dropped at the end.
  assert.deepEqual(moveItems(items, [2, 3, 0], 99), ['K♥', 'Q♦', 'A♠', '2♠', '3♠']);
  // One item behaves like moveItem.
  assert.deepEqual(moveItems(items, [0], 2), moveItem(items, 0, 2));
});

test('gridHit only reports a slot when the point is over an item', () => {
  const grid = { columns: 3, cellW: 100, cellH: 150, gap: 10, count: 4 };
  assert.equal(gridHit(50, 50, grid), 0);
  assert.equal(gridHit(150, 200, grid), null); // row 1, col 1: index 4, past the last item
  assert.equal(gridHit(50, 200, grid), 3);
  assert.equal(gridHit(95, 50, grid), null); // in the gap between columns
  assert.equal(gridHit(-5, 50, grid), null);
});

test('gridSlot finds the cell under a point and clamps to the items there are', () => {
  const grid = { columns: 3, cellW: 100, cellH: 150, count: 7 };
  assert.equal(gridSlot(10, 10, grid), 0);
  assert.equal(gridSlot(250, 10, grid), 2);
  assert.equal(gridSlot(150, 160, grid), 4);
  assert.equal(gridSlot(-20, -20, grid), 0);
  assert.equal(gridSlot(290, 900, grid), 6);
  assert.equal(gridSlot(999, 160, grid), 5);
});
