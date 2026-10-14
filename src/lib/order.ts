/** A copy of `items` with the item at `from` moved so it ends up at index `to`. Out-of-range indexes are clamped. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (from < 0 || from >= items.length) return items;
  const target = Math.max(0, Math.min(items.length - 1, to));
  if (target === from) return items;
  const out = items.slice();
  const [item] = out.splice(from, 1);
  out.splice(target, 0, item);
  return out;
}

/**
 * A copy of `items` with the picked items (by index, in the order they were picked) taken out and put back
 * together as a block starting at index `to`. With one item this is the same as {@link moveItem}.
 */
export function moveItems<T>(items: T[], picked: number[], to: number): T[] {
  const pickedSet = new Set(picked.filter((i) => i >= 0 && i < items.length));
  if (pickedSet.size === 0) return items;
  const block = [...pickedSet].map((i) => items[i]);
  const rest = items.filter((_, i) => !pickedSet.has(i));
  const at = Math.max(0, Math.min(rest.length, to));
  return [...rest.slice(0, at), ...block, ...rest.slice(at)];
}

/** The slot of a grid at a point, or null if the point isn't over one of the `count` items (e.g. in a gap). */
export function gridHit(x: number, y: number, grid: { columns: number; cellW: number; cellH: number; gap: number; count: number }): number | null {
  if (x < 0 || y < 0) return null;
  const col = Math.floor(x / grid.cellW);
  const row = Math.floor(y / grid.cellH);
  const inGap = x - col * grid.cellW > grid.cellW - grid.gap || y - row * grid.cellH > grid.cellH - grid.gap;
  const index = row * grid.columns + col;
  return col < grid.columns && !inGap && index < grid.count ? index : null;
}

/**
 * Which slot of a grid a point falls in, for dropping a dragged item. Positions are relative to the grid's
 * top-left; `cellW`/`cellH` include the gap after each cell. Points past the last item land on the last slot.
 */
export function gridSlot(x: number, y: number, grid: { columns: number; cellW: number; cellH: number; count: number }): number {
  const col = Math.max(0, Math.min(grid.columns - 1, Math.floor(x / grid.cellW)));
  const row = Math.max(0, Math.floor(y / grid.cellH));
  return Math.max(0, Math.min(grid.count - 1, row * grid.columns + col));
}
