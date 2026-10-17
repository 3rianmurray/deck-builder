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
  /** The camera as it was left, or none yet (it starts looking at the middle of the table). */
  camera?: Camera;
  createdAt: number;
  updatedAt: number;
}

/** The table's size, in table units, with (0, 0) its top-left corner. */
export const TABLE_W = 3600;
export const TABLE_H = 2400;
/** How wide a standard (poker size) card is on the table, in table units: other cards are to the same scale. */
export const CARD_W = 100;
/** Table units per millimetre of a real card (a standard card is 63.5 mm wide). */
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

/** The camera looking at the middle of the table, upright, zoomed to fit the given screen area. */
export function startCamera(view: { w: number; h: number }): Camera {
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

/** The part of a stack's top-right corner that picks up the whole stack (as its count badge sits there). */
const BADGE_REACH = 0.32;

/**
 * The topmost stack under a table point, if any, and whether the point is on its count badge (top-right corner
 * of a stack of two or more), which takes the whole stack rather than its top card.
 */
export function stackAt(t: SandboxTable, x: number, y: number, size: CardSize): { stack: SandboxStack; whole: boolean } | null {
  for (let i = t.stacks.length - 1; i >= 0; i--) {
    const s = t.stacks[i];
    const top = s.cards[s.cards.length - 1];
    const { w, h } = size(top.deckId);
    const p = inStack(s, x, y);
    if (Math.abs(p.x) > w / 2 || Math.abs(p.y) > h / 2) continue;
    const whole = s.cards.length > 1 && p.x > w / 2 - w * BADGE_REACH && p.y < -h / 2 + h * BADGE_REACH;
    return { stack: s, whole };
  }
  return null;
}

/** How close (as a share of a card's width) a dropped card's middle must be to a stack's to go onto it. */
const STACK_REACH = 0.4;

/**
 * The stack a card dropped at a table point would go onto (the topmost near enough), leaving out `except`. With
 * the grid on, only one dropped almost exactly on it (within `reach` table units): cards set down near each other
 * snap and overlap instead, as in Tabletop Simulator.
 */
export function stackTargetAt(
  t: SandboxTable,
  x: number,
  y: number,
  size: CardSize,
  except?: string,
  reach?: number,
): SandboxStack | null {
  for (let i = t.stacks.length - 1; i >= 0; i--) {
    const s = t.stacks[i];
    if (s.id === except) continue;
    const { w } = size(s.cards[s.cards.length - 1].deckId);
    if (Math.hypot(x - s.x, y - s.y) <= (reach ?? w * STACK_REACH)) return s;
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

/** Brings a stack to the top of the drawing order (it was just touched). */
export const raise = (t: SandboxTable, stackId: string): SandboxTable => {
  const s = t.stacks.find((st) => st.id === stackId);
  return s ? { ...t, stacks: [...t.stacks.filter((st) => st.id !== stackId), s] } : t;
};

/** Changes one stack. */
const updateStack = (t: SandboxTable, stackId: string, fn: (s: SandboxStack) => SandboxStack): SandboxTable => ({
  ...t,
  stacks: t.stacks.map((s) => (s.id === stackId ? fn(s) : s)),
});

/** Turns a whole stack over, like turning a real pile over: its order reverses, and every card flips. */
export const flipStack = (t: SandboxTable, stackId: string) =>
  updateStack(t, stackId, (s) => ({ ...s, cards: [...s.cards].reverse().map((c) => ({ ...c, faceUp: !c.faceUp })) }));

/** Turns a stack a quarter turn clockwise, landing on the table's 45° steps. */
export const turnStack = (t: SandboxTable, stackId: string) =>
  updateStack(t, stackId, (s) => ({ ...s, angle: normalizeAngle(Math.round((s.angle + 90) / SNAP_STEP) * SNAP_STEP) }));

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

/** The table without any cards from decks that no longer exist (or cards since removed from their deck). */
export function prune(t: SandboxTable, decks: Deck[]): SandboxTable {
  const known = new Set(decks.flatMap((d) => d.cards.map((c) => `${d.id}:${c.id}`)));
  const keep = (c: SandboxCard) => known.has(`${c.deckId}:${c.cardId}`);
  const stacks = t.stacks.map((s) => ({ ...s, cards: s.cards.filter(keep) })).filter((s) => s.cards.length);
  const hands = t.hands.map((h) => h.filter(keep));
  const same = stacks.length === t.stacks.length && stacks.every((s, i) => s.cards.length === t.stacks[i].cards.length) && hands.every((h, i) => h.length === t.hands[i].length);
  return same ? t : { ...t, stacks, hands };
}
