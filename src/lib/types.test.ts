/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { cardRatio, isLandscape, PRESET_RATIOS } from './types.ts';

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
