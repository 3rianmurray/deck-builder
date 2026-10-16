import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DeckFileError, deckFileName, extOf, packDecks, unpackDecks } from './deckFile.ts';
import type { Deck } from './types.ts';

const deck = (over: Partial<Deck> = {}): Deck => ({
  id: 'd1',
  name: 'Monsters',
  backImage: 'decks/d1/back.png',
  cards: [
    { id: 'c1', name: 'Goblin', image: 'decks/d1/a.jpg', copies: 3 },
    { id: 'c2', name: 'Troll', image: 'decks/d1/b.jpeg' },
    // Sharing a picture with the first card (as older decks can).
    { id: 'c3', name: 'Goblin chief', image: 'decks/d1/a.jpg' },
  ],
  cardShape: { kind: 'usMini' },
  playMode: 'reveal',
  createdAt: 1,
  updatedAt: 2,
  ...over,
});

const read = (path: string) => `data-of-${path}`;

test('a deck survives being packed into a file and read back', () => {
  const [back] = unpackDecks(JSON.stringify(packDecks([deck()], read)));
  assert.equal(back.name, 'Monsters');
  assert.deepEqual(back.cardShape, { kind: 'usMini' });
  assert.equal(back.playMode, 'reveal');
  assert.deepEqual(back.back, { ext: 'png', data: 'data-of-decks/d1/back.png' });
  assert.deepEqual(
    back.cards.map((c) => [c.name, c.copies, c.image.ext, c.image.data]),
    [
      ['Goblin', 3, 'jpg', 'data-of-decks/d1/a.jpg'],
      ['Troll', undefined, 'jpeg', 'data-of-decks/d1/b.jpeg'],
      ['Goblin chief', undefined, 'jpg', 'data-of-decks/d1/a.jpg'],
    ],
  );
});

test('a picture used by several cards is kept once in the file', () => {
  const reads: string[] = [];
  const file = packDecks([deck()], (p) => (reads.push(p), read(p)));
  assert.equal(Object.keys(file.images).length, 3);
  assert.deepEqual(reads.sort(), ['decks/d1/a.jpg', 'decks/d1/b.jpeg', 'decks/d1/back.png']);
});

test('several decks go in one file, and a deck without a back keeps the built-in one', () => {
  const file = packDecks([deck(), deck({ id: 'd2', name: 'Loot', backImage: null })], read);
  const decks = unpackDecks(JSON.stringify(file));
  assert.deepEqual(
    decks.map((d) => d.name),
    ['Monsters', 'Loot'],
  );
  assert.equal(decks[1].back, null);
});

test("files that aren't deck files, or are damaged or too new, are turned away with a reason", () => {
  assert.throws(() => unpackDecks('not json'), DeckFileError);
  assert.throws(() => unpackDecks('{"hello":1}'), /isn't a Shufflevale deck/);
  const file = packDecks([deck()], read);
  assert.throws(() => unpackDecks(JSON.stringify({ ...file, version: 99 })), /newer version/);
  assert.throws(() => unpackDecks(JSON.stringify({ ...file, images: {} })), /pictures are missing/);
  assert.throws(() => unpackDecks(JSON.stringify({ ...file, decks: [] })), /no decks/);
});

test('deck files are named after the deck, safely', () => {
  assert.equal(deckFileName([{ name: 'Monsters: Vol/2' }]), 'Monsters Vol 2.shufflevale.json');
  assert.equal(deckFileName([{ name: 'A' }, { name: 'B' }]), 'Shufflevale decks.shufflevale.json');
  assert.equal(extOf('decks/x/1.PNG'), 'png');
  assert.equal(extOf('decks/x/noext'), 'jpg');
});
