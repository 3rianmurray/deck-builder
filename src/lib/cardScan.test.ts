import assert from 'node:assert/strict';
import { test } from 'node:test';

import { findCard, homography, mapPoint, orderCorners, outputSize, uprightCorners } from './cardScan.ts';
import type { Point, Quad } from './cardScan.ts';
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
 * A made-up photo of a card on a table: a speckled background, and the card (with rounded corners, as real
 * ones have) drawn where `corners` say, seen in perspective, as a light card with busy art in its middle.
 */
function photo(opts: { width: number; height: number; corners: Quad; seed?: number; table?: [number, number, number] }): Pixels {
  const { width, height, corners } = opts;
  const rnd = random(opts.seed ?? 1);
  const table = opts.table ?? [92, 64, 40];
  const data = new Uint8Array(width * height * 4);
  // Where each photo pixel falls on the card (0–1 across and down), to draw it and round its corners.
  const toCard = homography(corners, [
    { x: 0, y: 0 },
    { x: 1, y: 0 },
    { x: 1, y: 1 },
    { x: 0, y: 1 },
  ]);
  const r = 0.06;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const u = mapPoint(toCard, { x: x + 0.5, y: y + 0.5 });
      let inside = u.x >= 0 && u.x <= 1 && u.y >= 0 && u.y <= 1;
      if (inside) {
        const cx = Math.min(Math.max(u.x, r), 1 - r);
        const cy = Math.min(Math.max(u.y, r), 1 - r);
        inside = Math.hypot(u.x - cx, u.y - cy) <= r;
      }
      const n = (rnd() - 0.5) * 30;
      const art = u.x > 0.12 && u.x < 0.88 && u.y > 0.1 && u.y < 0.6;
      const c = !inside
        ? table.map((v) => v + n)
        : art
          ? [80 + rnd() * 150, 60 + rnd() * 150, 90 + rnd() * 140]
          : [235 + n / 3, 232 + n / 3, 222 + n / 3];
      const i = (y * width + x) * 4;
      data[i] = Math.max(0, Math.min(255, c[0]));
      data[i + 1] = Math.max(0, Math.min(255, c[1]));
      data[i + 2] = Math.max(0, Math.min(255, c[2]));
      data[i + 3] = 255;
    }
  }
  return { width, height, data };
}

/** How far the furthest found corner is from where it should be, as a fraction of the photo's width. */
const worstMiss = (found: Quad, truth: Quad, width: number) =>
  Math.max(...found.map((p, i) => Math.hypot(p.x - truth[i].x, p.y - truth[i].y))) / width;

test('the perspective transform takes each corner exactly where it should go', () => {
  const from: Quad = [
    { x: 40, y: 30 },
    { x: 300, y: 55 },
    { x: 280, y: 420 },
    { x: 20, y: 380 },
  ];
  const to: Quad = [
    { x: 0, y: 0 },
    { x: 500, y: 0 },
    { x: 500, y: 700 },
    { x: 0, y: 700 },
  ];
  const m = homography(from, to);
  from.forEach((p, i) => {
    const q = mapPoint(m, p);
    assert.ok(Math.abs(q.x - to[i].x) < 1e-6 && Math.abs(q.y - to[i].y) < 1e-6, `corner ${i}`);
  });
});

test('corners are put in order, clockwise from the top left, however they come', () => {
  const pts: Point[] = [
    { x: 300, y: 400 },
    { x: 10, y: 20 },
    { x: 20, y: 390 },
    { x: 290, y: 15 },
  ];
  assert.deepEqual(orderCorners(pts), [pts[1], pts[3], pts[0], pts[2]]);
});

test('a card photographed square on is found, corners and all', () => {
  const truth: Quad = [
    { x: 100, y: 60 },
    { x: 260, y: 60 },
    { x: 260, y: 284 },
    { x: 100, y: 284 },
  ];
  const { corners, found } = findCard(photo({ width: 360, height: 360, corners: truth }));
  assert.ok(found);
  assert.ok(worstMiss(corners, truth, 360) < 0.02, `missed by ${worstMiss(corners, truth, 360)}`);
});

test('a card at an angle and in perspective is found too', () => {
  const truth: Quad = [
    { x: 130, y: 40 },
    { x: 300, y: 95 },
    { x: 250, y: 330 },
    { x: 60, y: 270 },
  ];
  const { corners, found } = findCard(photo({ width: 380, height: 380, corners: truth, seed: 4, table: [40, 70, 50] }));
  assert.ok(found);
  assert.ok(worstMiss(corners, truth, 380) < 0.025, `missed by ${worstMiss(corners, truth, 380)}`);
});

test('with nothing to find, the corners start a little in from the photo edges', () => {
  const rnd = random(9);
  const data = new Uint8Array(200 * 200 * 4).map((_, i) => (i % 4 === 3 ? 255 : 120 + (rnd() - 0.5) * 20));
  const { found, corners } = findCard({ width: 200, height: 200, data });
  assert.equal(found, false);
  assert.deepEqual(corners[0], { x: 24, y: 24 });
});

test("a card photographed sideways is turned to stand the deck's way", () => {
  // Wider than tall on the photo, for a portrait deck: a quarter turn makes its left side its top.
  const sideways: Quad = [
    { x: 0, y: 0 },
    { x: 700, y: 0 },
    { x: 700, y: 500 },
    { x: 0, y: 500 },
  ];
  const up = uprightCorners(sideways, 5 / 7);
  assert.deepEqual(up[0], { x: 0, y: 500 });
  assert.deepEqual(uprightCorners(sideways, 7 / 5), sideways);
});

test("the straightened card is the deck's shape, about as big as it was in the photo", () => {
  const q: Quad = [
    { x: 0, y: 0 },
    { x: 400, y: 0 },
    { x: 400, y: 560 },
    { x: 0, y: 560 },
  ];
  // Wider than a mini card for its height: made taller, rather than squeezed.
  assert.deepEqual(outputSize(q, 41 / 63), { width: 400, height: 615 });
  // A close-up is capped at the usual card size.
  const big = q.map((p) => ({ x: p.x * 5, y: p.y * 5 })) as Quad;
  assert.equal(outputSize(big, 5 / 7).height, 1400);
});

test('a light card on a fairly light table, where the two differ less', () => {
  const truth: Quad = [
    { x: 90, y: 70 },
    { x: 250, y: 80 },
    { x: 245, y: 300 },
    { x: 80, y: 290 },
  ];
  const { corners, found } = findCard(photo({ width: 340, height: 360, corners: truth, seed: 6, table: [175, 172, 165] }));
  assert.ok(found);
  assert.ok(worstMiss(corners, truth, 340) < 0.025, `missed by ${worstMiss(corners, truth, 340)}`);
});