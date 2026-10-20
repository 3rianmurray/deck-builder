// Pure grid maths for slicing a sprite sheet into cards.
import type { CropRect } from './images.ts';

/** `rows`: left to right along each row, then the next row down. `columns`: top to bottom, then the next column. */
export type SheetOrder = 'rows' | 'columns';

export interface Grid {
  rows: number;
  columns: number;
  /** How many cells hold artwork, counted from the first cell in `order`. */
  count: number;
  order: SheetOrder;
}

/** The [row, column] of the nth card (0-based). */
export function cellPosition(n: number, grid: Grid): [number, number] {
  return grid.order === 'rows'
    ? [Math.floor(n / grid.columns), n % grid.columns]
    : [n % grid.rows, Math.floor(n / grid.rows)];
}

/** The 0-based card number of a cell, or null if that cell is past `count`. */
export function cellNumber(row: number, column: number, grid: Grid): number | null {
  const n = grid.order === 'rows' ? row * grid.columns + column : column * grid.rows + row;
  return n < grid.count ? n : null;
}

/** Where each column's and row's cards lie, as shares of the sheet's width and height (see sheetEdges.ts). */
export interface CardSpans {
  columns: [number, number][];
  rows: [number, number][];
}

/** A column's (or row's) span as shares of the sheet: its card's own, if found, else its share of an even grid. */
export function span(spans: [number, number][] | undefined, i: number, n: number): [number, number] {
  return spans?.[i] ?? [i / n, (i + 1) / n];
}

/**
 * Pixel rectangles of the cards to cut out, in card order. On an even grid, cells share edges, so none overlap or
 * leave gaps; with `spans` (the cards' own edges, found inside the space between them), each is cut to its card.
 */
export function cellRects(width: number, height: number, grid: Grid, spans?: CardSpans | null): CropRect[] {
  return Array.from({ length: grid.count }, (_, n) => {
    const [r, c] = cellPosition(n, grid);
    const [x0, x1] = span(spans?.columns, c, grid.columns).map((f) => Math.round(f * width));
    const [y0, y1] = span(spans?.rows, r, grid.rows).map((f) => Math.round(f * height));
    return { originX: x0, originY: y0, width: x1 - x0, height: y1 - y0 };
  });
}
