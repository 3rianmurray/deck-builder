// Finding the cards' own edges in a sprite sheet with space between them (a gutter of plain background, and often
// a margin round the outside): each card is then cut inside that space, rather than with half the gutter on every
// side. Pure maths on a decoded image, so it can be tested without a phone.
import type { Pixels } from './sheetGuess';

/** Where each column's and each row's cards lie, as shares of the sheet's width and height (start, end). */
export interface SheetEdges {
  columns: [number, number][];
  rows: [number, number][];
}

/** A line across the sheet varying less than this (0–255, standard deviation per channel) is plain: background. */
const PLAIN = 7;
/** How close (0–255, per channel) a plain line's color must be to the gutter's to count as more of it. */
const SAME = 14;
/** The most of a cell trimmed from each side: past this, it's the card's own plain border, not a gutter. */
const MAX_TRIM = 0.2;
/** Trims thinner than this share of a cell are left alone: no real gap, just the grid's rounding. */
const MIN_TRIM = 0.004;

interface Line {
  plain: boolean;
  color: [number, number, number];
}

/**
 * Each line of pixels across the sheet (columns of pixels if `vertical`, else rows): whether it's one plain color
 * all the way across, and which. A gutter runs right across the sheet, so it's plain; a line through cards isn't,
 * however plain each card's own edge, unless every card it crosses (and every gutter) is that one color.
 */
function lines({ width, height, data }: Pixels, vertical: boolean): Line[] {
  const count = vertical ? width : height;
  const along = vertical ? height : width;
  return Array.from({ length: count }, (_, i) => {
    const sum = [0, 0, 0];
    const sq = [0, 0, 0];
    for (let j = 0; j < along; j++) {
      const p = 4 * (vertical ? j * width + i : i * width + j);
      for (let k = 0; k < 3; k++) {
        sum[k] += data[p + k];
        sq[k] += data[p + k] * data[p + k];
      }
    }
    const mean = sum.map((s) => s / along) as [number, number, number];
    const plain = mean.every((m, k) => Math.sqrt(Math.max(0, sq[k] / along - m * m)) < PLAIN);
    return { plain, color: mean };
  });
}

const near = (a: [number, number, number], b: [number, number, number]) => a.every((v, k) => Math.abs(v - b[k]) < SAME);

/** For each of `n` cells along a run of lines: where its card starts and ends, past any gutter at its sides. */
function spans(all: Line[], n: number): [number, number][] {
  const size = all.length;
  return Array.from({ length: n }, (_, c) => {
    const lo = Math.round((c * size) / n);
    const hi = Math.round(((c + 1) * size) / n);
    const most = Math.floor((hi - lo) * MAX_TRIM);
    // Inward from each side, over lines of the gutter's color.
    let start = lo;
    if (all[lo]?.plain) {
      const gutter = all[lo].color;
      while (start < hi && start - lo < most && all[start].plain && near(all[start].color, gutter)) start++;
    }
    let end = hi;
    if (all[hi - 1]?.plain) {
      const gutter = all[hi - 1].color;
      while (end > start && hi - end < most && all[end - 1].plain && near(all[end - 1].color, gutter)) end--;
    }
    const minimum = (hi - lo) * MIN_TRIM;
    if (start - lo < minimum) start = lo;
    if (hi - end < minimum) end = hi;
    return [start / size, end / size];
  });
}

/**
 * The cards' edges inside a sheet of `rows` by `columns`, trimmed of the plain space between and round them; or
 * null if there's none to trim (cards that meet edge to edge).
 */
export function findEdges(pixels: Pixels, rows: number, columns: number): SheetEdges | null {
  const edges = { columns: spans(lines(pixels, true), columns), rows: spans(lines(pixels, false), rows) };
  const untouched = (s: [number, number][], n: number) => s.every(([a, b], i) => a === i / n && b === (i + 1) / n);
  return untouched(edges.columns, columns) && untouched(edges.rows, rows) ? null : edges;
}
