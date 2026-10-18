import assert from 'node:assert/strict';
import { test } from 'node:test';

import { deleteDeckWarning } from './deckInUse.ts';
import { newSandbox } from './sandbox.ts';

test('deleting a deck warns about the sessions and tables using it', () => {
  const session = { id: 's', name: 'Zombies', deckIds: ['d'], createdAt: 0, updatedAt: 0 };
  const table = {
    ...newSandbox('t', 'Solitaire', 0),
    stacks: [{ id: 'x', x: 0, y: 0, angle: 0, cards: [{ iid: '1', deckId: 'd', cardId: 'c', faceUp: true }] }],
  };
  const inHand = { ...newSandbox('h', 'Poker', 0), hands: [[{ iid: '2', deckId: 'd', cardId: 'c', faceUp: true }], [], [], []] };
  const other = newSandbox('o', 'Empty', 0);
  const text = deleteDeckWarning('d', [session], [table, inHand, other]);
  assert.match(text, /session "Zombies"/);
  assert.match(text, /tables "Solitaire" and "Poker"/);
  assert.doesNotMatch(text, /Empty/);
  assert.doesNotMatch(deleteDeckWarning('d', [], [other]), /table/);
});
