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
  /** Drawn this much bigger (or smaller) than its deck's size on the table; none is its own size. Not in a hand. */
  scale?: number;
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

/**
 * What a piece on the table is, besides cards: a counter (a number to count up and down), a die, a coin, a text
 * label, a first-player marker, a spinner, a playing piece (a meeple, pawn, cube or disc: see PieceShape), a token\n * (round or square, plain or with a picture of the player's own), a timer, or a zone (an area marked out on the cloth,\n * under the cards; a card spot is one that cards snap into), a bag (cards dropped in, drawn out at random), or a\n * track (a row of numbered spaces with a marker), or custom art (the player's own picture, at its own shape).
 */
export type PieceKind = 'counter' | 'die' | 'coin' | 'text' | 'marker' | 'spinner' | 'meeple' | 'token' | 'timer' | 'zone' | 'bag' | 'track' | 'art';

/** A playing piece's shape. */
export type PieceShape = 'meeple' | 'pawn' | 'cube' | 'disc';
/** How a zone's drawn: its outline, filled in, or a dashed outline. */
export type ZoneLook = 'outline' | 'filled' | 'dashed';
export const PIECE_SHAPES: { shape: PieceShape; name: string }[] = [
  { shape: 'meeple', name: 'Meeple' },
  { shape: 'pawn', name: 'Pawn' },
  { shape: 'cube', name: 'Cube' },
  { shape: 'disc', name: 'Disc' },
];

/** A piece on the table that isn't a card: always upright on the table, above the cards. */
export interface TablePiece {
  id: string;
  kind: PieceKind;
  /** Its middle, in table units. */
  x: number;
  y: number;
  /**
   * A counter's number; the face a die last landed on; a coin's side (1 heads, 2 tails); where a spinner's arrow
   * points (degrees clockwise from up).
   */
  value: number;
  /** A die's number of faces (see DIE_SIDES). */
  sides?: number;
  /** What a counter counts (e.g. Life), shown under it; a text label's words; what a marker says (e.g. 1st). */
  label?: string;
  /** A playing piece's shape. */
  shape?: PieceShape;
  /**
   * Custom art's place among the cards: the stack it lies just over (it's drawn after that one, under any after it),
   * or none for under every card. Everything else that isn't a zone lies over every card.
   */
  over?: string;
  /** Custom art's turn on the table, in degrees clockwise (as a stack's). */
  angle?: number;
  /** A token's (or custom art's) picture (a saved picture's path), and whether a token's square (round, otherwise). */
  image?: string;
  square?: boolean;
  /** A running timer: when it runs out (ms since 1970). A paused one: how many seconds it had left. */
  endsAt?: number;
  left?: number;
  /** A zone's (or custom art's) own size (table units, before its scale), and how a zone's drawn. */
  w?: number;
  h?: number;
  look?: ZoneLook;
  /** A zone cards snap into (a card spot): a card dropped in it settles in its middle, onto any already there. */
  snap?: boolean;
  /**
   * A zone (or text) that stays put: dragged, the table moves instead. A locked zone's table works as if it weren't\n   * there; a hold still gives either's options, and text can still be tapped to change it.
   */
  locked?: boolean;
  /** What's in a bag, bottom first (the top is drawn first), as a stack's cards are. */
  items?: BagItem[];
  /** A bag that's an endless supply of one thing: each drawn is a fresh one of it. */
  supply?: BagItem;
  /** What was in a bag before it held pieces too (only cards): read as its items. */
  cards?: SandboxCard[];
  /** A track's number of spaces, and the number its first space shows (its marker's space is its value, from 0). */
  spaces?: number;
  first?: number;
  /** A track standing up (its spaces top to bottom), and one whose numbers run the other way (right to left, or bottom to top). */
  vertical?: boolean;
  reversed?: boolean;
  /** A track's marker's color (one of PIECE_COLORS), or none for the app's gold. */
  markerColor?: string;
  /** Its color (one of PIECE_COLORS), or none for its own (see defaultPieceColor). */
  color?: string;
  /** Drawn this much bigger (or smaller) than PIECE_SIZE; none is its own size. */
  scale?: number;
  /** A die that rolls where it lies (spinning and bouncing), rather than tumbling across the table. */
  rollInPlace?: boolean;
}

/** The colors a counter or die can be, by name. */
export const PIECE_COLORS = {
  Ivory: '#f4f1e8',
  Black: '#2c2c2a',
  Red: '#e24b4a',
  Orange: '#ef9f27',
  Yellow: '#f2d04a',
  Green: '#639922',
  Teal: '#1d9e75',
  Blue: '#378add',
  Purple: '#7f77dd',
  Pink: '#d4537e',
  Gold: '#d4a72c',
  Silver: '#b9bcc2',
} as const;

/** A piece's own color, when none's been chosen: dark for a counter, ivory for a d6, and its own for each other die. */
export function defaultPieceColor(p: Pick<TablePiece, 'kind' | 'sides'>): string {
  if (p.kind === 'counter') return '#14202a';
  if (p.kind === 'coin' || p.kind === 'marker') return PIECE_COLORS.Gold;
  if (p.kind === 'text' || p.kind === 'spinner') return PIECE_COLORS.Ivory;
  if (p.kind === 'meeple') return PIECE_COLORS.Red;
  if (p.kind === 'token') return '#d9d2c4';
  if (p.kind === 'timer') return '#14202a';
  if (p.kind === 'zone') return PIECE_COLORS.Ivory;
  if (p.kind === 'bag') return '#8a5a3c';
  if (p.kind === 'track') return '#14202a';
  const own: Record<number, string> = { 4: PIECE_COLORS.Green, 6: PIECE_COLORS.Ivory, 8: PIECE_COLORS.Blue, 10: PIECE_COLORS.Purple, 12: PIECE_COLORS.Pink, 20: PIECE_COLORS.Red };
  return own[p.sides ?? 6] ?? PIECE_COLORS.Ivory;
}

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
  /** The table's theme (a key of TABLE_THEMES in tableThemes.ts): its cloth, and a tray to go with it. None is the classic felt. */
  background?: string;
  /** The grid's lines are drawn (snapping is separate: see snapToGrid). */
  showGrid?: boolean;
  /** The grid's spacing, in table units, or none for GRID_STEP. */
  gridStep?: number;
  /** The hands' tray is hidden: the table runs to the bottom of the screen (the hands keep their cards). */
  hideHands?: boolean;
  /** Stacks don't show how many cards they hold. */
  hideCounts?: boolean;
  /** Cards taken off the table, kept to put back (newest last). */
  trash?: SandboxCard[];
  /** Counters and dice, in drawing order (later ones on top), above every card. */
  pieces?: TablePiece[];
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
    // Charcoal, the default theme (see tableThemes.ts).
    background: 'charcoal',
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

// ---- Scale: anything on the table drawn bigger or smaller ----

/** How small and how big anything on the table can be made, against its own size. */
export const SCALE_MIN = 0.1;
export const SCALE_MAX = 4;
export const clampScale = (k: number) => Math.min(SCALE_MAX, Math.max(SCALE_MIN, k));
/** A scale as kept: none for its own size (or near enough), and rounded so it doesn't drift. */
const keptScale = (k: number) => (Math.abs(k - 1) < 0.005 ? undefined : Math.round(clampScale(k) * 1e6) / 1e6);

