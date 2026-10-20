import assert from 'node:assert/strict';
import { test } from 'node:test';

import { findEdges } from './sheetEdges.ts';
import type { Pixels } from './sheetGuess.ts';

/** A repeatable stream of pseudo-random numbers in [0, 1). */
function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/** A made-up sheet: busy cards of `cardW` × `cardH`, `gutter` pixels apart and round the edge, on a flat background. */
function sheet(columns: number, rows: number, cardW: number, cardH: number, gutter: number): Pixels {
  const width = columns * cardW + (columns + 1) * gutter;
  const height = rows * cardH + (rows + 1) * gutter;
  const data = new Uint8Array(width * height * 4);
  const rnd = random(3);
  for (let i = 0; i < width * height; i++) data.set([30, 34, 40, 255], i * 4);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const x0 = gutter + c * (cardW + gutter);
      const y0 = gutter + r * (cardH + gutter);
      for (let y = 0; y < cardH; y++) {
        for (let x = 0; x < cardW; x++) {
          const v = 40 + Math.floor(rnd() * 200);
          data.set([v, 255 - v, (v * 7) % 256, 255], ((y0 + y) * width + x0 + x) * 4);
        }
      }
    }
  }
  return { width, height, data };
}

test('cards with gutters between them (and round them) are cut inside the gutters', () => {
  const px = sheet(4, 3, 50, 70, 8);
  const edges = findEdges(px, 3, 4);
  assert.ok(edges);
  // Each card, to the pixel: column 0 runs 8..58, column 1 66..116, and so on (and rows the same way).
  edges.columns.forEach(([a, b], c) => {
    assert.equal(Math.round(a * px.width), 8 + c * 58);
    assert.equal(Math.round(b * px.width), 8 + c * 58 + 50);
  });
  edges.rows.forEach(([a, b], r) => {
    assert.equal(Math.round(a * px.height), 8 + r * 78);
    assert.equal(Math.round(b * px.height), 8 + r * 78 + 70);
  });
});

test('cards that meet edge to edge are left as the even grid', () => {
  assert.equal(findEdges(sheet(4, 3, 50, 70, 0), 3, 4), null);
});

test('a card’s own plain border isn’t taken for a gutter beyond a fifth of it', () => {
  // A sheet that's one plain color: nothing to tell gutter from card, so at most a fifth each side goes.
  const width = 100;
  const height = 100;
  const data = new Uint8Array(width * height * 4).fill(200);
  const edges = findEdges({ width, height, data }, 2, 2);
  assert.ok(edges);
  for (const [a, b] of edges.columns) assert.ok(b - a >= 0.5 * 0.6 - 0.01);
});
