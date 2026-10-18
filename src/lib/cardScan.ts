// Finding a card in a photo and straightening it out: where its four corners are (an educated guess, for the
// player to adjust), and the perspective transform that maps them onto a flat card of the deck's shape. Pure
// maths on a small decoded copy of the photo, so it can be tested without a phone.
//
// Finding the card: the background's color is taken from the photo's edges, everything that differs enough
// from it is the card's side of the line, and the biggest such region is the card. Its outline is cut down to
// four corners, then each side is fitted with a straight line through the outline's points along it (leaving
// out the ends, where corners are rounded), and the corners put where those lines meet, as on a card with
// square corners.

import type { Pixels } from './sheetGuess';

export interface Point {
  x: number;
  y: number;
}
/** A card's corners, clockwise from top left: top left, top right, bottom right, bottom left. */
export type Quad = [Point, Point, Point, Point];

/** Corners a little in from the photo's own, as a starting point when no card can be found. */
export function insetQuad(width: number, height: number, inset = 0.12): Quad {
  const x0 = width * inset;
  const y0 = height * inset;
  const x1 = width - x0;
  const y1 = height - y0;
  return [
    { x: x0, y: y0 },
    { x: x1, y: y0 },
    { x: x1, y: y1 },
    { x: x0, y: y1 },
  ];
}

/** Puts four corners in order: clockwise, starting with the one nearest the top left. */
export function orderCorners(points: Point[]): Quad {
  const cx = points.reduce((s, p) => s + p.x, 0) / points.length;
  const cy = points.reduce((s, p) => s + p.y, 0) / points.length;
  const around = [...points].sort((a, b) => Math.atan2(a.y - cy, a.x - cx) - Math.atan2(b.y - cy, b.x - cx));
  // Clockwise on screen (y down) from the left: the top-left one is the one with the smallest x + y.
  const start = around.reduce((best, p, i) => (p.x + p.y < around[best].x + around[best].y ? i : best), 0);
  return [0, 1, 2, 3].map((k) => around[(start + k) % 4]) as Quad;
}

/** The corners turned a quarter turn (clockwise) as the card's top: for a card photographed the other way round. */
export const turnCorners = (q: Quad): Quad => [q[3], q[0], q[1], q[2]];

const length = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

/** The card's size as photographed: average widths (top and bottom) and heights (left and right). */
export function quadSize(q: Quad) {
  return { w: (length(q[0], q[1]) + length(q[3], q[2])) / 2, h: (length(q[0], q[3]) + length(q[1], q[2])) / 2 };
}

/**
 * Turns the corners so the card stands the way the deck's cards do (portrait or landscape): a portrait card
 * photographed sideways gets a quarter turn.
 */
export function uprightCorners(q: Quad, cardRatio: number): Quad {
  const { w, h } = quadSize(q);
  return (w > h) !== (cardRatio > 1) ? turnCorners(q) : q;
}

/**
 * The perspective transform taking each of `from`'s corners to the matching one of `to`, as nine numbers row by
 * row: x' = (m0·x + m1·y + m2) / (m6·x + m7·y + m8), y' = (m3·x + m4·y + m5) / (same).
 */
export function homography(from: Quad, to: Quad): number[] {
  // Eight equations (two per corner) in the eight unknowns m0..m7, with m8 = 1, solved by Gaussian elimination.
  const a: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    a.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let col = 0; col < 8; col++) {
    let pivot = col;
    for (let r = col + 1; r < 8; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    [a[col], a[pivot]] = [a[pivot], a[col]];
    for (let r = 0; r < 8; r++) {
      if (r === col) continue;
      const k = a[r][col] / a[col][col];
      for (let c = col; c < 9; c++) a[r][c] -= k * a[col][c];
    }
  }
  return [...a.map((row, i) => row[8] / row[i]), 1];
}

/** Where a point goes under a perspective transform (see `homography`). */
export function mapPoint(m: number[], p: Point): Point {
  const w = m[6] * p.x + m[7] * p.y + m[8];
  return { x: (m[0] * p.x + m[1] * p.y + m[2]) / w, y: (m[3] * p.x + m[4] * p.y + m[5]) / w };
}

/** The tallest a straightened card is saved, as for cropped ones. */
const MAX_HEIGHT = 1400;

/**
 * How big the straightened card comes out: the deck's card shape, about as many pixels as the card had in the
 * photo (so it isn't blown up from a distant shot), up to the usual card size.
 */
export function outputSize(q: Quad, cardRatio: number): { width: number; height: number } {
  const { w, h } = quadSize(q);
  const height = Math.max(1, Math.round(Math.min(MAX_HEIGHT, Math.max(h, w / cardRatio))));
  return { width: Math.max(1, Math.round(height * cardRatio)), height };
}