/** A card's size on the table: its deck's, at its own scale. Its deck's very size (the same object) at its own. */
export function cardSizeOf(c: SandboxCard, size: CardSize): { w: number; h: number } {
  const base = size(c.deckId);
  const k = c.scale ?? 1;
  return k === 1 ? base : { w: base.w * k, h: base.h * k };
}

/** A piece's size on the table, at its scale. */
export function pieceSizeOf(p: TablePiece): { w: number; h: number } {
  const base =
    p.kind === 'text'
      ? textSize(p.label ?? '')
      : p.kind === 'zone'
        ? { w: p.w ?? PIECE_SIZE.zone.w, h: p.h ?? PIECE_SIZE.zone.h }
        : p.kind === 'track'
          ? trackSize(p.spaces ?? 10, p.vertical)
          : p.kind === 'art'
            ? { w: p.w ?? PIECE_SIZE.art.w, h: p.h ?? PIECE_SIZE.art.h }
            : PIECE_SIZE[p.kind];
  const k = p.scale ?? 1;
  return k === 1 ? base : { w: base.w * k, h: base.h * k };
}

/** How wide a card is drawn on the table, to within a tenth of a unit (what counts as the same size). */
const drawnWidth = (c: SandboxCard, size: CardSize) => Math.round(cardSizeOf(c, size).w * 10) / 10;

/**
 * Every card in a stack the size of its bottom card (the one the stack started as): a card put onto a stack of
 * another size is scaled to it. Stacks already that way, and the table if all are, are left as they were.
 */
export function matchStackSizes(t: SandboxTable, size: CardSize): SandboxTable {
  let changed = false;
  const stacks = t.stacks.map((s) => {
    const w = drawnWidth(s.cards[0], size);
    if (s.cards.every((c) => drawnWidth(c, size) === w)) return s;
    changed = true;
    const want = cardSizeOf(s.cards[0], size).w;
    return { ...s, cards: s.cards.map((c) => ({ ...c, scale: keptScale(want / size(c.deckId).w) })) };
  });
  return changed ? { ...t, stacks } : t;
}

/** The scale stacks and pieces are drawn at now: the first one's (its bottom card's, for a stack). */
export function scaleOf(t: SandboxTable, stackIds: string[], pieceIds: string[]): number {
  const s = t.stacks.find((x) => stackIds.includes(x.id));
  if (s) return s.cards[0].scale ?? 1;
  return t.pieces?.find((p) => pieceIds.includes(p.id))?.scale ?? 1;
}

/**
 * Stacks and pieces drawn at a scale of their own size (each card of a stack its bottom card's, so they stay one
 * size), within SCALE_MIN and SCALE_MAX. 1 puts them back to their own sizes.
 */
export function scaleItems(t: SandboxTable, stackIds: string[], pieceIds: string[], k: number, size: CardSize): SandboxTable {
  const scale = keptScale(k);
  const stacks = t.stacks.map((s) => (stackIds.includes(s.id) ? { ...s, cards: s.cards.map((c, i) => (i ? c : { ...c, scale })) } : s));
  const pieces = t.pieces?.map((p) => (pieceIds.includes(p.id) ? { ...p, scale } : p));
  return matchStackSizes({ ...t, stacks, ...(pieces ? { pieces } : {}) }, size);
}

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
    const { w, h } = cardSizeOf(top, size);
    const p = inStack(s, x, y);
    const several = s.cards.length > 1;
    if (several && Math.hypot(p.x - (w / 2 - BADGE_OFFSET), p.y - (-h / 2 + BADGE_OFFSET)) <= badgeReach) return { stack: s, whole: true };
    if (Math.abs(p.x) > w / 2 || Math.abs(p.y) > h / 2) continue;
    const whole = several && p.x > w / 2 - w * BADGE_REACH && p.y < -h / 2 + h * BADGE_REACH;
    return { stack: s, whole };
  }
  return null;
}
// ---- Pieces: counters and dice ----

/** The dice a die can be: how many faces. */
export const DIE_SIDES = [4, 6, 8, 10, 12, 20] as const;

/** A piece's size on the table, in table units (a standard card is CARD_W wide). */
export const PIECE_SIZE: Record<PieceKind, { w: number; h: number }> = {
  counter: { w: 150, h: 60 },
  die: { w: 60, h: 60 },
  coin: { w: 58, h: 58 },
  // A text label's height (its width goes by its words: see textSize).
  text: { w: 0, h: 40 },
  marker: { w: 64, h: 64 },
  spinner: { w: 120, h: 120 },
  meeple: { w: 46, h: 50 },
  token: { w: 62, h: 62 },
  timer: { w: 100, h: 100 },
  // A new zone's size (each has its own: see TablePiece.w and h).
  zone: { w: 320, h: 220 },
  bag: { w: 84, h: 96 },
  // A track's height (its width goes by its spaces: see trackSize).
  track: { w: 0, h: 56 },
  // Custom art's room on its longest side (each has its own shape: see TablePiece.w and h).
  art: { w: 120, h: 120 },
};

/** The most custom art a table can have (each is a picture to draw). */
export const ART_MAX = 40;

/** Custom art's own size on the table, from its picture's: ART's room on its longest side. */
export function artSize(width: number, height: number) {
  const side = PIECE_SIZE.art.w;
  return width >= height ? { w: side, h: Math.max(20, Math.round((side * height) / width)) } : { w: Math.max(20, Math.round((side * width) / height)), h: side };
}

/** How wide each of a track's spaces is, the room at its ends, and how many it can have. */
export const TRACK_SPACE = 44;
const TRACK_END = 8;
export const TRACK_MAX = 50;
export const trackSize = (spaces: number, vertical = false) => {
  const long = spaces * TRACK_SPACE + TRACK_END * 2;
  return vertical ? { w: PIECE_SIZE.track.h, h: long } : { w: long, h: PIECE_SIZE.track.h };
};

/** The smallest a zone can be made, on each side. */
export const ZONE_MIN = 40;

/** A text label's lettering size (table units), and roughly how wide each letter is against it. */
export const TEXT_SIZE = 24;
const TEXT_LETTER = 0.56;
const TEXT_MAX_W = 700;
/** How much room a text label takes: its words on one line, with a little room round them. */
export const textSize = (label: string) => ({
  w: Math.min(TEXT_MAX_W, Math.max(60, Math.round(label.length * TEXT_SIZE * TEXT_LETTER + 28))),
  h: PIECE_SIZE.text.h,
});

/** How far into a counter, from each end, its − and + reach (the middle, its number, is neither). */
export const COUNTER_BUTTON = 50;

/** The part of a piece a point is on: a counter's − or +, or anywhere else on it. */
export type PiecePart = 'minus' | 'plus' | 'body';

/** Whether a table point is on a piece (within its size, at its scale). */
const onPiece = (p: TablePiece, x: number, y: number) => {
  const { w, h } = pieceSizeOf(p);
  const q = inPiece(p, x, y);
  return Math.abs(q.x) <= w / 2 && Math.abs(q.y) <= h / 2;
};

