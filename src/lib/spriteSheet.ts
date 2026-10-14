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

/** Pixel rectangles of the cards to cut out, in card order. Cells share edges, so none overlap or leave gaps. */
export function cellRects(width: number, height: number, grid: Grid): CropRect[] {
  const xs = (c: number) => Math.round((c * width) / grid.columns);
  const ys = (r: number) => Math.round((r * height) / grid.rows);
  return Array.from({ length: grid.count }, (_, n) => {
    const [r, c] = cellPosition(n, grid);
    return { originX: xs(c), originY: ys(r), width: xs(c + 1) - xs(c), height: ys(r + 1) - ys(r) };
  });
}
