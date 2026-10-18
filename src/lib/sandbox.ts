// Sandbox tables: a big open table, in the spirit of Tabletop Simulator. Decks are brought onto it from the
// player's list, several at once; cards lie anywhere, at any angle, singly or in stacks; four players' hands
// hold cards off the table; and a camera looks down on it all, moved, zoomed and turned with the fingers.
// Pure logic and maths here (no React, no phone), so it can be tested.

import type { Deck } from './types';

// ---- The table ----

/** A card on a sandbox table or in a hand: which deck and card it is, and which way up it lies. */
export interface SandboxCard {
  /** This copy of the card (two copies of a card are different cards here). */
  iid: string;
  deckId: string;
  cardId: string;
  faceUp: boolean;
  /** It never stacks: nothing goes onto it, and it goes onto nothing (set from its menu). */
  solo?: boolean;
  /** Brought on by itself (with Add cards), not as part of a whole deck: gathered up as a single, not a deck. */
  single?: boolean;
}

/** A pile of one or more cards lying somewhere on the table, all at one angle. Its last card is on top. */
export interface SandboxStack {
  id: string;
  /** Its middle, in table units. */
  x: number;
  y: number;
  /** Which way it's turned, in degrees clockwise, relative to the table. */
  angle: number;
  cards: SandboxCard[];
  /** It stays where it is: it can't be moved as a whole (cards still go on and come off it, and it still flips). */
  locked?: boolean;
}

/**
 * How the camera sees the table: a table point (x, y) shows on screen at (a·x − b·y + tx, b·x + a·y + ty).
 * That's a zoom of √(a² + b²) and a turn of atan2(b, a), then a shift: no squashing or skewing, ever.
 */
export interface Camera {
  a: number;
  b: number;
  tx: number;
  ty: number;
}

export const HAND_COUNT = 4;

export interface SandboxTable {
  id: string;
  name: string;
  /** In drawing order: later stacks lie on top of earlier ones. */
  stacks: SandboxStack[];
  /** The four players' hands, each in order left to right. */
  hands: SandboxCard[][];
  handNames: string[];
  /** Cards put down snap into an invisible grid (cards already lying where they are stay put). */
  snapToGrid?: boolean;
  /** The camera stays put: sliding, zooming and turning the table do nothing (cards still move). */
  lockCamera?: boolean;
  /** The table's cloth color (a key of the app's colors), or none for green felt. */
  background?: string;
  /** The grid's lines are drawn (snapping is separate: see snapToGrid). */
  showGrid?: boolean;
  /** The grid's spacing, in table units, or none for GRID_STEP. */
  gridStep?: number;
  /** Stacks don't show how many cards they hold. */
  hideCounts?: boolean;
  /** Cards taken off the table, kept to put back (newest last). */
  trash?: SandboxCard[];
  /** The camera as it was left, or none yet (it starts looking at the middle of the table). */
  camera?: Camera;
  /** The part of the table a ready-made layout lies in: the camera starts on it (and goes back to it on reset). */
  focus?: Area;
  createdAt: number;
  updatedAt: number;
}

/** The table's size, in table units, with (0, 0) its top-left corner. */
export const TABLE_W = 3600;
export const TABLE_H = 2400;
/** How wide a standard (poker size) card is on the table, in table units: other cards are to the same scale. */
export const CARD_W = 100;
/** Table units per millimeter of a real card (a standard card is 63.5 mm wide). */
export const UNITS_PER_MM = CARD_W / 63.5;

/** A new, empty table. */
export function newSandbox(id: string, name: string, now: number): SandboxTable {
  return {
    id,
    name,
    stacks: [],
    hands: Array.from({ length: HAND_COUNT }, () => []),
    handNames: Array.from({ length: HAND_COUNT }, (_, i) => `Hand ${i + 1}`),
    createdAt: now,
    updatedAt: now,
  };
}

// ---- Turning ----

/** An angle, in degrees, brought into −180 < a ≤ 180. */
export function normalizeAngle(a: number): number {
  const r = ((((a + 180) % 360) + 360) % 360) - 180;
  return r === -180 ? 180 : r;
}

/** The step turned cards snap to (relative to the table), and how close they must come to be snapped. */
export const SNAP_STEP = 45;
export const SNAP_RANGE = 4;

/** A card's angle, snapped to the nearest 45° of the table if it's within a few degrees of it; else as it is. */
export function snapAngle(angle: number, step = SNAP_STEP, range = SNAP_RANGE): number {
  const nearest = Math.round(angle / step) * step;
  return Math.abs(angle - nearest) <= range ? normalizeAngle(nearest) : normalizeAngle(angle);
}

// ---- The camera ----

/** Where a table point shows on screen. */
export function toScreen(c: Camera, x: number, y: number) {
  return { x: c.a * x - c.b * y + c.tx, y: c.b * x + c.a * y + c.ty };
}

/** Which table point is at a screen point. */
export function toTable(c: Camera, x: number, y: number) {
  const k = c.a * c.a + c.b * c.b;
  const dx = x - c.tx;
  const dy = y - c.ty;
  return { x: (c.a * dx + c.b * dy) / k, y: (c.a * dy - c.b * dx) / k };
}

export const cameraZoom = (c: Camera) => Math.hypot(c.a, c.b);
/** The camera's turn, in degrees clockwise. */
export const cameraAngle = (c: Camera) => (Math.atan2(c.b, c.a) * 180) / Math.PI;

/** How far the camera can zoom out and in. */
export const MIN_ZOOM = 0.12;
export const MAX_ZOOM = 4;