/** Where a table point is relative to a piece: in its own (turned) frame, from its middle. */
function inPiece(p: TablePiece, x: number, y: number) {
  const r = (-(p.angle ?? 0) * Math.PI) / 180;
  const dx = x - p.x;
  const dy = y - p.y;
  return { x: dx * Math.cos(r) - dy * Math.sin(r), y: dx * Math.sin(r) + dy * Math.cos(r) };
}

/** The topmost zone under a table point, if any (zones lie under everything else; see pieceAt). */
export function zoneAt(t: SandboxTable, x: number, y: number): TablePiece | null {
  const zones = (t.pieces ?? []).filter((p) => p.kind === 'zone');
  for (let i = zones.length - 1; i >= 0; i--) if (onPiece(zones[i], x, y)) return zones[i];
  return null;
}

/** The card spot (a zone cards snap into) a table point is in, if any. */
export const spotAt = (t: SandboxTable, x: number, y: number) => (t.pieces ?? []).find((p) => p.kind === 'zone' && p.snap && onPiece(p, x, y)) ?? null;

/** An unlocked zone whose bottom-right corner (its grip, for resizing it) is within `reach` of a table point. */
export function zoneGripAt(t: SandboxTable, x: number, y: number, reach: number): TablePiece | null {
  const zones = (t.pieces ?? []).filter((p) => p.kind === 'zone' && !p.locked);
  for (let i = zones.length - 1; i >= 0; i--) {
    const { w, h } = pieceSizeOf(zones[i]);
    if (Math.hypot(x - (zones[i].x + w / 2), y - (zones[i].y + h / 2)) <= reach) return zones[i];
  }
  return null;
}

/**
 * A zone resized from its bottom-right corner (its top-left corner staying put), to a new own size (before its
 * scale), no smaller than ZONE_MIN.
 */
export function resizeZone(p: TablePiece, w: number, h: number): Pick<TablePiece, 'x' | 'y' | 'w' | 'h'> {
  const k = p.scale ?? 1;
  const was = pieceSizeOf(p);
  const nw = Math.max(ZONE_MIN, Math.round(w));
  const nh = Math.max(ZONE_MIN, Math.round(h));
  const left = p.x - was.w / 2;
  const top = p.y - was.h / 2;
  return { w: nw, h: nh, x: Math.round(left + (nw * k) / 2), y: Math.round(top + (nh * k) / 2) };
}

/** The room a zone fitted to what's in it leaves round it (table units). */
const ZONE_FIT_ROOM = 12;

/**
 * A zone fitted to what's in it: every stack and piece of custom art whose middle lies in it, with a little room
 * round them (its scale kept). The table as it was if there's nothing in it.
 */
export function fitZone(t: SandboxTable, zoneId: string, size: CardSize): SandboxTable {
  const zone = t.pieces?.find((p) => p.id === zoneId && p.kind === 'zone');
  if (!zone) return t;
  const stacks = t.stacks.filter((s) => onPiece(zone, s.x, s.y));
  const art = (t.pieces ?? []).filter((p) => p.kind === 'art' && onPiece(zone, p.x, p.y));
  const corners = [
    ...stacks.flatMap((s) => stackCorners(s, size)),
    ...art.flatMap((p) => {
      const { w, h } = pieceSizeOf(p);
      const r = ((p.angle ?? 0) * Math.PI) / 180;
      return [
        [-w / 2, -h / 2],
        [w / 2, -h / 2],
        [w / 2, h / 2],
        [-w / 2, h / 2],
      ].map(([x, y]) => ({ x: p.x + x * Math.cos(r) - y * Math.sin(r), y: p.y + x * Math.sin(r) + y * Math.cos(r) }));
    }),
  ];
  if (!corners.length) return t;
  const left = Math.min(...corners.map((c) => c.x)) - ZONE_FIT_ROOM;
  const right = Math.max(...corners.map((c) => c.x)) + ZONE_FIT_ROOM;
  const top = Math.min(...corners.map((c) => c.y)) - ZONE_FIT_ROOM;
  const bottom = Math.max(...corners.map((c) => c.y)) + ZONE_FIT_ROOM;
  const k = zone.scale ?? 1;
  return setPiece(t, zoneId, {
    x: Math.round((left + right) / 2),
    y: Math.round((top + bottom) / 2),
    w: Math.max(ZONE_MIN, Math.round((right - left) / k)),
    h: Math.max(ZONE_MIN, Math.round((bottom - top) / k)),
  });
}

/**
 * The topmost piece (not a zone: see zoneAt) under a table point, if any, and which part of it the point is on.
 * A small piece can be caught a little way off it too (`reach`: at least this far from its middle each way, in
 * table units), so it's easy to get a finger on; but only when nothing's right under the point.
 */
export function pieceAt(t: SandboxTable, x: number, y: number, reach = 0): { piece: TablePiece; part: PiecePart } | null {
  // Custom art lies among the cards, under every other piece: looked for last.
  const all = (t.pieces ?? []).filter((p) => p.kind !== 'zone');
  const pieces = [...all.filter((p) => p.kind === 'art'), ...all.filter((p) => p.kind !== 'art')];
  const find = (grow: number) => {
    for (let i = pieces.length - 1; i >= 0; i--) {
      const p = pieces[i];
      const { w, h } = pieceSizeOf(p);
      const { x: dx, y: dy } = inPiece(p, x, y);
      if (Math.abs(dx) > Math.max(w / 2, grow) || Math.abs(dy) > Math.max(h / 2, grow)) continue;
      const button = COUNTER_BUTTON * (p.scale ?? 1);
      const part: PiecePart = p.kind !== 'counter' ? 'body' : dx < -w / 2 + button ? 'minus' : dx > w / 2 - button ? 'plus' : 'body';
      return { piece: p, part };
    }
    return null;
  };
  // Right on one first; then (art aside: it's big) small ones near.
  return find(0) ?? (reach > 0 ? find(reach) : null);
}

/** A new piece at a table point: a counter at 0, or a d6 showing a 6 (or a die of `sides`, showing its highest). */
export function newPiece(kind: PieceKind, id: string, at: { x: number; y: number }, sides = 6, shape: PieceShape = 'meeple'): TablePiece {
  const spot = { x: Math.round(at.x), y: Math.round(at.y) };
  if (kind === 'die') return { id, kind, ...spot, value: sides, sides };
  if (kind === 'coin') return { id, kind, ...spot, value: 1 };
  if (kind === 'text') return { id, kind, ...spot, value: 0, label: 'Text' };
  if (kind === 'marker') return { id, kind, ...spot, value: 0, label: '1st' };
  if (kind === 'meeple') return { id, kind, ...spot, value: 0, shape };
  // A token's number is how many it stands for (shown when more than one); a timer's, its time in seconds.
  if (kind === 'token') return { id, kind, ...spot, value: 1 };
  if (kind === 'timer') return { id, kind, ...spot, value: 60 };
  if (kind === 'zone') return { id, kind, ...spot, value: 0, label: 'Zone', w: PIECE_SIZE.zone.w, h: PIECE_SIZE.zone.h };
  if (kind === 'bag') return { id, kind, ...spot, value: 0, cards: [] };
  if (kind === 'track') return { id, kind, ...spot, value: 0, spaces: 10, first: 1 };
  if (kind === 'art') return { id, kind, ...spot, value: 0, w: PIECE_SIZE.art.w, h: PIECE_SIZE.art.h };
  return { id, kind, ...spot, value: 0 };
}