// ---- Finding the card ----

/** How far a pixel's color must be from the background's to count as card (at least). */
const MIN_DIFFERENCE = 28;
/** The found card must cover between these fractions of the photo to be believed. */
const MIN_AREA = 0.04;
const MAX_AREA = 0.97;

/** The background's color: the middle value of each channel round the photo's edges. */
function backgroundColor({ width, height, data }: Pixels): [number, number, number] {
  const band = Math.max(2, Math.round(Math.min(width, height) * 0.03));
  const ch: number[][] = [[], [], []];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (x >= band && x < width - band && y >= band && y < height - band) continue;
      const i = (y * width + x) * 4;
      ch[0].push(data[i]);
      ch[1].push(data[i + 1]);
      ch[2].push(data[i + 2]);
    }
  }
  return ch.map((v) => v.sort((a, b) => a - b)[v.length >> 1]) as [number, number, number];
}

/** A threshold splitting values into two groups as cleanly as possible (Otsu's method), over 0–`max`. */
function otsu(values: Float32Array, max: number): number {
  const bins = 256;
  const hist = new Array(bins).fill(0);
  for (const v of values) hist[Math.min(bins - 1, Math.floor((v / max) * bins))]++;
  const total = values.length;
  let sumAll = 0;
  for (let i = 0; i < bins; i++) sumAll += i * hist[i];
  let sumB = 0;
  let weightB = 0;
  let best = 0;
  let bestVar = -1;
  for (let i = 0; i < bins; i++) {
    weightB += hist[i];
    if (!weightB || weightB === total) continue;
    sumB += i * hist[i];
    const mB = sumB / weightB;
    const mF = (sumAll - sumB) / (total - weightB);
    const between = weightB * (total - weightB) * (mB - mF) ** 2;
    if (between > bestVar) {
      bestVar = between;
      best = i;
    }
  }
  return ((best + 0.5) / bins) * max;
}

/** The pixels of the largest connected region in a mask (4-connected), as a mask, and its size. */
function largestRegion(mask: Uint8Array, width: number, height: number): { region: Uint8Array; size: number } {
  const label = new Int32Array(width * height);
  const stack = new Int32Array(width * height);
  let best = 0;
  let bestSize = 0;
  let next = 0;
  for (let start = 0; start < mask.length; start++) {
    if (!mask[start] || label[start]) continue;
    next++;
    let size = 0;
    let top = 0;
    stack[top++] = start;
    label[start] = next;
    while (top) {
      const i = stack[--top];
      size++;
      const x = i % width;
      const neighbors = [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, i - width, i + width];
      for (const n of neighbors) {
        if (n < 0 || n >= mask.length || !mask[n] || label[n]) continue;
        label[n] = next;
        stack[top++] = n;
      }
    }
    if (size > bestSize) {
      bestSize = size;
      best = next;
    }
  }
  const region = new Uint8Array(width * height);
  for (let i = 0; i < region.length; i++) region[i] = label[i] === best && best ? 1 : 0;
  return { region, size: bestSize };
}

/** The region's outline: its leftmost and rightmost pixel in every row, and topmost and bottommost in every column. */
function outline(region: Uint8Array, width: number, height: number): Point[] {
  const pts: Point[] = [];
  for (let y = 0; y < height; y++) {
    let first = -1;
    let last = -1;
    for (let x = 0; x < width; x++) {
      if (!region[y * width + x]) continue;
      if (first < 0) first = x;
      last = x;
    }
    if (first >= 0) pts.push({ x: first, y }, { x: last, y });
  }
  for (let x = 0; x < width; x++) {
    let first = -1;
    let last = -1;
    for (let y = 0; y < height; y++) {
      if (!region[y * width + x]) continue;
      if (first < 0) first = y;
      last = y;
    }
    if (first >= 0) pts.push({ x, y: first }, { x, y: last });
  }
  return pts;
}

/** The convex hull of some points, clockwise on screen (Andrew's monotone chain). */
function hull(points: Point[]): Point[] {
  const p = [...points].sort((a, b) => a.x - b.x || a.y - b.y);
  if (p.length < 3) return p;
  const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  const lower: Point[] = [];
  for (const q of p) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], q) <= 0) lower.pop();
    lower.push(q);
  }
  const upper: Point[] = [];
  for (const q of [...p].reverse()) {
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
    upper.push(q);
  }
  return [...lower.slice(0, -1), ...upper.slice(0, -1)];
}

