import assert from 'node:assert/strict';
import { test } from 'node:test';

import { guessSheet } from './sheetGuess.ts';
import type { Pixels } from './sheetGuess.ts';

/** A repeatable stream of pseudo-random numbers in [0, 1). */
function random(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

/**
 * A made-up sprite sheet: `columns` × `rows` cells of `cardW` × `cardH` pixels, `gutter` pixels apart (and round
 * the edge), on a flat background. Each card is drawn as busy art in its own colors, with a dark frame; cells
 * at or past `count` are left as background, and `back` puts art in the very last cell too.
 */
function sheet(opts: {
  columns: number;
  rows: number;
  cardW: number;
  cardH: number;
  gutter: number;
  count?: number;
  back?: boolean;
  seed?: number;
  /** Draw each card with a dark frame (default), or as art right to its edges. */
  frame?: boolean;
}): Pixels {
  const { columns, rows, cardW, cardH, gutter } = opts;
  const count = opts.count ?? columns * rows;
  const width = columns * cardW + (columns + 1) * gutter;
  const height = rows * cardH + (rows + 1) * gutter;
  const data = new Uint8Array(width * height * 4);
  const rnd = random(opts.seed ?? 7);
  const put = (x: number, y: number, v: [number, number, number]) => {
    const i = (y * width + x) * 4;
    [data[i], data[i + 1], data[i + 2], data[i + 3]] = [...v, 255];
  };
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) put(x, y, [30, 34, 40]);
  for (let n = 0; n < columns * rows; n++) {
    const last = n === columns * rows - 1;
    if (n >= count && !(last && opts.back)) continue;
    const c = n % columns;
    const r = Math.floor(n / columns);
    const x0 = gutter + c * (cardW + gutter);
    const y0 = gutter + r * (cardH + gutter);
    const base = [rnd() * 200 + 30, rnd() * 200 + 30, rnd() * 200 + 30];
    for (let y = 0; y < cardH; y++) {
      for (let x = 0; x < cardW; x++) {
        const frame = opts.frame !== false && (x < 2 || y < 2 || x >= cardW - 2 || y >= cardH - 2);
        const noise = (rnd() - 0.5) * 120;
        put(
          x0 + x,
          y0 + y,
          frame ? [15, 15, 15] : (base.map((b) => Math.max(0, Math.min(255, b + noise))) as [number, number, number]),
        );
      }
    }
  }
  return { width, height, data };
}

/** The sheet shrunk by a whole factor, each new pixel the average of the ones it covers (as resizing blurs). */
function shrink(img: Pixels, k: number): Pixels {
  const width = Math.floor(img.width / k);
  const height = Math.floor(img.height / k);
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      for (let ch = 0; ch < 4; ch++) {
        let sum = 0;
        for (let dy = 0; dy < k; dy++) for (let dx = 0; dx < k; dx++) sum += img.data[((y * k + dy) * img.width + x * k + dx) * 4 + ch];
        data[(y * width + x) * 4 + ch] = sum / (k * k);
      }
    }
  }
  return { width, height, data };
}

test('a Tabletop Simulator style sheet: 10 columns, 7 rows, with gutters', () => {
  const g = guessSheet(sheet({ columns: 10, rows: 7, cardW: 25, cardH: 35, gutter: 2 }), 5 / 7);
  assert.deepEqual([g.columns, g.rows, g.count], [10, 7, 70]);
  assert.equal(g.confidence, 'high');
});

test('cards edge to edge, with no gutters, are still found where they meet', () => {
  const g = guessSheet(sheet({ columns: 6, rows: 3, cardW: 40, cardH: 56, gutter: 0, seed: 3 }), 5 / 7);
  assert.deepEqual([g.columns, g.rows], [6, 3]);
});

test('neither half nor double the real grid is taken for it', () => {
  const g = guessSheet(sheet({ columns: 4, rows: 2, cardW: 50, cardH: 70, gutter: 3, seed: 11 }), 5 / 7);
  assert.deepEqual([g.columns, g.rows], [4, 2]);
});

test('a single row of cards', () => {
  const g = guessSheet(sheet({ columns: 7, rows: 1, cardW: 40, cardH: 56, gutter: 2, seed: 5 }), 5 / 7);
  assert.deepEqual([g.columns, g.rows, g.count], [7, 1, 7]);
});

test('empty cells at the end are left out of the count', () => {
  const g = guessSheet(sheet({ columns: 5, rows: 3, cardW: 40, cardH: 56, gutter: 2, count: 12, seed: 9 }), 5 / 7);
  assert.deepEqual([g.columns, g.rows, g.count, g.backInLastCell], [5, 3, 12, false]);
});

test("a card back in the last cell, after empty ones, isn't counted as a card", () => {
  const g = guessSheet(
    sheet({ columns: 10, rows: 7, cardW: 25, cardH: 35, gutter: 2, count: 52, back: true, seed: 13 }),
    5 / 7,
  );
  assert.deepEqual([g.columns, g.rows, g.count, g.backInLastCell], [10, 7, 52, true]);
});

test("landscape cards (art drawn sideways) fit when the deck's cards are portrait", () => {
  const g = guessSheet(sheet({ columns: 3, rows: 4, cardW: 56, cardH: 40, gutter: 2, seed: 17 }), 5 / 7);
  assert.deepEqual([g.columns, g.rows], [3, 4]);
});

test('frameless art right to the edges of each card, with no gutters', () => {
  const g = guessSheet(sheet({ columns: 5, rows: 4, cardW: 40, cardH: 56, gutter: 0, frame: false, seed: 21 }), 5 / 7);
  assert.deepEqual([g.columns, g.rows], [5, 4]);
});

test('a big sheet shrunk down (and blurred) for guessing, thin gutters and all', () => {
  const big = sheet({ columns: 10, rows: 7, cardW: 75, cardH: 105, gutter: 2, frame: false, seed: 23 });
  const g = guessSheet(shrink(big, 3), 5 / 7);
  assert.deepEqual([g.columns, g.rows, g.count], [10, 7, 70]);
});