/** The pieces that are rolled (or flipped, or spun) by a tap: dice, coins and spinners. */
export const rollable = (p: TablePiece) => p.kind === 'die' || p.kind === 'coin' || p.kind === 'spinner';

/** Puts a piece on the table, on top of the others. */
export const addPiece = (t: SandboxTable, piece: TablePiece): SandboxTable => ({ ...t, pieces: [...(t.pieces ?? []), piece] });

/** Changes a piece (its place, number, faces or label). */
export const setPiece = (t: SandboxTable, id: string, changes: Partial<Omit<TablePiece, 'id' | 'kind'>>): SandboxTable => ({
  ...t,
  pieces: (t.pieces ?? []).map((p) => (p.id === id ? { ...p, ...changes } : p)),
});

/** Moves a piece to a new place, and on top of the others (as it was just touched). */
export function movePiece(t: SandboxTable, id: string, at: { x: number; y: number }): SandboxTable {
  const pieces = t.pieces ?? [];
  const piece = pieces.find((p) => p.id === id);
  if (!piece) return t;
  return { ...t, pieces: [...pieces.filter((p) => p.id !== id), { ...piece, x: Math.round(at.x), y: Math.round(at.y) }] };
}

/**
 * The pieces (of a kind, if given) a lasso has caught: any lying inside the shape it's drawn (closed back to its
 * start), or that its line passes over.
 */
export function piecesInShape(t: SandboxTable, shape: { x: number; y: number }[], kind?: PieceKind): string[] {
  if (!shape.length) return [];
  return (t.pieces ?? [])
    .filter((p) => {
      // Zones are part of the table's layout, not picked out with what's on it; nor is anything locked in place.
      if ((kind ? p.kind !== kind : p.kind === 'zone') || p.locked) return false;
      const { w, h } = pieceSizeOf(p);
      if (shape.some((q) => Math.abs(q.x - p.x) <= w / 2 && Math.abs(q.y - p.y) <= h / 2)) return true;
      return shape.length >= 3 && insideShape(p, shape);
    })
    .map((p) => p.id);
}

/** The longest a timer can be set for (99:59). */
export const TIMER_MAX = 99 * 60 + 59;

/**
 * A timer tapped: running, it pauses (keeping what's left); paused or new, it starts; run out, it's set back to
 * its full time.
 */
export function toggleTimer(t: SandboxTable, id: string, now: number = Date.now()): SandboxTable {
  const p = t.pieces?.find((q) => q.id === id);
  if (!p || p.kind !== 'timer') return t;
  if (p.endsAt !== undefined) {
    const left = Math.max(0, (p.endsAt - now) / 1000);
    return setPiece(t, id, left > 0 ? { endsAt: undefined, left } : { endsAt: undefined, left: undefined });
  }
  return setPiece(t, id, { endsAt: now + (p.left ?? p.value) * 1000, left: undefined });
}

/** How long a timer's set for, from what's typed: minutes ("5"), or minutes and seconds ("1:30"). Null if neither. */
export function parseTimerText(text: string): number | null {
  const m = text.trim().match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!m) return null;
  const secs = Number(m[1]) * 60 + (m[2] ? Number(m[2]) : 0);
  return secs > 0 ? Math.min(TIMER_MAX, secs) : null;
}

