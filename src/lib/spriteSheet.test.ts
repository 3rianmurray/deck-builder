/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cellNumber, cellPosition, cellRects } from './spriteSheet.ts';

test('across rows numbers cells left to right, then down', () => {
  const grid = { rows: 4, columns: 2, count: 6, order: 'rows' as const };
  assert.deepEqual(
    Array.from({ length: 6 }, (_, n) => cellPosition(n, grid)),
    [[0, 0], [0, 1], [1, 0], [1, 1], [2, 0], [2, 1]],
  );
  assert.equal(cellNumber(3, 0, grid), null);
});

test('down columns numbers cells top to bottom, then right', () => {
  const grid = { rows: 4, columns: 2, count: 6, order: 'columns' as const };
  assert.deepEqual(
    Array.from({ length: 6 }, (_, n) => cellPosition(n, grid)),
    [[0, 0], [1, 0], [2, 0], [3, 0], [0, 1], [1, 1]],
  );
  assert.equal(cellNumber(2, 1, grid), null);
  assert.equal(cellNumber(1, 1, grid), 5);
});

test('cell rects tile the image with no gaps, even when it does not divide evenly', () => {
  const rects = cellRects(101, 50, { rows: 2, columns: 3, count: 6, order: 'rows' });
  assert.equal(rects.length, 6);
  assert.equal(rects[0].originX, 0);
  assert.equal(rects[2].originX + rects[2].width, 101);
  assert.equal(rects[1].originX, rects[0].width);
  assert.equal(rects[3].originY, rects[0].height);
  assert.equal(rects[5].originY + rects[5].height, 50);
});
