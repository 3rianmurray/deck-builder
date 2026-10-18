/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cardRadius, cardRatio, cardSizeMm, detectShape, isLandscape, parseSizeWithUnit, PRESET_RATIOS } from './types.ts';

test('decks without a size are standard 5:7', () => {
  assert.equal(cardRatio({}), 5 / 7);
});

test('US Mini is 41 × 63 mm', () => {
  assert.equal(cardRatio({ cardShape: { kind: 'usMini' } }), PRESET_RATIOS.usMini);
  assert.ok(Math.abs(1 / PRESET_RATIOS.usMini - 1.54) < 0.01);
});

test('landscape presets are turned sideways', () => {
  assert.equal(cardRatio({ cardShape: { kind: 'standard', landscape: true } }), 7 / 5);
  assert.equal(cardRatio({ cardShape: { kind: 'usMini', landscape: true } }), 63 / 41);
  assert.equal(isLandscape({ kind: 'custom', width: 88, height: 63 }), true);
  assert.equal(isLandscape({ kind: 'standard' }), false);
});

test('custom sizes use their own ratio, kept to a sane range', () => {
  assert.equal(cardRatio({ cardShape: { kind: 'custom', width: 63, height: 88 } }), 63 / 88);
  assert.equal(cardRatio({ cardShape: { kind: 'custom', width: 1, height: 100 } }), 0.25);
  assert.equal(cardRatio({ cardShape: { kind: 'custom', width: 10, height: 1 } }), 4);
  assert.equal(cardRatio({ cardShape: { kind: 'custom', width: 1, height: 0 } }), PRESET_RATIOS.standard);
});

test('a landscape card is the portrait card turned: the same size, sides swapped', () => {
  assert.deepEqual(cardSizeMm({}), { w: 63.5, h: 88.9 });
  assert.deepEqual(cardSizeMm({ cardShape: { kind: 'standard', landscape: true } }), { w: 88.9, h: 63.5 });
  assert.deepEqual(cardSizeMm({ cardShape: { kind: 'usMini' } }), { w: 41, h: 63 });
  assert.deepEqual(cardSizeMm({ cardShape: { kind: 'usMini', landscape: true } }), { w: 63, h: 41 });
});

test('custom sizes can be typed in inches or millimetres', () => {
  const inches = cardSizeMm({ cardShape: { kind: 'custom', width: 2.5, height: 3.5 } });
  assert.ok(Math.abs(inches.w - 63.5) < 1e-9 && Math.abs(inches.h - 88.9) < 1e-9);
  assert.deepEqual(cardSizeMm({ cardShape: { kind: 'custom', width: 120, height: 70 } }), { w: 120, h: 70 });
});
test('an automatic size is a standard card until it is worked out, then the size it found', () => {
  assert.equal(cardRatio({ cardShape: { kind: 'auto' } }), 5 / 7);
  assert.equal(cardRatio({ cardShape: { kind: 'auto', detected: { kind: 'usMini', landscape: true } } }), 63 / 41);
  assert.equal(isLandscape({ kind: 'auto', detected: { kind: 'standard', landscape: true } }), true);
});

test('a picture close to a preset is taken for it, either way up; anything else keeps its own shape', () => {
  assert.deepEqual(detectShape(500 / 700), { kind: 'standard', landscape: false });
  assert.deepEqual(detectShape(0.72), { kind: 'standard', landscape: false });
  assert.deepEqual(detectShape(700 / 500), { kind: 'standard', landscape: true });
  assert.deepEqual(detectShape(41 / 63), { kind: 'usMini', landscape: false });
  const square = detectShape(1);
  assert.equal(square.kind, 'custom');
  assert.equal(cardRatio({ cardShape: square }), 1);
  // As tall as a standard card.
  assert.equal(Math.round(cardSizeMm({ cardShape: detectShape(0.5) }).h * 10) / 10, 88.9);
});

test('custom sizes need a unit, and are read in it', () => {
  assert.deepEqual(parseSizeWithUnit('2.5in'), { value: 2.5, unit: 'in' });
  assert.deepEqual(parseSizeWithUnit('63,5 mm'), { value: 63.5, unit: 'mm' });
  assert.deepEqual(parseSizeWithUnit('3.5"'), { value: 3.5, unit: 'in' });
  assert.deepEqual(parseSizeWithUnit('4 Inches'), { value: 4, unit: 'in' });
  assert.equal(parseSizeWithUnit('2.5'), null);
  assert.equal(parseSizeWithUnit('mm'), null);
  assert.equal(parseSizeWithUnit('0mm'), null);
  // A size in millimetres stays millimetres, however small.
  assert.deepEqual(cardSizeMm({ cardShape: { kind: 'custom', width: 10, height: 12, unit: 'mm' } }), { w: 10, h: 12 });
  assert.ok(Math.abs(cardSizeMm({ cardShape: { kind: 'custom', width: 2, height: 3, unit: 'in' } }).h - 76.2) < 1e-9);
});

test('corners: square, the usual roundness, or rounder', () => {
  assert.equal(cardRadius({ roundness: 0 }, 100), 0);
  assert.equal(cardRadius({}, 100), 6);
  assert.equal(cardRadius({ roundness: 0.2 }, 100), 20);
  assert.equal(cardRadius({ roundness: 1 }, 100), 25);
});