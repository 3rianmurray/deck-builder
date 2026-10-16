import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  addDeck,
  cameraAngle,
  cameraZoom,
  flipStack,
  MAX_ZOOM,
  moveCamera,
  newSandbox,
  normalizeAngle,
  prune,
  putInHand,
  putOnTable,
  snapAngle,
  stackAt,
  stackTargetAt,
  take,
  toScreen,
  toTable,
  turnStack,
} from './sandbox.ts';
import type { Camera, SandboxCard, SandboxTable } from './sandbox.ts';
import type { Deck } from './types.ts';

const near = (a: number, b: number, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} ≈ ${b}`);
const card = (iid: string, faceUp = false): SandboxCard => ({ iid, deckId: 'd', cardId: iid, faceUp });
const size = () => ({ w: 100, h: 140 });

function tableWith(...stacks: SandboxTable['stacks']): SandboxTable {
  return { ...newSandbox('t', 'Test', 0), stacks };
}

test('angles stay between −180 and 180', () => {
  assert.equal(normalizeAngle(190), -170);
  assert.equal(normalizeAngle(-190), 170);
  assert.equal(normalizeAngle(540), 180);
});

test('a card snaps to the nearest 45° of the table only when it comes close; anything else stays put', () => {
  assert.equal(snapAngle(43), 45);
  assert.equal(snapAngle(-88), -90);
  assert.equal(snapAngle(20), 20);
  assert.equal(snapAngle(30), 30);
  assert.equal(snapAngle(181), 180);
});

test('the camera turns table points into screen points and back', () => {
  const c: Camera = { a: 0.8, b: 0.6, tx: 30, ty: -12 };
  const s = toScreen(c, 120, 340);
  const back = toTable(c, s.x, s.y);
  near(back.x, 120);
  near(back.y, 340);
  near(cameraZoom(c), 1);
  near(cameraAngle(c), (Math.atan2(0.6, 0.8) * 180) / Math.PI);
});

test('two fingers keep the table under them as they slide, spread and twist', () => {
  const start: Camera = { a: 1, b: 0, tx: 0, ty: 0 };
  const from = [
    { x: 100, y: 100 },
    { x: 200, y: 100 },
  ];
  // Moved apart to twice the distance, turned a quarter turn, and slid along.
  const to = [
    { x: 150, y: 150 },
    { x: 150, y: 350 },
  ];
  const c = moveCamera(start, from, to);
  near(cameraZoom(c), 2);
  near(cameraAngle(c), 90);
  // The table points first under the fingers are under them still.
  from.forEach((f, i) => {
    const p = toScreen(c, f.x, f.y);
    near(p.x, to[i].x);
    near(p.y, to[i].y);
  });
});

test('one finger slides the camera; zooming stops at its limit', () => {
  const start: Camera = { a: 1, b: 0, tx: 5, ty: 5 };
  const slid = moveCamera(start, [{ x: 10, y: 10 }], [{ x: 40, y: 0 }]);
  assert.deepEqual(slid, { a: 1, b: 0, tx: 35, ty: -5 });
  const huge = moveCamera(
    start,
    [
      { x: 0, y: 0 },
      { x: 10, y: 0 },
    ],
    [
      { x: 0, y: 0 },
      { x: 1000, y: 0 },
    ],
  );
  near(cameraZoom(huge), MAX_ZOOM);
});

test('a touch finds the topmost card under it, even on a turned card; its corner badge takes the whole stack', () => {
  const t = tableWith(
    { id: 'low', x: 500, y: 500, angle: 0, cards: [card('a')] },
    { id: 'high', x: 520, y: 500, angle: 90, cards: [card('b'), card('c')] },
  );
  // Turned a quarter turn, the top stack reaches 70 either side across and 50 up and down.
  assert.equal(stackAt(t, 585, 500, size)?.stack.id, 'high');
  assert.equal(stackAt(t, 520, 580, size), null);
  assert.equal(stackAt(t, 460, 440, size)?.stack.id, 'low');
  // Its top-right corner (in its own turned frame): for a quarter turn clockwise that's the bottom right.
  const corner = stackAt(t, 520 + 60, 500 + 40, size);
  assert.equal(corner?.stack.id, 'high');
  assert.equal(corner?.whole, true);
});

test('a dropped card goes onto a stack when dropped near its middle, taking the way it faces', () => {
  const t = tableWith({ id: 's', x: 300, y: 300, angle: 45, cards: [card('a', true)] });
  assert.equal(stackTargetAt(t, 320, 310, size)?.id, 's');
  assert.equal(stackTargetAt(t, 360, 300, size), null);
  const after = putOnTable(t, [card('b', false)], { x: 320, y: 310, angle: 0 }, 'new', t.stacks[0]);
  assert.deepEqual(
    after.stacks.map((s) => [s.id, s.angle, s.cards.map((c) => `${c.iid}${c.faceUp ? '↑' : '↓'}`).join(',')]),
    [['s', 45, 'a↑,b↑']],
  );
});

test('cards taken from a stack, put on the table elsewhere, and into a hand', () => {
  const t = tableWith({ id: 's', x: 300, y: 300, angle: 0, cards: [card('a'), card('b')] });
  const off = take(t, { kind: 'top', stackId: 's' });
  assert.deepEqual(off.stacks[0].cards.map((c) => c.iid), ['a']);
  const placed = putOnTable(off, [card('b')], { x: 900, y: 120, angle: 20 }, 'n');
  assert.deepEqual(placed.stacks.map((s) => [s.id, s.x, s.y, s.angle]), [
    ['s', 300, 300, 0],
    ['n', 900, 120, 20],
  ]);
  const handed = putInHand(take(placed, { kind: 'stack', stackId: 's' }), [card('a')], 2);
  assert.deepEqual(handed.stacks.map((s) => s.id), ['n']);
  assert.deepEqual(handed.hands.map((h) => h.length), [0, 0, 1, 0]);
});

test('turning a stack over reverses it and flips every card; a quarter turn lands on 45° steps', () => {
  const t = tableWith({ id: 's', x: 0, y: 0, angle: 20, cards: [card('a', false), card('b', true)] });
  assert.deepEqual(flipStack(t, 's').stacks[0].cards, [card('b', false), card('a', true)]);
  assert.equal(turnStack(t, 's').stacks[0].angle, 90);
});

test('a deck comes onto the table as one shuffled, face-down stack, copies and all', () => {
  const deck: Deck = {
    id: 'd',
    name: 'D',
    backImage: null,
    cards: [
      { id: 'x', name: 'X', image: 'x.jpg', copies: 3 },
      { id: 'y', name: 'Y', image: 'y.jpg' },
    ],
    createdAt: 0,
    updatedAt: 0,
  };
  let n = 0;
  const t = addDeck(newSandbox('t', 'T', 0), deck, { x: 10, y: 20 }, () => `id${n++}`, () => 0.5);
  assert.equal(t.stacks.length, 1);
  assert.equal(t.stacks[0].cards.length, 4);
  assert.ok(t.stacks[0].cards.every((c) => !c.faceUp));
  // A deck since removed takes its cards with it.
  assert.deepEqual(prune(t, []).stacks, []);
  assert.equal(prune(t, [deck]), t);
});
