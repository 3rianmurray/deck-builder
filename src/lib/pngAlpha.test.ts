import assert from 'node:assert/strict';
import { test } from 'node:test';

import { zlibSync } from 'fflate';

import { pngHasTransparency } from './pngAlpha.ts';

/** A PNG chunk: length, type, data and a (dummy) checksum, which the reader doesn't check. */
function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  new DataView(out.buffer).setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  return out;
}

/** A small 8-bit PNG of the given color type, its rows filtered with `filter`, from `pixel(x, y)`'s bytes. */
function png(w: number, h: number, colorType: number, pixel: (x: number, y: number) => number[], filter = 0, extra: Uint8Array[] = []) {
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, w);
  v.setUint32(4, h);
  ihdr.set([8, colorType, 0, 0, 0], 8);
  const bpp = pixel(0, 0).length;
  const rows: number[] = [];
  let prev = new Array(w * bpp).fill(0);
  for (let y = 0; y < h; y++) {
    const row = Array.from({ length: w }, (_, x) => pixel(x, y)).flat();
    rows.push(filter);
    // Filter 1 (sub) and 2 (up) written out; 0 as is.
    row.forEach((b, i) => rows.push(filter === 1 ? (b - (i >= bpp ? row[i - bpp] : 0)) & 255 : filter === 2 ? (b - prev[i]) & 255 : b));
    prev = row;
  }
  const parts = [
    new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    ...extra,
    chunk('IDAT', zlibSync(new Uint8Array(rows))),
    chunk('IEND', new Uint8Array()),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  parts.reduce((at, p) => (out.set(p, at), at + p.length), 0);
  return out;
}

test('an RGBA PNG that is solid throughout is not see-through', () => {
  for (const filter of [0, 1, 2]) assert.equal(pngHasTransparency(png(6, 5, 6, (x, y) => [x * 40, y * 50, 90, 255], filter)), false);
});
test('an RGBA PNG with a clear corner is see-through, however its rows are filtered', () => {
  for (const filter of [0, 1, 2]) {
    assert.equal(pngHasTransparency(png(6, 5, 6, (x, y) => [200, 10, 10, x === 5 && y === 4 ? 0 : 255], filter)), true);
  }
});
test('gray with alpha, and no alpha channel at all', () => {
  assert.equal(pngHasTransparency(png(4, 4, 4, (x) => [128, x === 0 ? 120 : 255])), true);
  assert.equal(pngHasTransparency(png(4, 4, 2, () => [1, 2, 3])), false);
  // A color key makes an RGB image see-through.
  assert.equal(pngHasTransparency(png(4, 4, 2, () => [1, 2, 3], 0, [chunk('tRNS', new Uint8Array([0, 1, 0, 2, 0, 3]))])), true);
});
test('not a PNG at all', () => {
  assert.equal(pngHasTransparency(new Uint8Array([255, 216, 255, 224, 0, 16])), false);
});
