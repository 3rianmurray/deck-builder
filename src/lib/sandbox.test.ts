import assert from 'node:assert/strict';
import { test } from 'node:test';

import {
  GRID_STACK_REACH,
  moveLayer,
  gatherDecks,
  takeFromTrash,
  tidyTable,
  reorderStack,
  addCards,
  addDeck,
  layDecks,
  TABLE_W,
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
  solitaire,
  startCamera,
  snapToGrid,
  snapCamera,
  stackAt,
  stackTargetAt,
  take,
  takeAll,
  dealToHand,
  fanStack,
  removeStacks,
  rotateStacks,
  setSolo,
  setStack,
  settleOnto,
  fitCamera,
  tableBounds,
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
test("a stack's count can be grabbed round its badge, even just off the card's edge", () => {
  const t = tableWith({ id: 's', x: 500, y: 500, angle: 0, cards: [card('a'), card('b')] });
  // Just past the card's top-right corner (it reaches x 550, y 430): nothing, without reach; the whole stack, with it.
  assert.equal(stackAt(t, 560, 420, size), null);
  assert.equal(stackAt(t, 560, 420, size, 30)?.whole, true);
  // A single card has no count to grab.
  const one = tableWith({ id: 'o', x: 500, y: 500, angle: 0, cards: [card('a')] });
  assert.equal(stackAt(one, 560, 420, size, 30), null);
});
test('dealing takes cards off the top, one at a time, into the chosen hand', () => {
  const t = tableWith({ id: 's', x: 0, y: 0, angle: 0, cards: [card('a'), card('b'), card('c')] });
  const dealt = dealToHand(t, 's', 2, 3);
  assert.deepEqual(dealt.stacks[0].cards.map((c) => c.iid), ['a']);
  assert.deepEqual(dealt.hands[3].map((c) => c.iid), ['c', 'b']);
  // More than there are: all of them, and the stack goes.
  const all = dealToHand(t, 's', 9, 0);
  assert.deepEqual(all.stacks, []);
  assert.deepEqual(all.hands[0].map((c) => c.iid), ['c', 'b', 'a']);
});
test('solitaire deals seven fanned columns on the grid, the stock beside them, and the camera starts on it', () => {
  const deck = { id: 'd', name: 'P', backImage: null, cards: Array.from({ length: 52 }, (_, i) => ({ id: `c${i}`, name: '', image: '' })), createdAt: 0, updatedAt: 0 } as Deck;
  let n = 0;
  const t = solitaire(newSandbox('t', 'S', 0), deck, () => `id${n++}`, () => 0.5);
  assert.equal(t.snapToGrid, true);
  const singles = t.stacks.filter((s) => s.cards.length === 1);
  const [stock] = t.stacks.filter((s) => s.cards.length > 1);
  assert.equal(singles.length, 28);
  assert.equal(stock.cards.length, 24);
  assert.ok(stock.cards.every((c) => !c.faceUp));
  assert.equal(singles.filter((s) => s.cards[0].faceUp).length, 7);
  // Every card lies on a snap point, so moving one and putting it back puts it where it was.
  for (const s of t.stacks) assert.deepEqual(snapToGrid(s), { x: s.x, y: s.y, angle: s.angle });
  // Each column's cards go down a step at a time, its last on top and face up.
  const columns = new Map<number, typeof singles>();
  for (const s of singles) columns.set(s.x, [...(columns.get(s.x) ?? []), s]);
  assert.deepEqual([...columns.values()].map((c) => c.length), [1, 2, 3, 4, 5, 6, 7]);
  for (const c of columns.values()) {
    c.forEach((s, i) => i && assert.equal(s.y - c[i - 1].y, 40));
    assert.ok(c[c.length - 1].cards[0].faceUp);
  }
  // The whole layout fits across a phone's screen.
  const cam = startCamera({ w: 390, h: 600 }, t.focus);
  const left = toScreen(cam, t.focus!.x, 0).x;
  const right = toScreen(cam, t.focus!.x + t.focus!.w, 0).x;
  near(left, 0);
  near(right, 390);
});
test('reset the view: every card fits in the space given, below the top bar, upright', () => {
  const t = tableWith(
    { id: 'a', x: 100, y: 100, angle: 0, cards: [card('1')] },
    { id: 'b', x: 2000, y: 900, angle: 90, cards: [card('2')] },
  );
  const bounds = tableBounds(t, size)!;
  // The turned card is 140 wide, 100 tall.
  assert.deepEqual(bounds, { x: 50, y: 30, w: 2020, h: 920 });
  const space = { x: 16, y: 120, w: 358, h: 500 };
  const cam = fitCamera(bounds, space);
  assert.equal(cam.b, 0);
  for (const [x, y] of [[bounds.x, bounds.y], [bounds.x + bounds.w, bounds.y + bounds.h]]) {
    const p = toScreen(cam, x, y);
    assert.ok(p.x >= space.x - 1e-6 && p.x <= space.x + space.w + 1e-6);
    assert.ok(p.y >= space.y - 1e-6 && p.y <= space.y + space.h + 1e-6);
  }
  assert.equal(tableBounds(tableWith(), size), null);
});
test('a stack can be turned left as well as right', () => {
  const t = tableWith({ id: 'a', x: 0, y: 0, angle: 0, cards: [card('1')] });
  assert.equal(turnStack(t, 'a', -90).stacks[0].angle, -90);
  assert.equal(turnStack(t, 'a').stacks[0].angle, 90);
});

test('a card turned over onto a stack facing the same way joins it; facing the other way, it stays apart', () => {
  const t = tableWith(
    { id: 'under', x: 100, y: 100, angle: 0, cards: [card('1', true)] },
    { id: 'over', x: 105, y: 100, angle: 0, cards: [card('2', false)] },
  );
  // Still face down on a face-up card: apart.
  assert.equal(settleOnto(t, 'over').stacks.length, 2);
  const flipped = settleOnto(flipStack(t, 'over'), 'over');
  assert.equal(flipped.stacks.length, 1);
  assert.deepEqual(flipped.stacks[0].cards.map((c) => c.iid), ['1', '2']);
  assert.equal(flipped.stacks[0].id, 'under');
  // Too far off it: apart.
  const far = tableWith({ id: 'under', x: 100, y: 100, angle: 0, cards: [card('1', true)] }, { id: 'over', x: 160, y: 100, angle: 0, cards: [card('2', true)] });
  assert.equal(settleOnto(far, 'over').stacks.length, 2);
});

test('cards that never stack: nothing goes onto them, they join nothing', () => {
  const t = setSolo(tableWith({ id: 'a', x: 100, y: 100, angle: 0, cards: [card('1', true)] }), 'a', true);
  assert.equal(stackTargetAt(t, 100, 100, size), null);
  const both = { ...t, stacks: [...t.stacks, { id: 'b', x: 100, y: 100, angle: 0, cards: [card('2', true)] }] };
  assert.equal(settleOnto(both, 'b').stacks.length, 2);
  assert.equal(setSolo(t, 'a', false).stacks[0].cards[0].solo, undefined);
});

test('locked stacks stay put when a group moves or turns', () => {
  const t = setStack(
    tableWith({ id: 'a', x: 100, y: 100, angle: 0, cards: [card('1')] }, { id: 'b', x: 300, y: 100, angle: 0, cards: [card('2')] }),
    'a',
    { locked: true },
  );
  const moved = moveStacks(t, ['a', 'b'], { x: 10, y: 0 });
  assert.equal(moved.stacks.find((s) => s.id === 'a')!.x, 100);
  assert.equal(moved.stacks.find((s) => s.id === 'b')!.x, 310);
  const turned = rotateStacks(t, ['a', 'b'], { x: 200, y: 100 }, 90, { x: 0, y: 0 });
  assert.equal(turned.stacks.find((s) => s.id === 'a')!.x, 100);
  const b = turned.stacks.find((s) => s.id === 'b')!;
  near(b.x, 200);
  near(b.y, 200);
  assert.equal(b.angle, 90);
});

test('fanning a stack lays its cards a grid step apart, its top card last and on top', () => {
  const t = tableWith({ id: 'a', x: 100, y: 100, angle: 0, cards: [card('1'), card('2'), card('3')] });
  let n = 0;
  const down = fanStack(t, 'a', 'down', () => `f${n++}`);
  assert.deepEqual(down.stacks.map((s) => [s.x, s.y, s.cards[0].iid]), [[100, 100, '1'], [100, 140, '2'], [100, 180, '3']]);
  const across = fanStack(t, 'a', 'across', () => `g${n++}`);
  assert.deepEqual(across.stacks.map((s) => s.x), [100, 140, 180]);
  assert.equal(removeStacks(down, ['f0', 'f1']).stacks.length, 1);
});
test('adding chosen cards brings every copy of each, face down, in one stack with the deck order kept', () => {
  const deck = {
    id: 'd',
    name: 'D',
    backImage: null,
    cards: [
      { id: 'a', name: 'A', image: '' },
      { id: 'b', name: 'B', image: '', copies: 2 },
      { id: 'c', name: 'C', image: '' },
    ],
    createdAt: 0,
    updatedAt: 0,
  } as Deck;
  let n = 0;
  const t = addCards(newSandbox('t', 'T', 0), deck, ['c', 'a', 'b'].slice(1), { x: 50, y: 60 }, () => `i${n++}`);
  assert.equal(t.stacks.length, 1);
  const s = t.stacks[0];
  assert.deepEqual([s.x, s.y], [50, 60]);
  // A on top (the deck's first card), then B's two copies; C wasn't chosen.
  assert.deepEqual(s.cards.map((c) => c.cardId), ['b', 'b', 'a']);
  assert.ok(s.cards.every((c) => c.faceUp));
  assert.equal(addCards(t, deck, [], { x: 0, y: 0 }, () => 'x'), t);
});
test('dropping onto a stack: over its middle without the grid; nearly on it with the grid, never a grid step away', () => {
  const t = tableWith({ id: 's', x: 300, y: 300, angle: 0, cards: [card('1')] });
  // Without the grid: anywhere over its middle 60% (30 across, 42 down each way, for a 100 × 140 card).
  assert.equal(stackTargetAt(t, 328, 340, size)?.id, 's');
  assert.equal(stackTargetAt(t, 300, 345, size), null);
  // Turned a quarter, its long side runs across.
  const turned = tableWith({ id: 's', x: 300, y: 300, angle: 90, cards: [card('1')] });
  assert.equal(stackTargetAt(turned, 340, 300, size)?.id, 's');
  assert.equal(stackTargetAt(turned, 300, 340, size), null);
  // With the grid: within 27, but not at the next grid point straight on (40) or diagonally (28).
  assert.equal(stackTargetAt(t, 318, 318, size, undefined, GRID_STACK_REACH)?.id, 's');
  assert.equal(stackTargetAt(t, 300, 340, size, undefined, GRID_STACK_REACH), null);
  assert.equal(stackTargetAt(t, 320, 320, size, undefined, GRID_STACK_REACH), null);
});
test('a card lifted off where it lay alone has nothing there to go back onto; the rest of a stack still counts', () => {
  const alone = tableWith({ id: 'a', x: 100, y: 100, angle: 0, cards: [card('1')] });
  const lifted = take(alone, { kind: 'card', stackId: 'a', iid: '1' });
  // Dropped a few units from where it was (a small drag, zoomed in): no stack to join, so it's put down (and snapped).
  assert.equal(stackTargetAt(lifted, 105, 102, size, undefined, GRID_STACK_REACH), null);
  const pile = tableWith({ id: 'p', x: 100, y: 100, angle: 0, cards: [card('1'), card('2')] });
  const topOff = take(pile, { kind: 'card', stackId: 'p', iid: '2' });
  assert.equal(stackTargetAt(topOff, 105, 102, size, undefined, GRID_STACK_REACH)?.id, 'p');
});
test('searching a stack: cards moved within it, as the search shows them (top first)', () => {
  const t = tableWith({ id: 's', x: 0, y: 0, angle: 0, cards: [card('a'), card('b'), card('c'), card('d')] });
  // Top first: d, c, b, a. Moving b (place 2) to the top.
  assert.deepEqual(reorderStack(t, 's', [2], 0).stacks[0].cards.map((c) => c.iid), ['a', 'c', 'd', 'b']);
  // d (the top) to the bottom.
  assert.deepEqual(reorderStack(t, 's', [0], 3).stacks[0].cards.map((c) => c.iid), ['d', 'a', 'b', 'c']);
});
test('taking stacks off the table keeps their cards in its trash, to put back', () => {
  const t = tableWith({ id: 'a', x: 0, y: 0, angle: 0, cards: [card('1'), card('2')] }, { id: 'b', x: 200, y: 0, angle: 0, cards: [card('3')] });
  const gone = removeStacks(t, ['a']);
  assert.deepEqual(gone.stacks.map((s) => s.id), ['b']);
  assert.deepEqual(gone.trash?.map((c) => c.iid), ['1', '2']);
  assert.deepEqual(takeFromTrash(gone, ['1']).trash?.map((c) => c.iid), ['2']);
});

test('cleaning up: straight, on the grid, never two stacks in one spot, locked ones left alone', () => {
  const t = tableWith(
    { id: 'a', x: 101, y: 99, angle: 10, cards: [card('1')] },
    { id: 'b', x: 98, y: 103, angle: 50, cards: [card('2')] },
    { id: 'l', x: 333, y: 333, angle: 7, locked: true, cards: [card('3')] },
  );
  const tidy = tidyTable(t, 40);
  const [a, b, l] = tidy.stacks;
  assert.deepEqual([a.x, a.y, a.angle], [100, 100, 0]);
  assert.equal(b.angle, 45);
  // Both nearest (100, 100): the second goes to the nearest free spot instead.
  assert.notDeepEqual([b.x, b.y], [100, 100]);
  assert.ok(Math.hypot(b.x - 100, b.y - 100) <= 40);
  assert.deepEqual([l.x, l.y, l.angle], [333, 333, 7]);
});

test('gathering up: each deck used anywhere comes back whole, shuffled and face down; hands and trash emptied', () => {
  const deck = { id: 'd', name: 'D', backImage: null, cards: [{ id: 'x', name: 'X', image: '' }, { id: 'y', name: 'Y', image: '', copies: 2 }], createdAt: 0, updatedAt: 0 } as Deck;
  const other = { ...deck, id: 'unused' } as Deck;
  const t = {
    ...tableWith({ id: 's', x: 500, y: 500, angle: 0, cards: [{ iid: '1', deckId: 'd', cardId: 'x', faceUp: true }] }),
    hands: [[{ iid: '2', deckId: 'd', cardId: 'y', faceUp: true }], [], [], []],
    trash: [{ iid: '3', deckId: 'd', cardId: 'y', faceUp: true }],
  };
  let n = 0;
  const g = gatherDecks(t, [deck, other], { x: 100, y: 100 }, () => `g${n++}`, () => 0.5);
  assert.equal(g.stacks.length, 1);
  assert.equal(g.stacks[0].cards.length, 3);
  assert.ok(g.stacks[0].cards.every((c) => !c.faceUp));
  assert.deepEqual([g.stacks[0].x, g.stacks[0].y], [100, 100]);
  assert.ok(g.hands.every((h) => !h.length));
  assert.deepEqual(g.trash, []);
});
test('layers: to the back or front, or down and up past the next card it overlaps', () => {
  const t = tableWith(
    { id: 'a', x: 100, y: 100, angle: 0, cards: [card('1')] },
    { id: 'far', x: 900, y: 900, angle: 0, cards: [card('2')] },
    { id: 'b', x: 130, y: 100, angle: 0, cards: [card('3')] },
    { id: 'c', x: 160, y: 100, angle: 0, cards: [card('4')] },
  );
  const order = (x: typeof t) => x.stacks.map((s) => s.id).join(' ');
  assert.equal(order(moveLayer(t, 'c', 'back', size)), 'c a far b');
  assert.equal(order(moveLayer(t, 'a', 'front', size)), 'far b c a');
  // Down past b (it overlaps), not past 'far' (it doesn't).
  assert.equal(order(moveLayer(t, 'c', 'down', size)), 'a far c b');
  // Up past b, skipping 'far'.
  assert.equal(order(moveLayer(t, 'a', 'up', size)), 'far b a c');
  // Nothing under 'a' to pass.
  assert.equal(moveLayer(t, 'a', 'down', size), t);
});
test('a fan near the edge of the table starts back far enough to fit, still a step apart', () => {
  const t = tableWith({ id: 'a', x: 3560, y: 100, angle: 0, cards: [card('1'), card('2'), card('3'), card('4')] });
  let n = 0;
  const xs = fanStack(t, 'a', 'across', () => `f${n++}`, 40).stacks.map((s) => s.x);
  // 3560 + 120 would run off the 3600-wide table: back two steps, to 3480.
  assert.deepEqual(xs, [3480, 3520, 3560, 3600]);
});
test('gathering up: two of the same deck brought on come back as two decks', () => {
  const deck = { id: 'd', name: 'D', backImage: null, cards: [{ id: 'x', name: 'X', image: '' }, { id: 'y', name: 'Y', image: '', copies: 2 }], createdAt: 0, updatedAt: 0 } as Deck;
  let n = 0;
  const twice = addDeck(addDeck(newSandbox('t', 'T', 0), deck, { x: 0, y: 0 }, () => `a${n++}`), deck, { x: 300, y: 0 }, () => `b${n++}`);
  const g = gatherDecks(twice, [deck], { x: 100, y: 100 }, () => `g${n++}`, () => 0.5);
  assert.equal(g.stacks.length, 2);
  assert.ok(g.stacks.every((s) => s.cards.length === 3));
  // One deck brought on: one deck back.
  const one = addDeck(newSandbox('t', 'T', 0), deck, { x: 0, y: 0 }, () => `c${n++}`);
  assert.equal(gatherDecks(one, [deck], { x: 0, y: 0 }, () => `h${n++}`).stacks.length, 1);
});
test('gathering up: cards brought on one by one come back as singles, fanned face up below their deck', () => {
  const deck = { id: 'd', name: 'D', backImage: null, cards: [{ id: 'x', name: 'X', image: '' }, { id: 'y', name: 'Y', image: '' }], createdAt: 0, updatedAt: 0 } as Deck;
  let n = 0;
  const withDeck = addDeck(newSandbox('t', 'T', 0), deck, { x: 0, y: 0 }, () => `a${n++}`);
  const withSingles = addCards(withDeck, deck, ['y', 'x'], { x: 500, y: 500 }, () => `s${n++}`);
  const g = gatherDecks(withSingles, [deck], { x: 100, y: 100 }, () => `g${n++}`, () => 0.5, undefined, 40);
  // One whole deck, and two singles fanned out face up in the deck's order, a row below.
  assert.equal(g.stacks.length, 3);
  assert.equal(g.stacks[0].cards.length, 2);
  const singles = g.stacks.slice(1);
  assert.deepEqual(singles.map((s) => [s.x, s.cards[0].cardId, s.cards[0].faceUp]), [[100, 'x', true], [140, 'y', true]]);
  assert.ok(singles.every((s) => s.y > 100));
  // Only singles of a deck: no whole deck made up, just the singles.
  const onlySingles = addCards(newSandbox('t', 'T', 0), deck, ['x'], { x: 0, y: 0 }, () => `o${n++}`);
  const g2 = gatherDecks(onlySingles, [deck], { x: 100, y: 100 }, () => `h${n++}`);
  assert.equal(g2.stacks.length, 1);
  assert.equal(g2.stacks[0].cards.length, 1);
});
test('a new table: its decks in a row across the middle, in order, on the grid', () => {
  const deck = (id: string) => ({ id, name: id, backImage: null, cards: [{ id: 'x', name: 'X', image: '' }], createdAt: 0, updatedAt: 0 }) as Deck;
  let n = 0;
  const t = layDecks(newSandbox('t', 'T', 0), [deck('a'), deck('b'), deck('c')], () => `id${n++}`);
  assert.deepEqual(t.stacks.map((s) => s.cards[0].deckId), ['a', 'b', 'c']);
  assert.equal(t.stacks[1].x, TABLE_W / 2);
  assert.ok(t.stacks[0].x < t.stacks[1].x && t.stacks[1].x < t.stacks[2].x);
  assert.ok(t.stacks.every((s) => s.x % 40 === 0 && s.y === t.stacks[0].y));
});
