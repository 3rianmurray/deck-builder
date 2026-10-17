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
  snapToGrid,
  snapCamera,
  stackAt,
  stackTargetAt,
  take,
  takeAll,
  gatherStacks,
  moveStacks,
  stacksInShape,
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

test('several cards picked up from different places are taken together, wherever they were', () => {
  const t = putInHand(tableWith({ id: 's', x: 0, y: 0, angle: 0, cards: [card('a'), card('b'), card('c')] }, { id: 'u', x: 400, y: 0, angle: 0, cards: [card('d')] }), [card('h')], 1);
  const after = takeAll(t, [
    { kind: 'card', stackId: 's', iid: 'c' },
    { kind: 'card', stackId: 's', iid: 'a' },
    { kind: 'top', stackId: 'u' },
    { kind: 'hand', hand: 1, iid: 'h' },
  ]);
  assert.deepEqual(after.stacks.map((s) => [s.id, s.cards.map((c) => c.iid).join('')]), [['s', 'b']]);
  assert.deepEqual(after.hands[1], []);
});
test('the camera settles onto quarter turns when close, keeping the table under the fingers still', () => {
  const r = (3 * Math.PI) / 180;
  const tilted: Camera = { a: Math.cos(r), b: Math.sin(r), tx: 40, ty: -20 };
  const about = { x: 200, y: 300 };
  const under = toTable(tilted, about.x, about.y);
  const snapped = snapCamera(tilted, about);
  near(cameraAngle(snapped), 0);
  near(cameraZoom(snapped), 1);
  const still = toScreen(snapped, under.x, under.y);
  near(still.x, about.x);
  near(still.y, about.y);
  // Further off (here 20°), it's left alone.
  const r2 = (20 * Math.PI) / 180;
  const free: Camera = { a: Math.cos(r2), b: Math.sin(r2), tx: 0, ty: 0 };
  assert.equal(snapCamera(free, about), free);
  // Near sideways, it goes sideways.
  const r3 = (92 * Math.PI) / 180;
  near(cameraAngle(snapCamera({ a: Math.cos(r3), b: Math.sin(r3), tx: 0, ty: 0 }, about)), 90);
});

test("snapping puts a card's middle on a crossing or a square's middle (never halfway along a line), leaving its turn as it was", () => {
  // Near a crossing: onto it.
  assert.deepEqual(snapToGrid({ x: 83, y: 37, angle: 37 }, 40), { x: 80, y: 40, angle: 37 });
  // Halfway along a line isn't a snap point: the nearer crossing or square's middle is.
  assert.deepEqual(snapToGrid({ x: 98, y: 41, angle: 0 }, 40), { x: 80, y: 40, angle: 0 });
  // The middle of a square.
  assert.deepEqual(snapToGrid({ x: 58, y: 103, angle: -90 }, 40), { x: 60, y: 100, angle: -90 });
});

test('with the grid on, a card stacks only when dropped almost exactly on another; near it, it just overlaps', () => {
  const t = tableWith({ id: 's', x: 300, y: 300, angle: 0, cards: [card('a')] });
  assert.equal(stackTargetAt(t, 330, 300, size)?.id, 's');
  assert.equal(stackTargetAt(t, 330, 300, size, undefined, 20), null);
  assert.equal(stackTargetAt(t, 310, 305, size, undefined, 20)?.id, 's');
});
test("cards don't stack onto a stack facing the other way", () => {
  const t = tableWith({ id: 'up', x: 300, y: 300, angle: 0, cards: [card('a', true)] });
  assert.equal(stackTargetAt(t, 305, 300, size, undefined, undefined, true)?.id, 'up');
  assert.equal(stackTargetAt(t, 305, 300, size, undefined, undefined, false), null);
});
test('a lasso catches any card its line touches, or that lies inside it', () => {
  const t = tableWith(
    { id: 'inside', x: 100, y: 100, angle: 0, cards: [card('a')] },
    { id: 'touched', x: 330, y: 100, angle: 0, cards: [card('b')] },
    { id: 'clear', x: 700, y: 100, angle: 0, cards: [card('c')] },
  );
  // A loop round the first card whose line passes over the edge of the second (its left edge is at x = 280).
  const loop = [
    { x: 0, y: 0 },
    { x: 290, y: 0 },
    { x: 290, y: 250 },
    { x: 0, y: 250 },
  ];
  assert.deepEqual(stacksInShape(t, loop, size), ['inside', 'touched']);
  // Just a line drawn across a card catches it too.
  assert.deepEqual(stacksInShape(t, [{ x: 650, y: 100 }, { x: 760, y: 110 }], size), ['clear']);
});
test('a group moves together, each keeping its place relative to the rest', () => {
  const t = tableWith(
    { id: 'a', x: 100, y: 100, angle: 0, cards: [card('a')] },
    { id: 'b', x: 160, y: 130, angle: 30, cards: [card('b')] },
    { id: 'c', x: 900, y: 900, angle: 0, cards: [card('c')] },
  );
  const moved = moveStacks(t, ['a', 'b'], { x: 50, y: -20 });
  assert.deepEqual(moved.stacks.map((s) => [s.id, s.x, s.y, s.angle]), [
    ['c', 900, 900, 0],
    ['a', 150, 80, 0],
    ['b', 210, 110, 30],
  ]);
});

test('gathered into one stack where the grabbed one lies, all facing its way, it on top', () => {
  const t = tableWith(
    { id: 'a', x: 100, y: 100, angle: 0, cards: [card('a', false)] },
    { id: 'b', x: 300, y: 120, angle: 45, cards: [card('b1', true), card('b2', true)] },
    { id: 'c', x: 900, y: 900, angle: 0, cards: [card('c')] },
  );
  const g = gatherStacks(t, ['a', 'b'], 'b', 'g');
  assert.deepEqual(g.stacks.map((s) => [s.id, s.x, s.y, s.angle, s.cards.map((c) => `${c.iid}${c.faceUp ? '↑' : '↓'}`).join(',')]), [
    ['c', 900, 900, 0, 'c↓'],
    ['g', 300, 120, 45, 'a↑,b1↑,b2↑'],
  ]);
});