/** Seconds as m:ss (rounded up, so it shows 0:00 only once it's run out). */
export const timerText = (secs: number) => {
  const s = Math.ceil(Math.max(0, secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

/** Something in a bag: a card, or a piece (as it was, though where it lay on the table is forgotten). */
export type BagItem = { card: SandboxCard; piece?: undefined } | { piece: TablePiece; card?: undefined };

/** Its id: a card's instance, or a piece's. */
export const itemKey = (i: BagItem) => (i.card ? i.card.iid : i.piece!.id);

/** What's in a bag, bottom first (one from before bags held pieces too reads its cards). */
export const bagItems = (p: TablePiece): BagItem[] => p.items ?? (p.cards ?? []).map((card) => ({ card }));

/**
 * What makes two things the same, for a supply: the same card (either way up), or a piece that looks just the
 * same (its kind and faces, color, shape, picture, words and size; not where it lies or what it shows now).
 */
export function itemLook(i: BagItem): string {
  if (i.card) return `card:${i.card.deckId}:${i.card.cardId}`;
  const p = i.piece!;
  return JSON.stringify([p.kind, p.sides, p.color, p.shape, p.image, p.square, p.label, p.scale ?? 1, p.spaces, p.first, p.look, p.w, p.h]);
}

/** Whether things are one or more of the very same thing (what a supply can be made of). */
export const allAlike = (items: BagItem[]) => items.length > 0 && items.every((i) => itemLook(i) === itemLook(items[0]));

/** A thing as it's kept in a bag: no place on the table, nothing picked out. */
const bagged = (i: BagItem): BagItem => (i.card ? { card: i.card } : { piece: { ...i.piece!, x: 0, y: 0 } });

/** A fresh one of a thing (from a supply), under a new id. */
const freshOf = (i: BagItem, id: string): BagItem => (i.card ? { card: { ...i.card, iid: id } } : { piece: { ...i.piece!, id } });

const setBag = (t: SandboxTable, bagId: string, changes: Partial<TablePiece>): SandboxTable => ({
  ...t,
  pieces: (t.pieces ?? []).map((p) => (p.id === bagId ? { ...p, cards: undefined, ...changes } : p)),
});

/** The bag under a table point, if any (for things dropped onto it), but not one being moved itself. */
export const bagAt = (t: SandboxTable, x: number, y: number, except: string[] = []) =>
  [...(t.pieces ?? [])].reverse().find((p) => p.kind === 'bag' && !except.includes(p.id) && onPiece(p, x, y)) ?? null;

/** Whether things can go into a bag: anything, unless it's a supply, which takes back only what it supplies. */
export const bagTakes = (bag: TablePiece, items: BagItem[]) => !bag.supply || items.every((i) => itemLook(i) === itemLook(bag.supply!));

/**
 * Things put into a bag: on top of what's in it; or (`asSupply`) making it an endless supply of the first of
 * them. Into a supply, they just go (back into it). The caller takes them off the table.
 */
export function putInBag(t: SandboxTable, bagId: string, items: BagItem[], asSupply = false): SandboxTable {
  const bag = t.pieces?.find((p) => p.id === bagId);
  if (!bag || !items.length || bag.supply) return t;
  if (asSupply) return setBag(t, bagId, { items: [], supply: bagged(items[0]) });
  return setBag(t, bagId, { items: [...bagItems(bag), ...items.map(bagged)] });
}

/**
 * The top thing out of a bag (from a supply, a fresh one, called `id`): the table without it, and it. Null if
 * there's nothing.
 */
export function takeFromBag(t: SandboxTable, bagId: string, id: string): { table: SandboxTable; item: BagItem } | null {
  const bag = t.pieces?.find((p) => p.id === bagId);
  if (!bag) return null;
  if (bag.supply) return { table: t, item: freshOf(bag.supply, id) };
  const items = bagItems(bag);
  if (!items.length) return null;
  return { table: setBag(t, bagId, { items: items.slice(0, -1) }), item: items[items.length - 1] };
}

/** A bag's things in a new order, at random. */
export function shuffleBag(t: SandboxTable, bagId: string, random: () => number = Math.random): SandboxTable {
  const bag = t.pieces?.find((p) => p.id === bagId);
  return bag ? setBag(t, bagId, { items: shuffled(bagItems(bag), random) }) : t;
}

/** Things moved within a bag, as its search shows them (top first), as reorderStack does a stack's cards. */
export function reorderBag(t: SandboxTable, bagId: string, picked: number[], to: number): SandboxTable {
  const bag = t.pieces?.find((p) => p.id === bagId);
  if (!bag) return t;
  const topFirst = [...bagItems(bag)].reverse();
  const moving = picked.map((i) => topFirst[i]).filter((x): x is BagItem => !!x);
  const rest = topFirst.filter((x) => !moving.includes(x));
  const at = Math.max(0, Math.min(rest.length, to));
  return setBag(t, bagId, { items: [...rest.slice(0, at), ...moving, ...rest.slice(at)].reverse() });
}

/** Where things taken out of a bag are laid: just to its right. */
const besideBag = (bag: TablePiece) => ({ x: bag.x + pieceSizeOf(bag).w / 2 + CARD_W * 0.7, y: bag.y });

/**
 * A thing out of a bag put on the table at a point: a card as a new stack there (onto one already lying just
 * there), a piece where it's put (a die moved off any other).
 */
export function placeItem(t: SandboxTable, item: BagItem, at: { x: number; y: number }, stackId: string): SandboxTable {
  if (item.card) {
    const there = t.stacks.find((s) => Math.hypot(s.x - at.x, s.y - at.y) < 1);
    return putOnTable(t, [item.card], { ...at, angle: 0 }, stackId, there);
  }
  const piece = { ...item.piece!, x: Math.round(at.x), y: Math.round(at.y) };
  // Custom art comes out over every card.
  return separateDice(piece.kind === 'art' ? raiseArt(addPiece(t, piece), [piece.id]) : addPiece(t, piece), [piece.id]);
}

/** The top thing out of a bag, laid beside it (a card face up or down). The table as it was if there's nothing. */
export function drawFromBag(t: SandboxTable, bagId: string, id: string, faceUp?: boolean): SandboxTable {
  const bag = t.pieces?.find((p) => p.id === bagId);
  const out = takeFromBag(t, bagId, id);
  if (!bag || !out) return t;
  const item = out.item.card && faceUp !== undefined ? { card: { ...out.item.card, faceUp } } : out.item;
  return placeItem(out.table, item, besideBag(bag), id);
}

/**
 * Everything in a bag laid out beside it: its cards in one stack (in the bag's order), its pieces in rows below
 * that. Not a supply's (there's no end to it).
 */
export function emptyBag(t: SandboxTable, bagId: string, ids: () => string): SandboxTable {
  const bag = t.pieces?.find((p) => p.id === bagId);
  const items = bag && !bag.supply ? bagItems(bag) : [];
  if (!bag || !items.length) return t;
  const at = besideBag(bag);
  let table = setBag(t, bagId, { items: [] });
  const cards = items.flatMap((i) => (i.card ? [i.card] : []));
  if (cards.length) table = putOnTable(table, cards, { ...at, angle: 0 }, ids());
  const pieces = items.flatMap((i) => (i.piece ? [i.piece] : []));
  const step = Math.max(...pieces.map((p) => pieceSizeOf(p).w), 0) + DICE_SPACE * 4;
  const cols = Math.max(1, Math.ceil(Math.sqrt(pieces.length)));
  pieces.forEach((p, i) => {
    const spot = { x: at.x + CARD_W + (i % cols) * step, y: at.y - step / 2 + Math.floor(i / cols) * step };
    table = addPiece(table, { ...p, x: Math.round(spot.x), y: Math.round(spot.y) });
  });
  return separateDice(raiseArt(table, pieces.map((p) => p.id)), pieces.map((p) => p.id));
}

/** Things taken out of a bag (by their keys: see itemKey). */
export function removeBagItems(t: SandboxTable, bagId: string, keys: string[]): SandboxTable {
  const bag = t.pieces?.find((p) => p.id === bagId);
  return bag ? setBag(t, bagId, { items: bagItems(bag).filter((i) => !keys.includes(itemKey(i))) }) : t;
}

/** Where things taken out of a bag go: beside it. */
export const besideBagOf = (bag: TablePiece) => besideBag(bag);

/** A supply made an ordinary (empty) bag again. */
export const endSupply = (t: SandboxTable, bagId: string) => setBag(t, bagId, { supply: undefined });
/** Which of a track's spaces a table point is over (0 the first), within its spaces. */
export function trackSpaceAt(p: TablePiece, x: number, y: number): number {
  const k = p.scale ?? 1;
  const spaces = p.spaces ?? 10;
  // Along it: across (left to right), or down (top to bottom) if it stands up; numbered the other way if reversed.
  const along = p.vertical ? y - p.y : x - p.x;
  const start = -(trackSize(spaces).w * k) / 2 + TRACK_END * k;
  const place = Math.min(spaces - 1, Math.max(0, Math.floor((along - start) / (TRACK_SPACE * k))));
  return p.reversed ? spaces - 1 - place : place;
}

// ---- Copy and paste ----

/** What's been copied off a table: stacks and pieces, as they were (where they lay, too, to keep their layout). */
export interface TableClip {
  stacks: SandboxStack[];
  pieces: TablePiece[];
}

/** Stacks and pieces copied, as they are. */
export const copyItems = (t: SandboxTable, stackIds: string[], pieceIds: string[]): TableClip => ({
  stacks: t.stacks.filter((s) => stackIds.includes(s.id)),
  pieces: (t.pieces ?? []).filter((p) => pieceIds.includes(p.id)),
});

/** How many cards a copy holds (stacks' and bags'), against the table's limit. */
export const clipCards = (clip: TableClip) =>
  clip.stacks.reduce((n, s) => n + s.cards.length, 0) + clip.pieces.reduce((n, p) => n + bagItems(p).filter((i) => i.card).length, 0);

/**
 * A copy put on a table, its middle at a point, laid out as it was: every stack, card and piece new (new ids),
 * stacks and art over everything, dice off any others. Gives the table, and the new stacks' and pieces' ids.
 */
export function pasteItems(t: SandboxTable, clip: TableClip, at: { x: number; y: number }, ids: () => string) {
  const xs = [...clip.stacks.map((s) => s.x), ...clip.pieces.map((p) => p.x)];
  const ys = [...clip.stacks.map((s) => s.y), ...clip.pieces.map((p) => p.y)];
  if (!xs.length) return { table: t, stackIds: [] as string[], pieceIds: [] as string[] };
  const mid = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
  const place = (x: number, y: number) => ({
    x: Math.round(Math.min(TABLE_W, Math.max(0, x - mid.x + at.x))),
    y: Math.round(Math.min(TABLE_H, Math.max(0, y - mid.y + at.y))),
  });
  const fresh = (c: SandboxCard): SandboxCard => ({ ...c, iid: ids() });
  const stacks = clip.stacks.map((s) => ({ ...s, ...place(s.x, s.y), id: ids(), cards: s.cards.map(fresh) }));
  const freshItem = (i: BagItem): BagItem => (i.card ? { card: fresh(i.card) } : { piece: { ...i.piece!, id: ids() } });
  const pieces = clip.pieces.map((p) => ({
    ...p,
    ...place(p.x, p.y),
    id: ids(),
    // A bag's things are new ones too; a timer starts again, stopped.
    ...(p.items ? { items: p.items.map(freshItem) } : {}),
    ...(p.supply ? { supply: freshItem(p.supply) } : {}),
    ...(p.kind === 'timer' ? { endsAt: undefined, left: undefined } : {}),
  }));
  const pieceIds = pieces.map((p) => p.id);
  let table: SandboxTable = { ...t, stacks: [...t.stacks, ...stacks], pieces: [...(t.pieces ?? []), ...pieces] };
  table = separateDice(raiseArt(table, pieceIds), pieceIds);
  return { table, stackIds: stacks.map((s) => s.id), pieceIds };
}

/** What a piece is called (in a menu's title, or a search). */
export function pieceName(p: TablePiece): string {
  if (p.kind === 'die') return `d${p.sides ?? 6}`;
  if (p.kind === 'meeple') return PIECE_SHAPES.find((s) => s.shape === (p.shape ?? 'meeple'))?.name ?? 'Piece';
  if (p.label) return p.label;
  return p.kind[0].toUpperCase() + p.kind.slice(1);
}

// ---- Custom art's layer among the cards ----

/** Where custom art lies among the stacks: the index of the stack it's just over (-1 under them all). */
export const artLevel = (t: SandboxTable, art: TablePiece) => (art.over ? t.stacks.findIndex((s) => s.id === art.over) : -1);

/** Custom art turned (by degrees clockwise), as a stack is; locked art stays as it is. */
export const turnArt = (t: SandboxTable, ids: string[], by: number): SandboxTable => ({
  ...t,
  pieces: (t.pieces ?? []).map((p) => (p.kind === 'art' && !p.locked && ids.includes(p.id) ? { ...p, angle: normalizeAngle((p.angle ?? 0) + by) } : p)),
});

/** Custom art brought over every card (as a stack moved is). */
export const raiseArt = (t: SandboxTable, ids: string[]): SandboxTable => {
  const top = t.stacks[t.stacks.length - 1]?.id;
  return { ...t, pieces: (t.pieces ?? []).map((p) => (p.kind === 'art' && ids.includes(p.id) ? { ...p, over: top } : p)) };
};

/**
 * Custom art whose stack has gone (taken up, put into another, off the table) keeps its place: over the nearest
 * stack that was under it before and is still there (or under every card, if none). `prev` is the table before.
 */
export function keepArtLevels(prev: SandboxTable, next: SandboxTable): SandboxTable {
  const here = new Set(next.stacks.map((s) => s.id));
  if (!(next.pieces ?? []).some((p) => p.kind === 'art' && p.over && !here.has(p.over))) return next;
  const pieces = next.pieces!.map((p) => {
    if (p.kind !== 'art' || !p.over || here.has(p.over)) return p;
    let k = prev.stacks.findIndex((s) => s.id === p.over);
    while (k >= 0 && !here.has(prev.stacks[k].id)) k--;
    return { ...p, over: k >= 0 ? prev.stacks[k].id : undefined };
  });
  return { ...next, pieces };
}

/** Whether a stack and custom art overlap on the table (roughly: their boxes). */
function artOverlaps(art: TablePiece, s: SandboxStack, size: CardSize): boolean {
  const a = pieceSizeOf(art);
  const corners = stackCorners(s, size);
  const xs = corners.map((c) => c.x);
  const ys = corners.map((c) => c.y);
  return Math.min(...xs) < art.x + a.w / 2 && Math.max(...xs) > art.x - a.w / 2 && Math.min(...ys) < art.y + a.h / 2 && Math.max(...ys) > art.y - a.h / 2;
}

/**
 * Custom art moved among the cards' layers, as a stack is (see moveLayer): to the back (under every card), the
 * front (over every card), or down or up past the nearest stack it overlaps.
 */
export function layerArt(t: SandboxTable, id: string, to: 'back' | 'down' | 'up' | 'front', size: CardSize): SandboxTable {
  const art = t.pieces?.find((p) => p.id === id && p.kind === 'art');
  if (!art) return t;
  const level = artLevel(t, art);
  let over: string | undefined;
  if (to === 'back') over = undefined;
  else if (to === 'front') over = t.stacks[t.stacks.length - 1]?.id;
  else if (to === 'down') {
    // Under the nearest stack it's over that it overlaps.
    let k = level;
    while (k >= 0 && !artOverlaps(art, t.stacks[k], size)) k--;
    if (k < 0) return t;
    over = k > 0 ? t.stacks[k - 1].id : undefined;
  } else {
    // Over the nearest stack above it that it overlaps.
    let k = level + 1;
    while (k < t.stacks.length && !artOverlaps(art, t.stacks[k], size)) k++;
    if (k >= t.stacks.length) return t;
    over = t.stacks[k].id;
  }
  return over === art.over ? t : setPiece(t, id, { over });
}

/** Takes a piece off the table. */
export const removePiece = (t: SandboxTable, id: string): SandboxTable => ({ ...t, pieces: (t.pieces ?? []).filter((p) => p.id !== id) });

/** A die's roll: any of its faces, each as likely. */
export const rollDie = (sides: number, random: () => number = Math.random) => 1 + Math.min(sides - 1, Math.floor(random() * sides));

/** How far a thrown die tumbles across the table (table units), and how near the table's edge it can end up. */
export const THROW_MIN = 30;
export const THROW_MAX = 70;
const THROW_EDGE = 40;

/**
 * Throws dice: each lands on a new face a little way off, in its own random direction (kept on the table). Gives
 * the table as they land, and where each set off from relative to where it landed (for it to tumble across).
 */
export function throwDice(t: SandboxTable, ids: string[], random: () => number = Math.random) {
  let table = t;
  // Coins flip and spinners spin, where they lie.
  for (const p of (t.pieces ?? []).filter((q) => ids.includes(q.id))) {
    if (p.kind === 'coin') table = setPiece(table, p.id, { value: random() < 0.5 ? 1 : 2 });
    if (p.kind === 'spinner') table = setPiece(table, p.id, { value: Math.floor(random() * 360) });
  }
  const dice = (t.pieces ?? []).filter((p) => p.kind === 'die' && ids.includes(p.id));
  for (const d of dice) {
    // One that rolls in place stays where it is; the rest go a little way off.
    if (d.rollInPlace) {
      table = setPiece(table, d.id, { value: rollDie(d.sides ?? 6, random) });
      continue;
    }
    const a = random() * Math.PI * 2;
    const dist = THROW_MIN + random() * (THROW_MAX - THROW_MIN);
    const x = Math.round(Math.min(TABLE_W - THROW_EDGE, Math.max(THROW_EDGE, d.x + Math.cos(a) * dist)));
    const y = Math.round(Math.min(TABLE_H - THROW_EDGE, Math.max(THROW_EDGE, d.y + Math.sin(a) * dist)));
    table = setPiece(table, d.id, { value: rollDie(d.sides ?? 6, random), x, y });
  }
  // None lands on another (those rolling in place stay put; the others come to rest beside them).
  table = separateDice(
    table,
    dice.filter((d) => !d.rollInPlace).map((d) => d.id),
  );
  const from: Record<string, { dx: number; dy: number }> = {};
  for (const p of (t.pieces ?? []).filter((q) => ids.includes(q.id) && rollable(q))) {
    const now = table.pieces!.find((q) => q.id === p.id)!;
    from[p.id] = { dx: now.x - p.x, dy: now.y - p.y };
  }
  return { table, from };
}

/** The room kept between dice that lie side by side (table units). */
export const DICE_SPACE = 4;

/**
 * Dice moved apart so none lies on another: each die among `movable` that overlaps another die is pushed off it
 * the shortest way (side to side or up and down), and two movable ones that overlap are each pushed half way.
 * Dice not among them stay where they are. Kept on the table.
 */
export function separateDice(t: SandboxTable, movable: string[]): SandboxTable {
  const pieces = t.pieces ?? [];
  const dice = pieces.filter((p) => p.kind === 'die');
  const can = new Set(movable.filter((id) => dice.some((d) => d.id === id)));
  if (!can.size || dice.length < 2) return t;
  const at = new Map(dice.map((d) => [d.id, { x: d.x, y: d.y }]));
  for (let pass = 0; pass < 12; pass++) {
    let moved = false;
    for (let i = 0; i < dice.length; i++) {
      for (let j = i + 1; j < dice.length; j++) {
        const a = dice[i];
        const b = dice[j];
        const ma = can.has(a.id);
        const mb = can.has(b.id);
        if (!ma && !mb) continue;
        const pa = at.get(a.id)!;
        const pb = at.get(b.id)!;
        const need = (pieceSizeOf(a).w + pieceSizeOf(b).w) / 2 + DICE_SPACE;
        const dx = pa.x - pb.x;
        const dy = pa.y - pb.y;
        const ox = need - Math.abs(dx);
        const oy = need - Math.abs(dy);
        if (ox <= 0 || oy <= 0) continue;
        // The shortest way out; one lying exactly on another goes right.
        const push = ox < oy ? { x: (dx < 0 ? -1 : 1) * ox, y: 0 } : { x: 0, y: (dy < 0 ? -1 : 1) * oy };
        const share = ma && mb ? 0.5 : 1;
        if (ma) at.set(a.id, { x: pa.x + push.x * share, y: pa.y + push.y * share });
        if (mb) at.set(b.id, { x: pb.x - push.x * share, y: pb.y - push.y * share });
        moved = true;
      }
    }
    if (!moved) break;
  }
  let changed = false;
  const next = pieces.map((p) => {
    const q = at.get(p.id);
    if (!q || !can.has(p.id)) return p;
    const x = Math.round(Math.min(TABLE_W - THROW_EDGE, Math.max(THROW_EDGE, q.x)));
    const y = Math.round(Math.min(TABLE_H - THROW_EDGE, Math.max(THROW_EDGE, q.y)));
    if (x === p.x && y === p.y) return p;
    changed = true;
    return { ...p, x, y };
  });
  return changed ? { ...t, pieces: next } : t;
}

/** Moves pieces by the same amount each (a group dragged together), on top of the others. Dice end up apart. */
export function movePieces(t: SandboxTable, ids: string[], by: { x: number; y: number }): SandboxTable {
  const pieces = t.pieces ?? [];
  // Locked ones stay put.
  const moving = pieces.filter((p) => ids.includes(p.id) && !p.locked).map((p) => ({ ...p, x: Math.round(p.x + by.x), y: Math.round(p.y + by.y) }));
  ids = moving.map((p) => p.id);
  if (!moving.length) return t;
  return separateDice({ ...t, pieces: [...pieces.filter((p) => !ids.includes(p.id)), ...moving] }, ids);
}

/**
 * Dice lined up in a tight grid (rows of as many as make it near square), in the order they lay (top to bottom,
 * left to right), round where they were on the whole. Other dice in the way move aside.
 */
export function gridDice(t: SandboxTable, ids: string[]): SandboxTable {
  const dice = (t.pieces ?? []).filter((p) => p.kind === 'die' && ids.includes(p.id));
  if (dice.length < 2) return t;
  const cell = Math.max(...dice.map((d) => pieceSizeOf(d).w)) + DICE_SPACE;
  const cols = Math.ceil(Math.sqrt(dice.length));
  const rows = Math.ceil(dice.length / cols);
  const mid = { x: dice.reduce((s, d) => s + d.x, 0) / dice.length, y: dice.reduce((s, d) => s + d.y, 0) / dice.length };
  // Read in rows: those within half a die of each other's height count as one row.
  const order = [...dice].sort((a, b) => (Math.abs(a.y - b.y) < cell / 2 ? a.x - b.x : a.y - b.y));
  const placed = new Map(
    order.map((d, i) => [
      d.id,
      {
        x: Math.round(mid.x + ((i % cols) - (cols - 1) / 2) * cell),
        y: Math.round(mid.y + (Math.floor(i / cols) - (rows - 1) / 2) * cell),
      },
    ]),
  );
  const pieces = (t.pieces ?? []).map((p) => (placed.has(p.id) ? { ...p, ...placed.get(p.id)! } : p));
  const others = pieces.filter((p) => p.kind === 'die' && !placed.has(p.id)).map((p) => p.id);
  return separateDice({ ...t, pieces }, others);
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
    const { w, h } = cardSizeOf(s.cards[s.cards.length - 1], size);
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
  | { kind: 'hand'; hand: number; iid: string }
  /** A card out of a bag (one from a supply isn't in it: there's nothing to take). */
  | { kind: 'bag'; bagId: string; iid: string };

/** The cards a source holds (bottom first), without taking them. */
export function cardsOf(t: SandboxTable, src: Source): SandboxCard[] {
  if (src.kind === 'hand') return t.hands[src.hand].filter((c) => c.iid === src.iid);
  if (src.kind === 'bag') {
    const bag = t.pieces?.find((p) => p.id === src.bagId);
    return bag ? bagItems(bag).flatMap((i) => (i.card?.iid === src.iid ? [i.card] : [])) : [];
  }
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
  if (src.kind === 'bag') {
    const bag = t.pieces?.find((p) => p.id === src.bagId);
    return bag ? setBag(t, src.bagId, { items: bagItems(bag).filter((i) => i.card?.iid !== src.iid) }) : t;
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
  const { w, h } = cardSizeOf(s.cards[s.cards.length - 1], size);
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
  // Every card, and every other thing on the table (each piece's corners, turned as it lies).
  const pieceCorners = (t.pieces ?? []).flatMap((p) => {
    const { w, h } = pieceSizeOf(p);
    const r = ((p.angle ?? 0) * Math.PI) / 180;
    return [
      [-w / 2, -h / 2],
      [w / 2, -h / 2],
      [w / 2, h / 2],
      [-w / 2, h / 2],
    ].map(([x, y]) => ({ x: p.x + x * Math.cos(r) - y * Math.sin(r), y: p.y + x * Math.sin(r) + y * Math.cos(r) }));
  });
  const points = [...t.stacks.flatMap((s) => stackCorners(s, size)), ...pieceCorners];
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

/** The most cards a table holds (on it, in hands and in its trash): more would make it slow to move around. */
export const MAX_TABLE_CARDS = 1000;

/** How many cards a table holds: on it, in its hands and in its trash. */
export function tableCardCount(t: SandboxTable): number {
  const inBags = (t.pieces ?? []).reduce((n, p) => n + bagItems(p).filter((i) => i.card).length, 0);
  return t.stacks.reduce((n, s) => n + s.cards.length, 0) + t.hands.reduce((n, h) => n + h.length, 0) + (t.trash?.length ?? 0) + inBags;
}

/** How far apart the decks a new table starts with are laid: room for a big card with a gap. */
const START_SPACING = 4 * GRID_STEP;

/**
 * A new table's decks, each in a shuffled, face-down stack, in a row across the middle of the table (where a new
 * table's camera looks) in the order given, on the grid.
 */
export function layDecks(t: SandboxTable, decks: Deck[], ids: () => string, random: () => number = Math.random): SandboxTable {
  const left = TABLE_W / 2 - ((decks.length - 1) * START_SPACING) / 2;
  return decks.reduce((tb, deck, i) => {
    const x = Math.round((left + i * START_SPACING) / GRID_STEP) * GRID_STEP;
    return addDeck(tb, deck, { x, y: TABLE_H / 2 }, ids, random);
  }, t);
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
 * The Playground example: every component laid out as a little board game, to try them all (without Pro, too:
 * see isPlayground). Along the top a track, with two players' pieces at its start; across the middle a zone, a bag
 * of cubes, an endless supply of discs and a score counter; along the bottom dice, a coin, a spinner, a timer and
 * the first-player marker; and a line of words saying how to begin. Its only cards are the Playing Cards
 * example's (shuffled, face down, by the zone, as a discard pile): never a deck of someone's own, which would
 * make it a table of their game with every component on it (see deckLook).
 */
export function playground(t: SandboxTable, deck: Deck | undefined, ids: () => string, random: () => number = Math.random): SandboxTable {
  const cx = TABLE_W / 2;
  const cy = TABLE_H / 2;
  const at = (dx: number, dy: number) => ({ x: cx + dx, y: cy + dy });
  const piece = (kind: PieceKind, dx: number, dy: number, more: Partial<TablePiece> = {}): TablePiece => ({ ...newPiece(kind, ids(), at(dx, dy)), ...more });
  const cube = (color: string) => ({ piece: { ...newPiece('meeple', ids(), { x: 0, y: 0 }, 6, 'cube'), color } });
  const cubes = ids();
  const discs = ids();
  let table: SandboxTable = {
    ...t,
    pieces: [
      piece('zone', -180, -40, { label: 'Discard', look: 'dashed', w: 150, h: 200 }),
      piece('text', 0, -330, { label: 'Playground', scale: 1.5 }),
      piece('track', 0, -240, { spaces: 10, first: 1 }),
      piece('meeple', -300, -240, { color: PIECE_COLORS.Red }),
      piece('meeple', -350, -240, { shape: 'pawn', color: PIECE_COLORS.Blue }),
      { ...piece('bag', 20, -40), id: cubes },
      { ...piece('bag', 130, -40, { color: PIECE_COLORS.Black }), id: discs },
      piece('counter', 300, -40, { label: 'Score' }),
      piece('die', -330, 170, { value: 3 }),
      piece('die', -255, 170, { value: 5 }),
      piece('die', -170, 170, { sides: 20, value: 20 }),
      piece('coin', -80, 170),
      piece('spinner', 40, 170),
      piece('timer', 180, 170),
      piece('marker', 300, 170),
      piece('text', 0, 300, { label: 'Tap, hold or drag anything to try it.' }),
    ],
  };
  table = putInBag(table, cubes, [PIECE_COLORS.Red, PIECE_COLORS.Blue, PIECE_COLORS.Green, PIECE_COLORS.Yellow, PIECE_COLORS.Red, PIECE_COLORS.Blue].map(cube));
  table = putInBag(table, discs, [{ piece: { ...newPiece('meeple', ids(), { x: 0, y: 0 }, 6, 'disc'), color: PIECE_COLORS.Gold } }], true);
  if (deck?.cards.length) {
    const cards = shuffled(
      deck.cards.flatMap((c) => Array.from({ length: c.copies ?? 1 }, () => ({ iid: ids(), deckId: deck.id, cardId: c.id, faceUp: false }))),
      random,
    );
    table = { ...table, stacks: [{ id: ids(), x: cx - 330, y: cy - 40, angle: 0, cards }] };
  }
  // In view: all of it, with a little room round.
  return { ...table, focus: { x: cx - 440, y: cy - 390, w: 880, h: 740 } };
}

/** The table with only the cards that pass keep (on the table, in the hands and in the trash; empty stacks go). */
export function keepCards(t: SandboxTable, keep: (c: SandboxCard) => boolean): SandboxTable {
  const stacks = t.stacks.map((s) => ({ ...s, cards: s.cards.filter(keep) })).filter((s) => s.cards.length);
  return { ...t, stacks, hands: t.hands.map((h) => h.filter(keep)), trash: (t.trash ?? []).filter(keep) };
}

/**
 * Brings some of a deck's cards onto the table: the ones chosen (every copy of each), in the deck's order, in one
 * face-up stack at (x, y) (chosen, they're meant to be seen). `ids` makes unique ids for the stack and its cards.
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
    .flatMap((c) => Array.from({ length: c.copies ?? 1 }, () => ({ iid: ids(), deckId: deck.id, cardId: c.id, faceUp: true, single: true })));
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
  // Cards in bags too.
  const keepItem = (i: BagItem) => !i.card || keep(i.card);
  const pieces = t.pieces?.map((p) => {
    const items = bagItems(p);
    const supplyGone = p.supply && !keepItem(p.supply);
    return items.every(keepItem) && !supplyGone ? p : { ...p, cards: undefined, items: items.filter(keepItem), ...(supplyGone ? { supply: undefined } : {}) };
  });
  const same =
    stacks.length === t.stacks.length &&
    stacks.every((s, i) => s.cards.length === t.stacks[i].cards.length) &&
    hands.every((h, i) => h.length === t.hands[i].length) &&
    trash.length === (t.trash ?? []).length &&
    (pieces ?? []).every((p, i) => p === t.pieces![i]);
  return same ? t : { ...t, stacks, hands, ...(t.trash ? { trash } : {}), ...(pieces ? { pieces } : {}) };
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