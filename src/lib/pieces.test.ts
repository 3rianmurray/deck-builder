import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addPiece, movePiece, newPiece, pieceAt, removePiece, rollDie, setPiece, newSandbox, PIECE_SIZE } from './sandbox.ts';

const table = () => newSandbox('t', 'Test', 0);

test('a counter starts at 0 and a die on its highest face, at a whole table point', () => {
  assert.deepEqual(newPiece('counter', 'c', { x: 10.4, y: 20.6 }), { id: 'c', kind: 'counter', x: 10, y: 21, value: 0 });
  assert.deepEqual(newPiece('die', 'd', { x: 0, y: 0 }, 20), { id: 'd', kind: 'die', x: 0, y: 0, value: 20, sides: 20 });
});

test('a counter has − on its left end, + on its right, and its number between', () => {
  const t = addPiece(table(), newPiece('counter', 'c', { x: 500, y: 500 }));
  const half = PIECE_SIZE.counter.w / 2;
  assert.equal(pieceAt(t, 500 - half + 5, 500)?.part, 'minus');
  assert.equal(pieceAt(t, 500 + half - 5, 500)?.part, 'plus');
  assert.equal(pieceAt(t, 500, 500)?.part, 'body');
  assert.equal(pieceAt(t, 500 + half + 5, 500), null);
});

test('the topmost piece is the one found, and moving one brings it to the top', () => {
  let t = addPiece(addPiece(table(), newPiece('die', 'a', { x: 100, y: 100 })), newPiece('die', 'b', { x: 110, y: 100 }));
  assert.equal(pieceAt(t, 105, 100)?.piece.id, 'b');
  t = movePiece(t, 'a', { x: 104, y: 100 });
  assert.equal(pieceAt(t, 105, 100)?.piece.id, 'a');
  assert.deepEqual(t.pieces?.map((p) => p.id), ['b', 'a']);
});

test('pieces change and come off the table', () => {
  let t = addPiece(table(), newPiece('counter', 'c', { x: 0, y: 0 }));
  t = setPiece(t, 'c', { value: 20, label: 'Life' });
  assert.equal(t.pieces?.[0].value, 20);
  assert.equal(t.pieces?.[0].label, 'Life');
  assert.deepEqual(removePiece(t, 'c').pieces, []);
});

test('a die rolls every face, and nothing outside them', () => {
  assert.equal(rollDie(6, () => 0), 1);
  assert.equal(rollDie(6, () => 0.999999), 6);
  assert.equal(rollDie(20, () => 0.5), 11);
});