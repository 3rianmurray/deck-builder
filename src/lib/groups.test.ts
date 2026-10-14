/// <reference types="node" />
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildRows, dropDeck, dropGroup } from './groups.ts';
import type { DeckGroup, Placed } from './groups.ts';

const groups: DeckGroup[] = [
  { id: 'zombicide', name: 'Zombicide' },
  { id: 'other', name: 'Other' },
];
const decks: Placed[] = [
  { id: 'loose' },
  { id: 'spawn', groupId: 'zombicide' },
  { id: 'items', groupId: 'zombicide' },
  { id: 'misc', groupId: 'other' },
];
const ids = (rows: { kind: string; id: string }[]) => rows.map((r) => (r.kind === 'group' ? `[${r.id}]` : r.id));

test('rows list ungrouped decks first, then each group with its decks', () => {
  assert.deepEqual(ids(buildRows(decks, groups)), ['loose', '[zombicide]', 'spawn', 'items', '[other]', 'misc']);
});

test('collapsed groups show only their header', () => {
  const folded = [{ ...groups[0], collapsed: true }, groups[1]];
  assert.deepEqual(ids(buildRows(decks, folded)), ['loose', '[zombicide]', '[other]', 'misc']);
});

test('dropping a deck under a header moves it into that group', () => {
  // Rows: loose, [zombicide], spawn, items, [other], misc. Drop "loose" just after [other].
  const { order, groupOf } = dropDeck(decks, groups, 'loose', 5);
  assert.deepEqual(order, ['spawn', 'items', 'loose', 'misc']);
  assert.equal(groupOf.loose, 'other');
  assert.equal(groupOf.spawn, 'zombicide');
});

test('dropping a deck above every header takes it out of its group', () => {
  const { order, groupOf } = dropDeck(decks, groups, 'misc', 0);
  assert.deepEqual(order, ['misc', 'loose', 'spawn', 'items']);
  assert.equal(groupOf.misc, undefined);
});

test('reordering within a group keeps the group', () => {
  const { order, groupOf } = dropDeck(decks, groups, 'items', 2);
  assert.deepEqual(order, ['loose', 'items', 'spawn', 'misc']);
  assert.equal(groupOf.items, 'zombicide');
});

test('decks hidden in a collapsed group keep their place', () => {
  const folded = [{ ...groups[0], collapsed: true }, groups[1]];
  // Rows: loose, [zombicide], [other], misc. Drop "misc" just after [zombicide].
  const { order, groupOf } = dropDeck(decks, folded, 'misc', 2);
  assert.deepEqual(order, ['loose', 'spawn', 'items', 'misc']);
  assert.equal(groupOf.misc, 'zombicide');
  assert.equal(groupOf.spawn, 'zombicide');
});

test('dragging a header moves the whole group', () => {
  // Drop [other] before [zombicide] (row 1).
  assert.deepEqual(
    dropGroup(decks, groups, 'other', 1).map((g) => g.id),
    ['other', 'zombicide'],
  );
  // Drop [zombicide] at the very end.
  assert.deepEqual(
    dropGroup(decks, groups, 'zombicide', 6).map((g) => g.id),
    ['other', 'zombicide'],
  );
});
