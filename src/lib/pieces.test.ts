import assert from 'node:assert/strict';
import { test } from 'node:test';

import { addPiece, movePiece, newPiece, pieceAt, piecesInShape, removePiece, rollDie, setPiece, newSandbox, PIECE_SIZE, THROW_MAX, THROW_MIN, throwDice, separateDice, movePieces, gridDice, DICE_SPACE } from './sandbox.ts';

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
test('thrown dice each land on a new face a little way off, and only the dice asked for move', () => {
  let t = addPiece(table(), newPiece('die', 'a', { x: 1000, y: 1000 }));
  t = addPiece(t, newPiece('die', 'b', { x: 1200, y: 1000 }));
  t = addPiece(t, newPiece('counter', 'c', { x: 1400, y: 1000 }));
  const { table: thrown, from } = throwDice(t, ['a', 'c'], () => 0.25);
  assert.deepEqual(Object.keys(from), ['a']);
  const a = thrown.pieces!.find((p) => p.id === 'a')!;
  const moved = Math.hypot(from.a.dx, from.a.dy);
  assert.ok(moved >= THROW_MIN - 1 && moved <= THROW_MAX + 1, `moved ${moved}`);
  assert.equal(a.x - from.a.dx, 1000);
  assert.equal(a.value, rollDie(6, () => 0.25));
  assert.deepEqual(thrown.pieces!.find((p) => p.id === 'b'), t.pieces![1]);
});

test('a lasso catches dice it goes round or over, and not counters', () => {
  let t = addPiece(table(), newPiece('die', 'in', { x: 100, y: 100 }));
  t = addPiece(t, newPiece('die', 'out', { x: 500, y: 500 }));
  t = addPiece(t, newPiece('counter', 'c', { x: 110, y: 110 }));
  const loop = [{ x: 0, y: 0 }, { x: 250, y: 0 }, { x: 250, y: 250 }, { x: 0, y: 250 }];
  assert.deepEqual(piecesInShape(t, loop, 'die'), ['in']);
  assert.deepEqual(piecesInShape(t, [{ x: 505, y: 495 }], 'die'), ['out']);
});

const overlaps = (t: ReturnType<typeof table>) => {
  const d = (t.pieces ?? []).filter((p) => p.kind === 'die');
  return d.some((a, i) => d.slice(i + 1).some((b) => Math.abs(a.x - b.x) < PIECE_SIZE.die.w && Math.abs(a.y - b.y) < PIECE_SIZE.die.w));
};

test('dice are pushed off each other the shortest way; ones not allowed to move stay put', () => {
  let t = addPiece(table(), newPiece('die', 'a', { x: 500, y: 500 }));
  t = addPiece(t, newPiece('die', 'b', { x: 520, y: 505 }));
  const apart = separateDice(t, ['b']);
  assert.equal(overlaps(apart), false);
  assert.deepEqual([apart.pieces![0].x, apart.pieces![0].y], [500, 500]);
  assert.equal(apart.pieces![1].x, 500 + PIECE_SIZE.die.w + DICE_SPACE);
  assert.equal(apart.pieces![1].y, 505);
  // Already apart: left as it was.
  assert.equal(separateDice(apart, ['a', 'b']), apart);
});

test('thrown dice never land on each other, and one that rolls in place stays put', () => {
  let t = table();
  for (let i = 0; i < 8; i++) t = addPiece(t, newPiece('die', `d${i}`, { x: 1000 + (i % 4) * 66, y: 1000 + Math.floor(i / 4) * 66 }));
  t = setPiece(t, 'd0', { rollInPlace: true });
  let r = 0.1;
  const random = () => (r = (r * 9301 + 49297) % 233280 / 233280);
  const { table: thrown, from } = throwDice(t, t.pieces!.map((p) => p.id), random);
  assert.equal(overlaps(thrown), false);
  assert.deepEqual(from.d0, { dx: 0, dy: 0 });
});

test('a group of pieces moves together, and dice dropped on others are moved off them', () => {
  let t = addPiece(addPiece(table(), newPiece('die', 'a', { x: 100, y: 100 })), newPiece('die', 'b', { x: 200, y: 100 }));
  t = addPiece(t, newPiece('die', 'still', { x: 400, y: 400 }));
  const moved = movePieces(t, ['a', 'b'], { x: 300, y: 300 });
  assert.equal(overlaps(moved), false);
  assert.deepEqual(moved.pieces!.find((p) => p.id === 'still'), t.pieces![2]);
  assert.deepEqual(moved.pieces!.find((p) => p.id === 'b'), { ...t.pieces![1], x: 500, y: 400 });
});

test('picked-out dice line up in a near-square grid round where they were', () => {
  let t = table();
  for (const [i, x] of [300, 900, 600, 1200, 100].entries()) t = addPiece(t, newPiece('die', `d${i}`, { x, y: 500 + i * 37 }));
  const g = gridDice(t, t.pieces!.map((p) => p.id));
  const xs = new Set(g.pieces!.map((p) => p.x));
  const ys = new Set(g.pieces!.map((p) => p.y));
  assert.equal(xs.size, 3);
  assert.equal(ys.size, 2);
  assert.equal(overlaps(g), false);
});