/** Cuts a polygon down to four corners, each time dropping the corner whose removal loses the least area. */
function toFourCorners(poly: Point[]): Point[] {
  const pts = [...poly];
  const area = (a: Point, b: Point, c: Point) => Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
  while (pts.length > 4) {
    let drop = 0;
    let least = Infinity;
    for (let i = 0; i < pts.length; i++) {
      const lost = area(pts[(i - 1 + pts.length) % pts.length], pts[i], pts[(i + 1) % pts.length]);
      if (lost < least) {
        least = lost;
        drop = i;
      }
    }
    pts.splice(drop, 1);
  }
  return pts;
}

/** The straight line best through some points (by their spread), as a point on it and its direction. */
function fitLine(points: Point[]): { at: Point; dir: Point } {
  const n = points.length;
  const mx = points.reduce((s, p) => s + p.x, 0) / n;
  const my = points.reduce((s, p) => s + p.y, 0) / n;
  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const p of points) {
    sxx += (p.x - mx) ** 2;
    syy += (p.y - my) ** 2;
    sxy += (p.x - mx) * (p.y - my);
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  return { at: { x: mx, y: my }, dir: { x: Math.cos(angle), y: Math.sin(angle) } };
}

/** Where two lines cross, or null if they're (nearly) parallel. */
function cross(a: { at: Point; dir: Point }, b: { at: Point; dir: Point }): Point | null {
  const d = a.dir.x * b.dir.y - a.dir.y * b.dir.x;
  if (Math.abs(d) < 1e-6) return null;
  const t = ((b.at.x - a.at.x) * b.dir.y - (b.at.y - a.at.y) * b.dir.x) / d;
  return { x: a.at.x + t * a.dir.x, y: a.at.y + t * a.dir.y };
}

/** Distance from a point to a segment, and how far along it (0 at `a`, 1 at `b`) the nearest point is. */
function toSegment(p: Point, a: Point, b: Point) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)));
  return { distance: Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy)), along: t };
}

/**
 * Sharpens rough corners: fits a line to each side through the outline points along it (but not near its
 * ends, where the card's corners are rounded) and puts the corners where neighboring lines meet.
 */
function refineCorners(q: Quad, pts: Point[]): Quad {
  // Wide enough to take in a side that bows out past the rough corners (which sit where the rounding starts).
  const reach = Math.max(3, Math.min(quadSize(q).w, quadSize(q).h) * 0.1);
  const lines = q.map((a, i) => {
    const b = q[(i + 1) % 4];
    const near = pts.filter((p) => {
      const s = toSegment(p, a, b);
      return s.distance <= reach && s.along > 0.15 && s.along < 0.85;
    });
    return near.length >= 6 ? fitLine(near) : null;
  });
  const out = q.map((corner, i) => {
    const before = lines[(i + 3) % 4];
    const after = lines[i];
    const met = before && after ? cross(before, after) : null;
    // Only trusted if it lands near the rough corner.
    return met && length(met, corner) < reach * 2 ? met : corner;
  });
  return out as Quad;
}

/** Whether four corners in order make a convex shape (as a card seen in perspective does). */
function isConvex(q: Quad): boolean {
  let sign = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    const c = q[(i + 2) % 4];
    const z = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
    if (Math.abs(z) < 1e-9) return false;
    if (sign && Math.sign(z) !== sign) return false;
    sign = Math.sign(z);
  }
  return true;
}

/**
 * Looks for a card in a (small) photo: its corners, in the photo's pixels, and whether it was found. When it
 * wasn't, the corners are a rectangle a little in from the photo's edges, for the player to drag into place.
 */
export function findCard(img: Pixels): { corners: Quad; found: boolean } {
  const { width, height, data } = img;
  const fallback = { corners: insetQuad(width, height), found: false };
  const bg = backgroundColor(img);
  const diff = new Float32Array(width * height);
  for (let i = 0; i < diff.length; i++) {
    diff[i] = Math.hypot(data[i * 4] - bg[0], data[i * 4 + 1] - bg[1], data[i * 4 + 2] - bg[2]);
  }
  const threshold = Math.max(MIN_DIFFERENCE, otsu(diff, 442));
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < mask.length; i++) mask[i] = diff[i] > threshold ? 1 : 0;
  const { region, size } = largestRegion(mask, width, height);
  if (size < width * height * MIN_AREA || size > width * height * MAX_AREA) return fallback;
  const pts = outline(region, width, height);
  const rough = toFourCorners(hull(pts));
  if (rough.length !== 4) return fallback;
  const corners = refineCorners(orderCorners(rough), pts);
  if (!isConvex(corners)) return fallback;
  // Corners may sit a little past the photo's edge (a card cut off by it); kept just inside.
  const clamp = (p: Point) => ({ x: Math.min(width, Math.max(0, p.x)), y: Math.min(height, Math.max(0, p.y)) });
  return { corners: corners.map(clamp) as Quad, found: true };
}
