// Ordering decks on the home screen: decks can sit in named groups, shown as a single list of rows (a header
// per group, followed by its decks). Dragging a row to a new spot in that list is turned back into a deck
// order and group membership here.

/** A named set of decks on the home screen. */
export interface DeckGroup {
  id: string;
  name: string;
  /** Collapsed groups show just their header. */
  collapsed?: boolean;
}

/** The bits of a deck that matter for ordering. */
export interface Placed {
  id: string;
  groupId?: string;
}

/** One line of the home screen's deck list. */
export type Row = { kind: 'deck'; id: string } | { kind: 'group'; id: string };

const inGroup = (d: Placed, groups: DeckGroup[]) => !!d.groupId && groups.some((g) => g.id === d.groupId);

/**
 * The deck list as rows: ungrouped decks first, then each group's header followed by its decks (unless the
 * group is collapsed). Decks keep their relative order throughout.
 */
export function buildRows(decks: Placed[], groups: DeckGroup[]): Row[] {
  const rows: Row[] = decks.filter((d) => !inGroup(d, groups)).map((d) => ({ kind: 'deck', id: d.id }));
  for (const g of groups) {
    rows.push({ kind: 'group', id: g.id });
    if (!g.collapsed) {
      for (const d of decks) if (d.groupId === g.id) rows.push({ kind: 'deck', id: d.id });
    }
  }
  return rows;
}

/** `rows` with the row at `from` taken out and put back so it lands before the row that was at `at`. */
function moveRow(rows: Row[], from: number, at: number): Row[] {
  const row = rows[from];
  const rest = rows.filter((_, i) => i !== from);
  const insert = Math.max(0, Math.min(rest.length, at > from ? at - 1 : at));
  return [...rest.slice(0, insert), row, ...rest.slice(insert)];
}

/**
 * Drops a deck at insertion point `at` (0 is before the first row, `rows.length` after the last) of the
 * list {@link buildRows} makes. It joins the group whose header is above it, or none if it lands above
 * every header. Returns the new order of all decks and which group each is in; decks hidden in collapsed
 * groups keep their place and group.
 */
export function dropDeck(
  decks: Placed[],
  groups: DeckGroup[],
  deckId: string,
  at: number,
): { order: string[]; groupOf: Record<string, string | undefined> } {
  const rows = buildRows(decks, groups);
  const from = rows.findIndex((r) => r.kind === 'deck' && r.id === deckId);
  const next = from === -1 ? rows : moveRow(rows, from, at);
  const order: string[] = [];
  const groupOf: Record<string, string | undefined> = {};
  let group: string | undefined;
  for (const r of next) {
    if (r.kind === 'group') {
      group = r.id;
      if (groups.find((g) => g.id === r.id)?.collapsed) {
        for (const d of decks) {
          if (d.groupId === r.id && d.id !== deckId) {
            order.push(d.id);
            groupOf[d.id] = r.id;
          }
        }
      }
    } else {
      order.push(r.id);
      groupOf[r.id] = group;
    }
  }
  return { order, groupOf };
}

/** Drops a group's header at insertion point `at` of the rows, moving the whole group. Returns the new group order. */
export function dropGroup(decks: Placed[], groups: DeckGroup[], groupId: string, at: number): DeckGroup[] {
  const rows = buildRows(decks, groups);
  const from = rows.findIndex((r) => r.kind === 'group' && r.id === groupId);
  if (from === -1) return groups;
  // The group goes after however many other groups' headers come before the drop point.
  const before = rows.slice(0, at).filter((r) => r.kind === 'group' && r.id !== groupId).length;
  const moving = groups.find((g) => g.id === groupId)!;
  const rest = groups.filter((g) => g.id !== groupId);
  return [...rest.slice(0, before), moving, ...rest.slice(before)];
}