/** A rectangle of the table, in table units. */
export interface Area {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The camera upright, zoomed to fit the given screen area: looking at the middle of the table, or, given a part of
 * it to look at, fitting that in, across the middle and from the top.
 */
export function startCamera(view: { w: number; h: number }, focus?: Area): Camera {
  if (focus) {
    const k = Math.min(view.w / focus.w, view.h / focus.h, MAX_ZOOM);
    return { a: k, b: 0, tx: view.w / 2 - k * (focus.x + focus.w / 2), ty: -k * focus.y };
  }
  const k = Math.min(view.w / (TABLE_W * 0.45), view.h / (TABLE_H * 0.45), 1);
  return { a: k, b: 0, tx: view.w / 2 - (k * TABLE_W) / 2, ty: view.h / 2 - (k * TABLE_H) / 2 };
}

/**
 * The camera moved by fingers: where two fingers started on screen (`from`) and where they are now (`to`), the
 * table under them stays under them, so they slide, zoom and turn it together. One finger just slides it.
 * Zooming stops at the limits (about the fingers' middle).
 */
export function moveCamera(start: Camera, from: { x: number; y: number }[], to: { x: number; y: number }[]): Camera {
  if (from.length === 1 || to.length === 1) {
    return { ...start, tx: start.tx + to[0].x - from[0].x, ty: start.ty + to[0].y - from[0].y };
  }
  // The turn and zoom from one pair to the other, as a complex number z = (to₂ − to₁) / (from₂ − from₁).
  const px = from[1].x - from[0].x;
  const py = from[1].y - from[0].y;
  const qx = to[1].x - to[0].x;
  const qy = to[1].y - to[0].y;
  const d = px * px + py * py || 1;
  let zr = (qx * px + qy * py) / d;
  let zi = (qy * px - qx * py) / d;
  // Kept within the zoom limits.
  const zoom = cameraZoom(start) * Math.hypot(zr, zi);
  const limited = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  if (zoom > 0 && limited !== zoom) {
    zr *= limited / zoom;
    zi *= limited / zoom;
  }
  // Each screen point s moves to z·(s − fromMid) + toMid: the fingers' middle follows them.
  const fm = { x: (from[0].x + from[1].x) / 2, y: (from[0].y + from[1].y) / 2 };
  const tm = { x: (to[0].x + to[1].x) / 2, y: (to[0].y + to[1].y) / 2 };
  const sx = start.tx - fm.x;
  const sy = start.ty - fm.y;
  return {
    a: zr * start.a - zi * start.b,
    b: zr * start.b + zi * start.a,
    tx: zr * sx - zi * sy + tm.x,
    ty: zr * sy + zi * sx + tm.y,
  };
}

/** The steps the camera's turn snaps to, and how close it must come to one to snap. */
export const CAMERA_SNAP_STEP = 90;
export const CAMERA_SNAP_RANGE = 5;

/**
 * The camera turned onto the nearest quarter turn if it's within a few degrees of one (upright, sideways, upside
 * down), turning about a screen point (the fingers' middle) so the table there doesn't move. Otherwise as it is.
 */
export function snapCamera(c: Camera, about: { x: number; y: number }, step = CAMERA_SNAP_STEP, range = CAMERA_SNAP_RANGE): Camera {
  const angle = cameraAngle(c);
  const target = Math.round(angle / step) * step;
  const delta = target - angle;
  if (Math.abs(delta) > range || Math.abs(delta) < 1e-9) return c;
  const r = (delta * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const dx = c.tx - about.x;
  const dy = c.ty - about.y;
  return {
    a: c.a * cos - c.b * sin,
    b: c.a * sin + c.b * cos,
    tx: about.x + dx * cos - dy * sin,
    ty: about.y + dx * sin + dy * cos,
  };
}

/** Whether the camera sits exactly on a quarter turn. */
export const cameraSquare = (c: Camera) => {
  const a = cameraAngle(c);
  return Math.abs(a - Math.round(a / CAMERA_SNAP_STEP) * CAMERA_SNAP_STEP) < 1e-6;
};

/** The angle (degrees) of the line from one finger to another, for twisting a card. */
export const fingerAngle = (p: { x: number; y: number }, q: { x: number; y: number }) =>
  (Math.atan2(q.y - p.y, q.x - p.x) * 180) / Math.PI;

// ---- The grid ----

/** The grid's spacing, in table units (about 25 mm of real card). */
export const GRID_STEP = 40;
/** The grid sizes a table can have: its spacing, in table units. */
export const GRID_SIZES = { small: 20, medium: GRID_STEP, large: 60 } as const;
/** A table's grid spacing. */
export const gridStepOf = (t: Pick<SandboxTable, 'gridStep'>) => t.gridStep ?? GRID_STEP;
/** How close a dropped card must come to a stack to join it, with a grid this size (see GRID_STACK_REACH). */
export const gridStackReach = (step: number) => (step * GRID_STACK_REACH) / GRID_STEP;

/**
 * A card put down with snapping on: its middle on the nearest snap point, which is either a crossing of the grid's
 * lines or the middle of one of its squares (halfway between crossings, diagonally); never halfway along a line.
 * Its turn is its own. Cards are free to overlap.
 */
export function snapToGrid(at: { x: number; y: number; angle: number }, step = GRID_STEP) {
  const crossing = { x: Math.round(at.x / step) * step, y: Math.round(at.y / step) * step };
  const middle = { x: (Math.floor(at.x / step) + 0.5) * step, y: (Math.floor(at.y / step) + 0.5) * step };
  const nearer = Math.hypot(at.x - crossing.x, at.y - crossing.y) <= Math.hypot(at.x - middle.x, at.y - middle.y) ? crossing : middle;
  return { ...nearer, angle: at.angle };
}
// ---- Finding cards ----

/** A card's size on the table: `CARD_W` wide, as tall as its deck's shape makes it. */
export type CardSize = (deckId: string) => { w: number; h: number };

/** Where a table point is relative to a stack: in its own (turned) frame, from its middle. */
function inStack(s: SandboxStack, x: number, y: number) {
  const r = (-s.angle * Math.PI) / 180;
  const dx = x - s.x;
  const dy = y - s.y;
  return { x: dx * Math.cos(r) - dy * Math.sin(r), y: dx * Math.sin(r) + dy * Math.cos(r) };
}

/** The part of a stack's top-right corner, inside the card, that picks up the whole stack (as its count is there). */
const BADGE_REACH = 0.4;
/** Where a stack's count badge sits, from the card's top-right corner (it hangs a little off the card). */
const BADGE_OFFSET = 5;

/**
 * The topmost stack under a table point, if any, and whether the point is on its count (top-right corner of a
 * stack of two or more), which takes the whole stack rather than its top card. The count reaches `badgeReach`
 * table units round its badge, off the card's edge too, so it's easy to grab at any zoom.
 */
export function stackAt(
  t: SandboxTable,
  x: number,
  y: number,
  size: CardSize,
  badgeReach = 0,
): { stack: SandboxStack; whole: boolean } | null {
  for (let i = t.stacks.length - 1; i >= 0; i--) {
    const s = t.stacks[i];
    const top = s.cards[s.cards.length - 1];
    const { w, h } = size(top.deckId);
    const p = inStack(s, x, y);
    const several = s.cards.length > 1;
    if (several && Math.hypot(p.x - (w / 2 - BADGE_OFFSET), p.y - (-h / 2 + BADGE_OFFSET)) <= badgeReach) return { stack: s, whole: true };
    if (Math.abs(p.x) > w / 2 || Math.abs(p.y) > h / 2) continue;
    const whole = several && p.x > w / 2 - w * BADGE_REACH && p.y < -h / 2 + h * BADGE_REACH;
    return { stack: s, whole };
  }
  return null;
}
/** Whether cards can go onto a stack: not if any of its cards never stacks. */
export const stackable = (s: SandboxStack) => !s.cards.some((c) => c.solo);

/**
 * How far into a card a dropped card's middle must come to go onto it, without the grid: within this share of its
 * width and of its height, each way from its middle (its middle 60%), in its own turned frame.
 */
const STACK_REACH = 0.3;
/**
 * With the grid on: how close (table units) a dropped card's middle must come to a stack's middle. As generous as
 * it can be while cards a grid step apart (40 straight, 28 diagonally, as fanned out) still stay apart.
 */
export const GRID_STACK_REACH = 27;

/**
 * The stack a card dropped at a table point would go onto (the topmost it's over), leaving out `except`. Without the
 * grid, any it's dropped over the middle of (see STACK_REACH); with the grid on, only one it's dropped almost exactly
 * on (within `reach` table units, e.g. GRID_STACK_REACH): cards set down near each other snap and overlap instead, as
 * in Tabletop Simulator. Given `face` (which way up the dropped cards are), only a stack facing the same way: cards
 * don't stack onto ones facing the other way. Never onto cards that never stack.
 */
export function stackTargetAt(
  t: SandboxTable,
  x: number,
  y: number,
  size: CardSize,
  except?: string,
  reach?: number,
  face?: boolean,
): SandboxStack | null {
  for (let i = t.stacks.length - 1; i >= 0; i--) {
    const s = t.stacks[i];
    if (s.id === except || !stackable(s)) continue;
    if (face !== undefined && s.cards[s.cards.length - 1].faceUp !== face) continue;
    if (reach !== undefined) {
      if (Math.hypot(x - s.x, y - s.y) <= reach) return s;
      continue;
    }
    const { w, h } = size(s.cards[s.cards.length - 1].deckId);
    const p = inStack(s, x, y);
    if (Math.abs(p.x) <= w * STACK_REACH && Math.abs(p.y) <= h * STACK_REACH) return s;
  }
  return null;
}
// ---- Moving cards ----

/**
 * Where cards are taken from: the top card of a stack, one particular card in a stack, a whole stack, or a card
 * from a hand.
 */
export type Source =
  | { kind: 'top'; stackId: string }
  | { kind: 'card'; stackId: string; iid: string }
  | { kind: 'stack'; stackId: string }
  | { kind: 'hand'; hand: number; iid: string };

/** The cards a source holds (bottom first), without taking them. */
export function cardsOf(t: SandboxTable, src: Source): SandboxCard[] {
  if (src.kind === 'hand') return t.hands[src.hand].filter((c) => c.iid === src.iid);
  const s = t.stacks.find((st) => st.id === src.stackId);
  if (!s) return [];
  if (src.kind === 'card') return s.cards.filter((c) => c.iid === src.iid);
  return src.kind === 'stack' ? s.cards : s.cards.slice(-1);
}

/** The table with a source's cards taken away (an emptied stack goes too). */
export function take(t: SandboxTable, src: Source): SandboxTable {
  if (src.kind === 'hand') {
    return { ...t, hands: t.hands.map((h, i) => (i === src.hand ? h.filter((c) => c.iid !== src.iid) : h)) };
  }
  const stacks = t.stacks.flatMap((s) => {
    if (s.id !== src.stackId) return [s];
    const left = src.kind === 'stack' ? [] : src.kind === 'card' ? s.cards.filter((c) => c.iid !== src.iid) : s.cards.slice(0, -1);
    return left.length ? [{ ...s, cards: left }] : [];
  });
  return { ...t, stacks };
}

/** Takes several sources' cards away, one after another. */
export const takeAll = (t: SandboxTable, sources: Source[]) => sources.reduce(take, t);

/**
 * Puts cards down on the table: on top of `onto` (they take its angle, and the way it faces), or as a new
 * stack lying at (x, y) at `angle`, above everything else. `id` names a new stack.
 */
export function putOnTable(
  t: SandboxTable,
  cards: SandboxCard[],
  at: { x: number; y: number; angle: number },
  id: string,
  onto?: SandboxStack | null,
): SandboxTable {
  if (!cards.length) return t;
  const target = onto && t.stacks.find((s) => s.id === onto.id);
  if (target) {
    const face = target.cards[target.cards.length - 1].faceUp;
    const merged = { ...target, cards: [...target.cards, ...cards.map((c) => ({ ...c, faceUp: face }))] };
    // The stack comes to the top, as it's just been put on.
    return { ...t, stacks: [...t.stacks.filter((s) => s.id !== target.id), merged] };
  }
  const x = Math.min(TABLE_W, Math.max(0, at.x));
  const y = Math.min(TABLE_H, Math.max(0, at.y));
  return { ...t, stacks: [...t.stacks, { id, x, y, angle: normalizeAngle(at.angle), cards }] };
}

/** Puts cards into a hand, at a position in it (or at the end). */
export function putInHand(t: SandboxTable, cards: SandboxCard[], hand: number, at?: number): SandboxTable {
  return {
    ...t,
    hands: t.hands.map((h, i) => {
      if (i !== hand) return h;
      const where = at === undefined ? h.length : Math.max(0, Math.min(h.length, at));
      return [...h.slice(0, where), ...cards, ...h.slice(where)];
    }),
  };
}

/**
 * Deals cards off the top of a stack into a player's hand: `count` of them (as many as it has, at most), one at a
 * time, so the top card comes first. They keep the way they faced. An emptied stack goes.
 */
export function dealToHand(t: SandboxTable, stackId: string, count: number, hand: number): SandboxTable {
  const s = t.stacks.find((st) => st.id === stackId);
  if (!s || count < 1) return t;
  const n = Math.min(count, s.cards.length);
  const dealt = s.cards.slice(-n).reverse();
  const left = s.cards.slice(0, s.cards.length - n);
  const stacks = left.length ? t.stacks.map((st) => (st.id === stackId ? { ...st, cards: left } : st)) : t.stacks.filter((st) => st.id !== stackId);
  return putInHand({ ...t, stacks }, dealt, hand);
}

/** Brings a stack to the top of the drawing order (it was just touched). */
export const raise = (t: SandboxTable, stackId: string): SandboxTable => {
  const s = t.stacks.find((st) => st.id === stackId);
  return s ? { ...t, stacks: [...t.stacks.filter((st) => st.id !== stackId), s] } : t;
};

// ---- Lasso and groups ----

/** Whether a point lies inside a shape drawn as a closed line through some points (even-odd rule). */
export function insideShape(p: { x: number; y: number }, shape: { x: number; y: number }[]): boolean {
  let inside = false;
  for (let i = 0, j = shape.length - 1; i < shape.length; j = i++) {
    const a = shape[i];
    const b = shape[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

type P = { x: number; y: number };

/** Whether two line segments cross or touch. */
function segmentsMeet(a: P, b: P, c: P, d: P): boolean {
  const side = (p: P, q: P, r: P) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = side(c, d, a);
  const d2 = side(c, d, b);
  const d3 = side(a, b, c);
  const d4 = side(a, b, d);
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true;
  const on = (p: P, q: P, r: P) => Math.min(p.x, q.x) <= r.x && r.x <= Math.max(p.x, q.x) && Math.min(p.y, q.y) <= r.y && r.y <= Math.max(p.y, q.y);
  return (d1 === 0 && on(c, d, a)) || (d2 === 0 && on(c, d, b)) || (d3 === 0 && on(a, b, c)) || (d4 === 0 && on(a, b, d));
}

/** A stack's four corners on the table (its top card's size, turned as it lies). */
function stackCorners(s: SandboxStack, size: CardSize): P[] {
  const { w, h } = size(s.cards[s.cards.length - 1].deckId);
  const r = (s.angle * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  return [
    [-w / 2, -h / 2],
    [w / 2, -h / 2],
    [w / 2, h / 2],
    [-w / 2, h / 2],
  ].map(([x, y]) => ({ x: s.x + x * cos - y * sin, y: s.y + x * sin + y * cos }));
}

/**
 * The stacks a lasso has caught: any part of the card touched by its line, or lying inside the shape it's drawn
 * (closed back to its start).
 */
export function stacksInShape(t: SandboxTable, shape: P[], size: CardSize): string[] {
  if (!shape.length) return [];
  const line = shape.slice(1).map((p, i) => [shape[i], p] as const);
  return t.stacks
    .filter((s) => {
      const corners = stackCorners(s, size);
      const edges = corners.map((c, i) => [c, corners[(i + 1) % 4]] as const);
      if (shape.some((p) => insideShape(p, corners))) return true;
      if (shape.length >= 3 && corners.some((c) => insideShape(c, shape))) return true;
      return line.some(([a, b]) => edges.some(([c, d]) => segmentsMeet(a, b, c, d)));
    })
    .map((s) => s.id);
}

/** Moves stacks by the same amount each (a group dragged together). Locked ones stay put. */
export const moveStacks = (t: SandboxTable, ids: string[], by: { x: number; y: number }, place = (p: { x: number; y: number; angle: number }) => p) => {
  const moving = new Set(ids.filter((id) => !t.stacks.find((s) => s.id === id)?.locked));
  const moved = t.stacks.map((s) => (moving.has(s.id) ? { ...s, ...place({ x: s.x + by.x, y: s.y + by.y, angle: s.angle }) } : s));
  // Brought to the top, as they were just touched.
  return { ...t, stacks: [...moved.filter((s) => !moving.has(s.id)), ...moved.filter((s) => moving.has(s.id))] };
};

/**
 * Gathers several stacks into one, where `top` lies (and at its turn): the others' cards first, then `top`'s, so
 * it ends up on top. Every card faces the way `top`'s top card does. The new stack is named `id`.
 */
export function gatherStacks(t: SandboxTable, ids: string[], top: string, id: string): SandboxTable {
  const lead = t.stacks.find((s) => s.id === top);
  if (!lead) return t;
  const face = lead.cards[lead.cards.length - 1].faceUp;
  const others = t.stacks.filter((s) => ids.includes(s.id) && s.id !== top);
  const cards = [...others.flatMap((s) => s.cards), ...lead.cards].map((c) => ({ ...c, faceUp: face }));
  const rest = t.stacks.filter((s) => !ids.includes(s.id) && s.id !== top);
  return { ...t, stacks: [...rest, { id, x: lead.x, y: lead.y, angle: lead.angle, cards }] };
}

/** Changes one stack. */
const updateStack = (t: SandboxTable, stackId: string, fn: (s: SandboxStack) => SandboxStack): SandboxTable => ({
  ...t,
  stacks: t.stacks.map((s) => (s.id === stackId ? fn(s) : s)),
});

/** Turns a whole stack over, like turning a real pile over: its order reverses, and every card flips. */
export const flipStack = (t: SandboxTable, stackId: string) =>
  updateStack(t, stackId, (s) => ({ ...s, cards: [...s.cards].reverse().map((c) => ({ ...c, faceUp: !c.faceUp })) }));

/** Turns a stack a quarter turn, clockwise (or by `by` degrees: −90 for counterclockwise), landing on the table's 45° steps. */
export const turnStack = (t: SandboxTable, stackId: string, by = 90) =>
  updateStack(t, stackId, (s) => ({ ...s, angle: normalizeAngle(Math.round((s.angle + by) / SNAP_STEP) * SNAP_STEP) }));

/** Moves and turns a stack (dragged), without changing its cards. */
export const placeStack = (t: SandboxTable, stackId: string, at: { x: number; y: number; angle: number }) =>
  updateStack(t, stackId, (s) => ({ ...s, x: at.x, y: at.y, angle: normalizeAngle(at.angle) }));

/** Shuffles a stack (with the random numbers given, for testing), keeping the way it faces. */
export const shuffleStack = (t: SandboxTable, stackId: string, random: () => number = Math.random) =>
  updateStack(t, stackId, (s) => ({ ...s, cards: shuffled(s.cards, random) }));

/** Flips a card in a hand. */
export const flipInHand = (t: SandboxTable, hand: number, iid: string): SandboxTable => ({
  ...t,
  hands: t.hands.map((h, i) => (i === hand ? h.map((c) => (c.iid === iid ? { ...c, faceUp: !c.faceUp } : c)) : h)),
});

/** A copy of a list in random order (Fisher–Yates). */
export function shuffled<T>(items: T[], random: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** The box round every card on the table (each stack as it's turned), or null with nothing on it. */
export function tableBounds(t: SandboxTable, size: CardSize): Area | null {
  const points = t.stacks.flatMap((s) => stackCorners(s, size));
  if (!points.length) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

/** How close a fitted view comes in, at most: a card or two shouldn't fill the screen. */
export const FIT_MAX_ZOOM = 1.5;

/**
 * The camera upright, showing all of `bounds` (a part of the table) as big as it fits inside `space` (a part of
 * the screen), in its middle.
 */
export function fitCamera(bounds: Area, space: Area): Camera {
  const k = Math.max(MIN_ZOOM, Math.min(space.w / Math.max(1, bounds.w), space.h / Math.max(1, bounds.h), FIT_MAX_ZOOM));
  return {
    a: k,
    b: 0,
    tx: space.x + space.w / 2 - k * (bounds.x + bounds.w / 2),
    ty: space.y + space.h / 2 - k * (bounds.y + bounds.h / 2),
  };
}

/**
 * Brings a deck onto the table: every card (and every copy) in one shuffled, face-down stack at (x, y). `ids`
 * makes unique ids for the stack and its cards.
 */
export function addDeck(
  t: SandboxTable,
  deck: Deck,
  at: { x: number; y: number },
  ids: () => string,
  random: () => number = Math.random,
): SandboxTable {
  const cards: SandboxCard[] = deck.cards.flatMap((c) =>
    Array.from({ length: c.copies ?? 1 }, () => ({ iid: ids(), deckId: deck.id, cardId: c.id, faceUp: false })),
  );
  if (!cards.length) return t;
  return { ...t, stacks: [...t.stacks, { id: ids(), x: at.x, y: at.y, angle: 0, cards: shuffled(cards, random) }] };
}

/** Where the Solitaire example's columns start (the first's middle), and how far apart they are, on the grid. */
const SOLITAIRE_LEFT = 1440;
const SOLITAIRE_TOP = 1000;
const SOLITAIRE_COLUMN = 3 * GRID_STEP;

/**
 * A deck (a 52-card one) laid out for Klondike solitaire, on the grid: the stock face down at the top left, room
 * for the waste and the four foundations along the top, and below them seven columns of one to seven cards,
 * fanned down a grid step at a time (each card its own stack, so all show), the last of each face up. Snapping
 * is on, so cards played onto a column drop into place a step below its last card.
 */
export function solitaire(t: SandboxTable, deck: Deck, ids: () => string, random: () => number = Math.random): SandboxTable {
  const cards = shuffled(
    deck.cards.map((c) => ({ iid: ids(), deckId: deck.id, cardId: c.id, faceUp: false })),
    random,
  );
  const stacks: SandboxStack[] = [];
  let next = 0;
  for (let col = 0; col < 7; col++) {
    for (let row = 0; row <= col && next < cards.length; row++) {
      const card = { ...cards[next++], faceUp: row === col };
      const x = SOLITAIRE_LEFT + col * SOLITAIRE_COLUMN;
      stacks.push({ id: ids(), x, y: SOLITAIRE_TOP + 5 * GRID_STEP + row * GRID_STEP, angle: 0, cards: [card] });
    }
  }
  const stock = cards.slice(next);
  if (stock.length) stacks.unshift({ id: ids(), x: SOLITAIRE_LEFT, y: SOLITAIRE_TOP, angle: 0, cards: stock });
  // In view: the top row, and the columns with room to grow down (to a king's run on the longest).
  const margin = GRID_STEP / 2;
  const focus = {
    x: SOLITAIRE_LEFT - CARD_W / 2 - margin,
    y: SOLITAIRE_TOP - 70 - margin,
    w: 6 * SOLITAIRE_COLUMN + CARD_W + 2 * margin,
    h: 5 * GRID_STEP + 18 * GRID_STEP + 140 + 2 * margin,
  };
  return { ...t, stacks, snapToGrid: true, focus };
}

/**
 * Brings some of a deck's cards onto the table: the ones chosen (every copy of each), in the deck's order, in one
 * face-down stack at (x, y). `ids` makes unique ids for the stack and its cards.
 */
export function addCards(
  t: SandboxTable,
  deck: Deck,
  cardIds: string[],
  at: { x: number; y: number },
  ids: () => string,
): SandboxTable {
  const chosen = new Set(cardIds);
  const cards: SandboxCard[] = deck.cards
    .filter((c) => chosen.has(c.id))
    .flatMap((c) => Array.from({ length: c.copies ?? 1 }, () => ({ iid: ids(), deckId: deck.id, cardId: c.id, faceUp: false, single: true })));
  if (!cards.length) return t;
  // Bottom first: the deck's first card ends up on top, as at the top of a deck.
  return { ...t, stacks: [...t.stacks, { id: ids(), x: at.x, y: at.y, angle: 0, cards: cards.reverse() }] };
}

/** The table without any cards from decks that no longer exist (or cards since removed from their deck). */
export function prune(t: SandboxTable, decks: Deck[]): SandboxTable {
  const known = new Set(decks.flatMap((d) => d.cards.map((c) => `${d.id}:${c.id}`)));
  const keep = (c: SandboxCard) => known.has(`${c.deckId}:${c.cardId}`);
  const stacks = t.stacks.map((s) => ({ ...s, cards: s.cards.filter(keep) })).filter((s) => s.cards.length);
  const hands = t.hands.map((h) => h.filter(keep));
  const trash = (t.trash ?? []).filter(keep);
  const same =
    stacks.length === t.stacks.length &&
    stacks.every((s, i) => s.cards.length === t.stacks[i].cards.length) &&
    hands.every((h, i) => h.length === t.hands[i].length) &&
    trash.length === (t.trash ?? []).length;
  return same ? t : { ...t, stacks, hands, ...(t.trash ? { trash } : {}) };
}

/**
 * Moves and turns stacks together (a group dragged, and twisted): each turned `angle` degrees about `pivot` (a
 * table point), then moved `by`, its own turn changing to match. `place` settles each (e.g. onto the grid). Locked
 * ones stay put.
 */
export function rotateStacks(
  t: SandboxTable,
  ids: string[],
  pivot: { x: number; y: number },
  angle: number,
  by: { x: number; y: number },
  place = (p: { x: number; y: number; angle: number }) => p,
): SandboxTable {
  const r = (angle * Math.PI) / 180;
  const cos = Math.cos(r);
  const sin = Math.sin(r);
  const moving = new Set(ids.filter((id) => !t.stacks.find((s) => s.id === id)?.locked));
  const moved = t.stacks.map((s) => {
    if (!moving.has(s.id)) return s;
    const dx = s.x - pivot.x;
    const dy = s.y - pivot.y;
    const at = place({ x: pivot.x + dx * cos - dy * sin + by.x, y: pivot.y + dx * sin + dy * cos + by.y, angle: normalizeAngle(s.angle + angle) });
    return { ...s, ...at, angle: normalizeAngle(at.angle) };
  });
  return { ...t, stacks: [...moved.filter((s) => !moving.has(s.id)), ...moved.filter((s) => moving.has(s.id))] };
}

/**
 * Spreads a stack out, each card its own stack a `step` apart (a grid step: as close as the grid lets cards sit),
 * down the table or across it, from where the stack lay: its bottom card there, its top card furthest along and on
 * top, so every card shows. They keep the stack's turn. `ids` names the new stacks.
 */
export function fanStack(t: SandboxTable, stackId: string, direction: 'down' | 'across', ids: () => string, step = GRID_STEP): SandboxTable {
  const s = t.stacks.find((st) => st.id === stackId);
  if (!s || s.cards.length < 2) return t;
  // The whole fan on the table: near its edge, it starts back far enough to fit (a step apart, whole steps back so
  // it stays on the grid); one too long for the table is squeezed to fit it.
  const across = direction === 'across';
  const length = across ? TABLE_W : TABLE_H;
  const from = across ? s.x : s.y;
  const gap = Math.min(step, length / (s.cards.length - 1));
  const span = gap * (s.cards.length - 1);
  const start = from + span <= length ? from : Math.max(0, from - Math.ceil((from + span - length) / gap) * gap);
  const fanned = s.cards.map((card, i) => ({
    id: ids(),
    x: across ? start + i * gap : s.x,
    y: across ? s.y : start + i * gap,
    angle: s.angle,
    cards: [card],
  }));
  return { ...t, stacks: [...t.stacks.filter((st) => st.id !== stackId), ...fanned] };
}

/** How close (table units) a flipped card must lie to a stack under it to join it: almost exactly on it. */
export const SETTLE_REACH = GRID_STACK_REACH;

/**
 * A stack just turned over joins the stack it lies on (one drawn below it, its middle within `reach`) if they now
 * face the same way, going on top of it, as if it had been put down there. Otherwise the table as it is.
 */
export function settleOnto(t: SandboxTable, stackId: string, reach = SETTLE_REACH): SandboxTable {
  const at = t.stacks.findIndex((s) => s.id === stackId);
  const s = t.stacks[at];
  if (!s || !stackable(s)) return t;
  const face = s.cards[s.cards.length - 1].faceUp;
  for (let i = at - 1; i >= 0; i--) {
    const under = t.stacks[i];
    if (Math.hypot(under.x - s.x, under.y - s.y) > reach) continue;
    // The one right under it decides: facing the other way (or never stacking), it stays apart.
    if (!stackable(under) || under.cards[under.cards.length - 1].faceUp !== face) return t;
    const merged = { ...under, cards: [...under.cards, ...s.cards] };
    return { ...t, stacks: [...t.stacks.filter((st) => st.id !== under.id && st.id !== stackId), merged] };
  }
  return t;
}

/** Whether two stacks' cards overlap on the table (near enough: the boxes round them, as turned, meet). */
function overlapping(a: SandboxStack, b: SandboxStack, size: CardSize): boolean {
  const box = (s: SandboxStack) => {
    const c = stackCorners(s, size);
    return { l: Math.min(...c.map((p) => p.x)), r: Math.max(...c.map((p) => p.x)), t: Math.min(...c.map((p) => p.y)), b: Math.max(...c.map((p) => p.y)) };
  };
  const p = box(a);
  const q = box(b);
  return p.l < q.r && q.l < p.r && p.t < q.b && q.t < p.b;
}

/**
 * Moves a stack among the layers of cards it lies with: to the very back or front, or down or up past the next
 * stack it overlaps (so each step shows). Unchanged if there's nothing that way to pass.
 */
export function moveLayer(t: SandboxTable, stackId: string, to: 'back' | 'down' | 'up' | 'front', size: CardSize): SandboxTable {
  const at = t.stacks.findIndex((s) => s.id === stackId);
  if (at < 0) return t;
  const s = t.stacks[at];
  const rest = t.stacks.filter((x) => x.id !== stackId);
  let place: number;
  if (to === 'back') place = 0;
  else if (to === 'front') place = rest.length;
  else if (to === 'down') {
    // Just below the nearest stack under it that it overlaps.
    let k = at - 1;
    while (k >= 0 && !overlapping(t.stacks[k], s, size)) k--;
    if (k < 0) return t;
    place = k;
  } else {
    // Just above the nearest stack over it that it overlaps.
    let k = at + 1;
    while (k < t.stacks.length && !overlapping(t.stacks[k], s, size)) k++;
    if (k >= t.stacks.length) return t;
    place = k;
  }
  const stacks = [...rest.slice(0, place), s, ...rest.slice(place)];
  return stacks.every((x, i) => x === t.stacks[i]) ? t : { ...t, stacks };
}

/** Changes one stack's settings (locked, say). */
export const setStack = (t: SandboxTable, stackId: string, changes: Partial<Pick<SandboxStack, 'locked'>>) =>
  updateStack(t, stackId, (s) => ({ ...s, ...changes }));

/** Marks every card of a stack as never stacking (or stacking again). */
export const setSolo = (t: SandboxTable, stackId: string, solo: boolean) =>
  updateStack(t, stackId, (s) => ({ ...s, cards: s.cards.map(({ solo: _old, ...c }) => (solo ? { ...c, solo: true } : c)) }));

/**
 * Moves cards within a stack, as a search shows them (top first): those at places `picked` (in the order picked)
 * go together, as a block starting at place `to`.
 */
export function reorderStack(t: SandboxTable, stackId: string, picked: number[], to: number): SandboxTable {
  return updateStack(t, stackId, (s) => {
    const topFirst = [...s.cards].reverse();
    const moving = picked.map((i) => topFirst[i]).filter((c): c is SandboxCard => !!c);
    const rest = topFirst.filter((c) => !moving.includes(c));
    const at = Math.max(0, Math.min(rest.length, to));
    return { ...s, cards: [...rest.slice(0, at), ...moving, ...rest.slice(at)].reverse() };
  });
}

/** Cards into the table's trash (to be put back, or gathered up again). */
export const trashCards = (t: SandboxTable, cards: SandboxCard[]): SandboxTable => (cards.length ? { ...t, trash: [...(t.trash ?? []), ...cards] } : t);

/** Takes stacks off the table, into its trash. */
export const removeStacks = (t: SandboxTable, ids: string[]): SandboxTable =>
  trashCards(
    { ...t, stacks: t.stacks.filter((s) => !ids.includes(s.id)) },
    t.stacks.filter((s) => ids.includes(s.id)).flatMap((s) => s.cards),
  );

/** Takes cards out of the trash (by instance), e.g. to put them back on the table. */
export const takeFromTrash = (t: SandboxTable, iids: string[]): SandboxTable => ({ ...t, trash: (t.trash ?? []).filter((c) => !iids.includes(c.iid)) });

/**
 * Tidies the table: every stack (but locked ones) turned to the nearest 45° and moved onto the grid. Two never
 * share a spot (which would look like one stack): a stack whose spot is taken goes to the nearest free one.
 */
export function tidyTable(t: SandboxTable, step = GRID_STEP): SandboxTable {
  const key = (p: { x: number; y: number }) => `${Math.round(p.x)},${Math.round(p.y)}`;
  // Locked ones stay where they are, and keep their spots.
  const taken = new Set(t.stacks.filter((s) => s.locked).map(key));
  const stacks = t.stacks.map((s) => {
    if (s.locked) return s;
    const angle = normalizeAngle(Math.round(s.angle / SNAP_STEP) * SNAP_STEP);
    let at = snapToGrid({ x: s.x, y: s.y, angle }, step);
    if (taken.has(key(at))) {
      // The nearest free grid spot: crossings and square middles round it, nearest first.
      const spots: { x: number; y: number }[] = [];
      for (let i = -6; i <= 6; i++) {
        for (let j = -6; j <= 6; j++) {
          spots.push({ x: at.x + i * step, y: at.y + j * step }, { x: at.x + (i + 0.5) * step, y: at.y + (j + 0.5) * step });
        }
      }
      const inside = (p: { x: number; y: number }) => p.x >= 0 && p.y >= 0 && p.x <= TABLE_W && p.y <= TABLE_H;
      const free = spots
        .filter((p) => inside(p) && !taken.has(key(p)))
        .sort((a, b) => Math.hypot(a.x - s.x, a.y - s.y) - Math.hypot(b.x - s.x, b.y - s.y))[0];
      if (free) at = { ...free, angle };
    }
    taken.add(key(at));
    return { ...s, x: at.x, y: at.y, angle };
  });
  return { ...t, stacks };
}

/**
 * How many whole sets of a deck some cards make: the most any one card asks for (two of a card the deck has once
 * means two decks' worth were brought on). At least one.
 */
export function setsOfDeck(deck: Deck, cards: SandboxCard[]): number {
  const counts = new Map<string, number>();
  for (const c of cards) if (c.deckId === deck.id) counts.set(c.cardId, (counts.get(c.cardId) ?? 0) + 1);
  return Math.max(1, ...deck.cards.map((c) => Math.ceil((counts.get(c.id) ?? 0) / (c.copies ?? 1))));
}

/**
 * Gathers the table up by deck, for a new game: every deck with a card anywhere on it (the table, a hand or the
 * trash) back as complete decks (every card and copy, as the deck is now; as many of them as were brought on, see
 * setsOfDeck), each shuffled and face down, in a row from `at` a card and a half apart (`place` settles each spot,
 * e.g. onto the grid). Cards brought on one by one (`single`) come back as singles instead: each deck's fanned out
 * face up, a `step` apart, in a row below. Hands and trash are emptied.
 */
export function gatherDecks(
  t: SandboxTable,
  decks: Deck[],
  at: { x: number; y: number },
  ids: () => string,
  random: () => number = Math.random,
  place = (p: { x: number; y: number; angle: number }) => p,
  step = GRID_STEP,
): SandboxTable {
  const all = [...t.stacks.flatMap((s) => s.cards), ...t.hands.flat(), ...(t.trash ?? [])];
  const whole = all.filter((c) => !c.single);
  const used: string[] = [];
  for (const c of all) if (!used.includes(c.deckId)) used.push(c.deckId);
  const known = used.map((id) => decks.find((d) => d.id === id)).filter((d): d is Deck => !!d && d.cards.length > 0);
  // Whole decks, as many of each as were brought on, in a row.
  const sets = known.flatMap((deck) => (whole.some((c) => c.deckId === deck.id) ? Array.from({ length: setsOfDeck(deck, whole) }, () => deck) : []));
  const empty: SandboxTable = { ...t, stacks: [], hands: t.hands.map(() => []), trash: [] };
  let table = sets.reduce((tb, deck, i) => {
    const spot = place({ x: at.x + i * CARD_W * 1.5, y: at.y, angle: 0 });
    return addDeck(tb, deck, { x: spot.x, y: spot.y }, ids, random);
  }, empty);
  // Cards brought on one by one: by deck, each deck's fanned out face up across a row below (in the deck's order).
  let row = sets.length ? 1 : 0;
  for (const deck of known) {
    const singles = all
      .filter((c) => c.single && c.deckId === deck.id)
      .sort((a, b) => deck.cards.findIndex((k) => k.id === a.cardId) - deck.cards.findIndex((k) => k.id === b.cardId));
    if (!singles.length) continue;
    const y = at.y + row * CARD_W * 1.8;
    singles.forEach((c, i) => {
      const spot = place({ x: at.x + i * step, y, angle: 0 });
      table = { ...table, stacks: [...table.stacks, { id: ids(), x: spot.x, y: spot.y, angle: 0, cards: [{ ...c, faceUp: true }] }] };
    });
    row++;
  }
  return table;
}