import assert from 'node:assert/strict';
import { test } from 'node:test';

import { DeckFileError, deckFileName, extOf, imagePixels, packDecks, remapTable, unpackDecks, unpackFile } from './deckFile.ts';
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

test('nothing in a file is trusted: copies, sizes, corners, names and pictures are checked', () => {
  const file = (deck: Record<string, unknown>, images: Record<string, unknown> = { a: { ext: 'jpg', data: 'xx' } }) =>
    JSON.stringify({ kind: 'shufflevale-decks', version: 1, decks: [{ back: null, cards: [{ name: 'A', image: 'a' }], ...deck }], images });
  const [huge] = unpackDecks(file({ cards: [{ name: 'A', image: 'a', copies: 1e9 }] }));
  assert.equal(huge.cards[0].copies, 99);
  const [odd] = unpackDecks(file({ name: 'x'.repeat(500), cardShape: { kind: 'wobbly' }, roundness: 40 }));
  assert.equal(odd.name.length, 60);
  assert.equal(odd.cardShape, undefined);
  assert.equal(odd.roundness, 0.25);
  const [custom] = unpackDecks(file({ cardShape: { kind: 'custom', width: 'wide', height: 2 } }));
  assert.equal(custom.cardShape, undefined);
  const [auto] = unpackDecks(file({ cardShape: { kind: 'auto', detected: { kind: 'usMini', landscape: true } } }));
  assert.deepEqual(auto.cardShape, { kind: 'auto', detected: { kind: 'usMini', landscape: true } });
  assert.throws(() => unpackDecks(file({}, { a: { ext: 'exe', data: 'xx' } })), DeckFileError);
  assert.throws(() => unpackDecks(file({}, { a: { ext: 'png', data: 'x'.repeat(20_000_001) } })), DeckFileError);
});

test('a picture’s size is read from its header, and huge ones are turned away', async () => {
  const { readFileSync } = await import('node:fs');
  assert.deepEqual(imagePixels(readFileSync('assets/playing-cards/as.jpg').toString('base64')), { w: 500, h: 700 });
  assert.deepEqual(imagePixels(readFileSync('assets/about-icon.png').toString('base64')), { w: 336, h: 336 });
  // A PNG header claiming 20,000 pixels across.
  const png = new Uint8Array(33);
  png.set([0x89, 0x50, 0x4e, 0x47, 13, 10, 26, 10, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0x4e, 0x20, 0, 0, 1, 0]);
  const data = Buffer.from(png).toString('base64');
  assert.deepEqual(imagePixels(data), { w: 20000, h: 256 });
  const text = JSON.stringify({ kind: 'shufflevale-decks', version: 1, decks: [{ back: null, cards: [{ name: 'A', image: 'a' }] }], images: { a: { ext: 'png', data } } });
  assert.throws(() => unpackDecks(text), DeckFileError);
});

test('a table travels with its decks: packed, read back, and pointed at the decks as added', () => {
  const d = deck();
  const table = {
    id: 't1', name: 'Game Night', createdAt: 0, updatedAt: 0,
    stacks: [{ id: 's1', x: 100, y: 200, angle: 90, locked: true, cards: [{ iid: 'a', deckId: 'd1', cardId: 'c1', faceUp: true }, { iid: 'b', deckId: 'd1', cardId: 'c2', faceUp: false }] }],
    hands: [[{ iid: 'h', deckId: 'd1', cardId: 'c3', faceUp: true }], [], [], []],
    handNames: ['Ana', 'Hand 2', 'Hand 3', 'Hand 4'],
    background: 'charcoal', snapToGrid: true, gridStep: 60,
  };
  const file = JSON.stringify(packDecks([d], (p) => `data-of-${p}`, [table]));
  const read = unpackFile(file);
  assert.equal(read.tables.length, 1);
  assert.equal(read.decks[0].fileId, 'd1');
  assert.deepEqual(read.decks[0].cards.map((c) => c.fileId), ['c1', 'c2', 'c3']);
  // As the decks were added: new ids for the deck and its cards.
  const map = new Map([['d1', { id: 'D', cards: new Map([['c1', 'X'], ['c2', 'Y'], ['c3', 'Z']]) }]]);
  let n = 0;
  const t = remapTable(read.tables[0], map, () => `n${n++}`);
  assert.equal(t.name, 'Game Night');
  assert.deepEqual(t.stacks[0].cards.map((c) => [c.deckId, c.cardId, c.faceUp]), [['D', 'X', true], ['D', 'Y', false]]);
  assert.equal(t.stacks[0].locked, true);
  assert.equal(t.stacks[0].angle, 90);
  assert.deepEqual(t.hands[0].map((c) => c.cardId), ['Z']);
  assert.equal(t.handNames[0], 'Ana');
  assert.equal(t.background, 'charcoal');
  assert.equal(t.gridStep, 60);
  // Fresh ids for its stacks and cards.
  assert.ok(t.stacks[0].id.startsWith('n') && t.stacks[0].cards.every((c) => c.iid.startsWith('n')));
});

test('a table’s cards from decks not in the file are left out; files from before tables still open', () => {
  const d = deck();
  const table = { id: 't', name: 'T', createdAt: 0, updatedAt: 0, handNames: [], hands: [[], [], [], []],
    stacks: [{ id: 's', x: 0, y: 0, angle: 0, cards: [{ iid: 'a', deckId: 'elsewhere', cardId: 'q', faceUp: true }] }] };
  const read = unpackFile(JSON.stringify(packDecks([d], (p) => `data-of-${p}`, [table])));
  assert.equal(read.tables[0].stacks.length, 0);
  // An older file: no ids, no tables.
  const old = JSON.parse(JSON.stringify(packDecks([d], (p) => `data-of-${p}`)));
  delete old.decks[0].id;
  for (const c of old.decks[0].cards) delete c.id;
  assert.deepEqual(unpackFile(JSON.stringify(old)).tables, []);
  assert.equal(unpackDecks(JSON.stringify(old)).length, 1);
});
