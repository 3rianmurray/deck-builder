// Guessing a sprite sheet's layout from its pixels: how many columns and rows of cards it has, and how many of
// the cells hold a card. Pure maths on a (small) decoded image, so it can be tested without a phone.
//
// Three clues:
// 1. Where cards meet. Between two cards there's usually a gutter (a line of one even colour) or at least a
//    sharp change from one card's art to the next. For each possible number of columns, the lines where
//    boundaries would fall are compared with the lines halfway between them (the middles of cards). The right
//    count has strong boundaries where it expects them and none in between. Half the right count fails too,
//    since its "middles" land on real boundaries; double it puts half its boundaries mid-card.
// 2. The card shape. A grid whose cells come out the deck's card shape is likelier than one that doesn't.
// 3. Empty cells. Cells of one flat colour are unused; the cards are the cells before them.

/** A decoded image: `data` holds 4 bytes (red, green, blue, alpha) per pixel, row by row. */
export interface Pixels {
  width: number;
  height: number;
  data: Uint8Array | Uint8ClampedArray;
}

export interface SheetGuess {
  columns: number;
  rows: number;
  /** How many cells (from the first, across rows) hold a card. */
  count: number;
  /**
   * The last cell holds something after a run of empty ones, like the card back Tabletop Simulator puts in a
   * sheet's last slot. It isn't counted as a card.
   */
  backInLastCell: boolean;
  /** How sure the guess is: 'high' when the boundaries clearly show the grid, 'low' when it rests on shape alone. */
  confidence: 'high' | 'medium' | 'low';
}

/** The most columns or rows considered. */
const MAX_SIDE = 20;
/** Cells narrower than this (in the analysed image's pixels) are too small to be cards. */
const MIN_CELL_PX = 6;
/** How clearly a grid's boundaries must stand out (see `lineContrast`) to count as seen. */
const CLEAR = 1.2;
/** A cell whose middle varies less than this (0–255 brightness, standard deviation) is empty. */
const EMPTY_SPREAD = 6;
/** How far a cell's shape may stray from the card shape (as a log ratio) before it counts much against it. */
const SHAPE_TOLERANCE = 0.12;

/** Brightness of every pixel, 0–255. */
function brightness({ width, height, data }: Pixels): Float32Array {
  const out = new Float32Array(width * height);
  for (let i = 0; i < out.length; i++) out[i] = 0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2];
  return out;
}

/**
 * For each line across one direction of the image (each column, for `along` 'x'): how much it looks like a
 * boundary between cards, as a score where 0 is ordinary for this image and each 1 is a standard deviation
 * more boundary-like. A line counts if it's a sharp change from the line before, or if it's one even colour.
 */
function boundaryProfile(lum: Float32Array, width: number, height: number, along: 'x' | 'y'): Float32Array {
  const lines = along === 'x' ? width : height;
  const length = along === 'x' ? height : width;
  const at = (line: number, i: number) => (along === 'x' ? lum[i * width + line] : lum[line * width + i]);
  const change = new Float32Array(lines);
  const evenness = new Float32Array(lines);
  for (let line = 0; line < lines; line++) {
    let sum = 0;
    let sumSq = 0;
    let diff = 0;
    for (let i = 0; i < length; i++) {
      const v = at(line, i);
      sum += v;
      sumSq += v * v;
      if (line > 0) diff += Math.abs(v - at(line - 1, i));
    }
    const mean = sum / length;
    change[line] = diff / length;
    evenness[line] = -Math.sqrt(Math.max(0, sumSq / length - mean * mean));
  }
  change[0] = change[1] ?? 0;
  const z = (xs: Float32Array) => {
    let m = 0;
    for (const v of xs) m += v;
    m /= xs.length;
    let s = 0;
    for (const v of xs) s += (v - m) ** 2;
    const sd = Math.sqrt(s / xs.length) || 1;
    return xs.map((v) => (v - m) / sd);
  };
  const a = z(change);
  const b = z(evenness);
  return a.map((v, i) => Math.max(v, b[i]));
}

/** The strongest boundary score within a pixel or so of a position. */
function near(profile: Float32Array, pos: number, reach: number): number {
  let best = -Infinity;
  for (let i = Math.max(0, Math.floor(pos - reach)); i <= Math.min(profile.length - 1, Math.ceil(pos + reach)); i++) {
    best = Math.max(best, profile[i]);
  }
  return best;
}

/**
 * How well `n` cells along a profile fit it: the average boundary score where its boundaries would fall, less
 * the average halfway between them (the middles of its cells). 0 or less for one cell, which has no
 * boundaries to show.
 */
