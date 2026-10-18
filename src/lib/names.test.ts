import assert from 'node:assert/strict';
import { test } from 'node:test';

import { titleCase } from './names.ts';

test('names are kept in title case as they are typed', () => {
  assert.equal(titleCase('zombie deck'), 'Zombie Deck');
  assert.equal(titleCase('z'), 'Z');
  assert.equal(titleCase('ace of spades'), 'Ace Of Spades');
  // Capitals already typed stay, inside words too.
  assert.equal(titleCase('McDonald UNO'), 'McDonald UNO');
  assert.equal(titleCase('hand 2 (left)'), 'Hand 2 (Left)');
  assert.equal(titleCase('spawn-cards'), 'Spawn-Cards');
  assert.equal(titleCase('élan vital'), 'Élan Vital');
  assert.equal(titleCase(''), '');
});