export function lineContrast(profile: Float32Array, n: number): number {
  if (n < 2) return 0;
  const step = profile.length / n;
  const reach = Math.max(1, profile.length * 0.004);
  let on = 0;
  let off = 0;
  for (let k = 1; k < n; k++) on += near(profile, k * step, reach);
  for (let k = 0; k < n; k++) off += near(profile, (k + 0.5) * step, reach);
  return on / (n - 1) - off / n;
}

/** How close a cell's shape (width over height) is to the card's, from 1 (exact) towards 0. */
function shapeFit(cell: number, card: number): number {
  const miss = Math.log(cell / card);
  // Art drawn sideways (cards played landscape) fits too, a little less readily.
  const sideways = Math.log(cell * card);
  const fit = (m: number) => Math.exp(-(m * m) / (2 * SHAPE_TOLERANCE * SHAPE_TOLERANCE));
  return Math.max(fit(miss), 0.7 * fit(sideways));
}

/** Whether a cell's middle is one flat colour (an unused cell). */
function cellIsEmpty(lum: Float32Array, width: number, x0: number, y0: number, x1: number, y1: number): boolean {
  // Its middle only, clear of any border or gutter.
  const ix = (x1 - x0) * 0.15;
  const iy = (y1 - y0) * 0.15;
  let n = 0;
  let sum = 0;
  let sumSq = 0;
  for (let y = Math.round(y0 + iy); y < Math.round(y1 - iy); y++) {
    for (let x = Math.round(x0 + ix); x < Math.round(x1 - ix); x++) {
      const v = lum[y * width + x];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  if (!n) return true;
  const mean = sum / n;
  return Math.sqrt(Math.max(0, sumSq / n - mean * mean)) < EMPTY_SPREAD;
}

/** Which of a grid's cells hold a card, and so how many cards there are (see SheetGuess). */
export function countCards(img: Pixels, columns: number, rows: number, lum = brightness(img)) {
  const filled: boolean[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const x0 = (c * img.width) / columns;
      const y0 = (r * img.height) / rows;
      filled.push(!cellIsEmpty(lum, img.width, x0, y0, x0 + img.width / columns, y0 + img.height / rows));
    }
  }
  const last = filled.lastIndexOf(true);
  const firstEmpty = filled.indexOf(false);
  // Cards, then empty cells, then something in the very last cell: that's a back, not a card.
  if (firstEmpty > 0 && last === filled.length - 1 && filled.slice(firstEmpty, last).every((f) => !f)) {
    return { count: firstEmpty, backInLastCell: true };
  }
  return { count: Math.max(1, last + 1), backInLastCell: false };
}

/**
 * An educated guess at a sprite sheet's grid, from a decoded copy of it (a few hundred pixels across is
 * plenty) and the card's shape (width over height, e.g. 5/7).
 */
export function guessSheet(img: Pixels, cardRatio: number): SheetGuess {
  const lum = brightness(img);
  const across = boundaryProfile(lum, img.width, img.height, 'x');
  const down = boundaryProfile(lum, img.width, img.height, 'y');
  const maxCols = Math.max(1, Math.min(MAX_SIDE, Math.floor(img.width / MIN_CELL_PX)));
  const maxRows = Math.max(1, Math.min(MAX_SIDE, Math.floor(img.height / MIN_CELL_PX)));
  const colScore = Array.from({ length: maxCols + 1 }, (_, n) => (n ? lineContrast(across, n) : -Infinity));
  const rowScore = Array.from({ length: maxRows + 1 }, (_, n) => (n ? lineContrast(down, n) : -Infinity));

  // Each pairing scored on both clues: its boundaries (each side's, floored so a side with none to show
  // doesn't wipe out the other) and its cells' shape. A 10 × 7 sheet, Tabletop Simulator's usual, gets a nudge.
  let best = { columns: 1, rows: 1, score: -Infinity };
  for (let c = 1; c <= maxCols; c++) {
    for (let r = 1; r <= maxRows; r++) {
      const shape = shapeFit(img.width / c / (img.height / r), cardRatio);
      const lines = (Math.max(colScore[c], 0) + 0.3) * (Math.max(rowScore[r], 0) + 0.3);
      const usual = c === 10 && r === 7 ? 1.15 : 1;
      const score = lines * (0.25 + shape) * usual;
      if (score > best.score) best = { columns: c, rows: r, score };
    }
  }
  const { columns, rows } = best;
  const seen = (score: number, n: number) => n === 1 || score >= CLEAR;
  const clear = Number(seen(colScore[columns], columns)) + Number(seen(rowScore[rows], rows));
  return {
    columns,
    rows,
    ...countCards(img, columns, rows, lum),
    confidence: clear === 2 ? 'high' : clear === 1 ? 'medium' : 'low',
  };
}
