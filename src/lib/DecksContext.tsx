import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import { newId } from './id';
import {
  deleteDeckFiles,
  deleteImage,
  imageUri,
  importImage,
  saveImageData,
  loadDecks,
  loadGroups,
  loadSessions,
  loadTables,
  saveDecks,
  saveGroups,
  saveSessions,
  saveTables,
} from './storage';
import type { UnpackedDeck } from './deckFile';
import type { DeckGroup } from './groups';
import { moveItems } from './order';
import { createTable, pruneTable } from './table';
import { copiesOf } from './types';
import type { Card, CardShape, Deck, PlayMode, Session, TableState } from './types';

interface DecksApi {
  decks: Deck[];
  getDeck: (id: string) => Deck | undefined;
  createDeck: (name: string) => Deck;
  /** Makes a deck from ready card-shaped pictures (each its own original) and a back, at the top of the list. */
  createReadyDeck: (name: string, cards: { uri: string; name: string }[], back: string) => Deck;
  /** Copies a deck, art and all, placing the copy right after it. Returns the copy. */
  duplicateDeck: (id: string) => Deck | undefined;
  /** Adds decks read from a deck file (see deckFile.ts), pictures and all, at the top of the list. */
  importDecks: (decks: UnpackedDeck[]) => Deck[];
  renameDeck: (id: string, name: string) => void;
  deleteDeck: (id: string) => void;
  /** Empties a deck to start it again: no cards, no back, default settings, no saved tables, under a new name. */
  resetDeck: (id: string, name: string) => void;
  /**
   * Adds a card for each image, named by `names` where given (otherwise numbered). `originals` are the uncropped
   * pictures they were cut from, kept to cut them again if the card size changes.
   */
  addCards: (deckId: string, imageUris: string[], names?: string[], originals?: string[]) => void;
  setCopies: (deckId: string, cardId: string, copies: number) => void;
  renameCard: (deckId: string, cardId: string, name: string) => void;
  removeCard: (deckId: string, cardId: string) => void;
  /** Removes several cards at once, art and all. */
  removeCards: (deckId: string, cardIds: string[]) => void;
  /** Moves cards (indexes, in the order picked) together as a block to start at index `to` in the deck's order. */
  reorderCards: (deckId: string, picked: number[], to: number) => void;
  /** Swaps a card's art for a new image (e.g. the old art rotated), deleting the old file if nothing else uses it. */
  replaceCardImage: (deckId: string, cardId: string, imageUri: string, original?: string) => void;
  /**
   * Sets the card back (null for the built-in one). `original` is the uncropped picture it was cut from, kept to
   * cut it again if the card size changes; leave it out when the back is just cut again from the one kept.
   */
  setCardBack: (deckId: string, imageUri: string | null, original?: string | null) => void;
  /**
   * Gives one card its own back (null to go back to the deck's), for a card with two different sides. `original`
   * is the uncropped picture, as for `setCardBack`.
   */
  setOwnBack: (deckId: string, cardId: string, imageUri: string | null, original?: string | null) => void;
  setPlayMode: (deckId: string, mode: PlayMode) => void;
  setHandFolded: (deckId: string, folded: boolean) => void;
  setCardShape: (deckId: string, shape: CardShape) => void;
  /** How round the deck's card corners are (see cardRadius). */
  setRoundness: (deckId: string, roundness: number) => void;
  /**
   * Returns the saved table for a deck, creating a freshly shuffled one if needed. Each session keeps its own
   * table for each of its decks, separate from playing the deck on its own (no `sessionId`).
   */
  getTable: (deckId: string, sessionId?: string) => TableState | undefined;
  setTable: (deckId: string, sessionId: string | undefined, table: TableState) => void;
  sessions: Session[];
  getSession: (id: string) => Session | undefined;
  createSession: (name: string, deckIds: string[]) => Session;
  updateSession: (id: string, changes: Pick<Session, 'name' | 'deckIds'>) => void;
  deleteSession: (id: string) => void;
  /** Moves a session to another place in the list: `to` is its index once moved. */
  moveSession: (id: string, to: number) => void;
  /** Home-screen groups, in display order (see lib/groups.ts). */
  groups: DeckGroup[];
  createGroup: (name: string) => DeckGroup;
  renameGroup: (id: string, name: string) => void;
  /** Removes the group; its decks are kept and become ungrouped. */
  deleteGroup: (id: string) => void;
  toggleGroup: (id: string) => void;
  setGroupOrder: (groups: DeckGroup[]) => void;
  /** Puts the decks in this order (any not listed keep their place at the end) and files each under a group. */
  arrangeDecks: (order: string[], groupOf: Record<string, string | undefined>) => void;
}

const DecksContext = createContext<DecksApi | null>(null);

/** A changed table is saved this long after its last change, so a run of quick moves is saved once. */
const TABLE_SAVE_DELAY_MS = 400;

/** Saved tables are keyed by deck id when played alone (as before sessions existed), or `sessionId:deckId`. */
function tableKey(deckId: string, sessionId?: string): string {
  return sessionId ? `${sessionId}:${deckId}` : deckId;
}

function withoutTables(all: Record<string, TableState>, drop: (key: string) => boolean): Record<string, TableState> {
  return Object.fromEntries(Object.entries(all).filter(([key]) => !drop(key)));
}

export function DecksProvider({ children }: { children: ReactNode }) {
  const [decks, setDecks] = useState<Deck[]>(() => loadDecks());
  // Saved tables are kept outside React state: a table changes with every move, and if they were state, every
  // screen using the decks (the deck editor's grid of cards, say, still open under the table) would redraw with
  // each one. Nothing but the table itself shows them, so they're just kept here and saved soon after changing.
  const tables = useMemo(() => {
    const box: { all: Record<string, TableState>; timer?: ReturnType<typeof setTimeout> } = { all: loadTables() };
    const saveSoon = () => {
      clearTimeout(box.timer);
      box.timer = setTimeout(() => {
        box.timer = undefined;
        saveTables(box.all);
      }, TABLE_SAVE_DELAY_MS);
    };
    return {
      get: (key: string) => box.all[key],
      set: (key: string, table: TableState) => {
        Object.assign(box, { all: { ...box.all, [key]: table } });
        saveSoon();
      },
      drop: (gone: (key: string) => boolean) => {
        Object.assign(box, { all: withoutTables(box.all, gone) });
        saveSoon();
      },
      /** Saves now, if a save is waiting. */
      flush: () => {
        if (box.timer === undefined) return;
        clearTimeout(box.timer);
        box.timer = undefined;
        saveTables(box.all);
      },
    };
  }, []);
  // Leaving the app saves straight away, in case it's closed before a waiting save would have happened.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => state !== 'active' && tables.flush());
    return () => sub.remove();
  }, [tables]);
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions());
  const [groups, setGroups] = useState<DeckGroup[]>(() => loadGroups());
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) saveDecks(decks);
  }, [decks]);
  useEffect(() => {
    if (loaded.current) saveSessions(sessions);
  }, [sessions]);
  useEffect(() => {
    if (loaded.current) saveGroups(groups);
  }, [groups]);
  useEffect(() => {
    loaded.current = true;
  }, []);

  const updateDeck = useCallback((id: string, fn: (d: Deck) => Deck) => {
    setDecks((all) => all.map((d) => (d.id === id ? { ...fn(d), updatedAt: Date.now() } : d)));
  }, []);

  const api = useMemo<DecksApi>(() => {
    const getDeck = (id: string) => decks.find((d) => d.id === id);

    return {
      decks,
      getDeck,
      createDeck(name) {
        const now = Date.now();
        // New decks' card size is worked out from their first art (see CardShape).
        const deck: Deck = { id: newId(), name, cardShape: { kind: 'auto' }, backImage: null, cards: [], createdAt: now, updatedAt: now };
        setDecks((all) => [deck, ...all]);
        return deck;
      },
      createReadyDeck(name, cards, back) {
        const now = Date.now();
        const id = newId();
        // Each picture is copied in twice, as the card and as its original, as `addCards` does.
        const deck: Deck = {
          id,
          name,
          backImage: importImage(id, back),
          backOriginal: importImage(id, back),
          cards: cards.map((c) => ({ id: newId(), name: c.name, image: importImage(id, c.uri), original: importImage(id, c.uri) })),
          createdAt: now,
          updatedAt: now,
        };
        setDecks((all) => [deck, ...all]);
        return deck;
      },
      importDecks(incoming) {
        const now = Date.now();
        const added = incoming.map((u): Deck => {
          const id = newId();
          // A picture several cards share is saved once.
          const saved = new Map<string, string>();
          const save = (img: { ext: string; data: string }) => {
            if (!saved.has(img.data)) saved.set(img.data, saveImageData(id, img.ext, img.data));
            return saved.get(img.data)!;
          };
          return {
            id,
            name: u.name,
            ...(u.cardShape ? { cardShape: u.cardShape } : {}),
            ...(u.roundness !== undefined ? { roundness: u.roundness } : {}),
            ...(u.playMode ? { playMode: u.playMode } : {}),
            backImage: u.back ? save(u.back) : null,
            cards: u.cards.map((c) => ({
              id: newId(),
              name: c.name,
              ...(c.copies ? { copies: c.copies } : {}),
              image: save(c.image),
              ...(c.back ? { back: save(c.back) } : {}),
            })),
            createdAt: now,
            updatedAt: now,
          };
        });
        setDecks((all) => [...added, ...all]);
        return added;
      },
      duplicateDeck(id) {
        const original = getDeck(id);
        if (!original) return undefined;
        const now = Date.now();
        const copyId = newId();
        // The copy gets its own image files, so deleting either deck leaves the other's art alone. Cards that
        // share one image (from older app versions) keep sharing one copy of it.
        const copied = new Map<string, string>();
        const copyImage = (path: string) => {
          if (!copied.has(path)) copied.set(path, importImage(copyId, imageUri(path)));
          return copied.get(path)!;
        };
        const deck: Deck = {
          ...original,
          id: copyId,
          name: `${original.name} copy`,
          cards: original.cards.map((c) => ({
            ...c,
            id: newId(),
            image: copyImage(c.image),
            ...(c.original ? { original: copyImage(c.original) } : {}),
            ...(c.back ? { back: copyImage(c.back) } : {}),
            ...(c.backOriginal ? { backOriginal: copyImage(c.backOriginal) } : {}),
          })),
          backImage: original.backImage ? copyImage(original.backImage) : null,
          backOriginal: original.backOriginal ? copyImage(original.backOriginal) : null,
          createdAt: now,
          updatedAt: now,
        };
        // Right after the original, in the same group.
        setDecks((all) => {
          const at = all.findIndex((d) => d.id === id);
          return at === -1 ? [deck, ...all] : [...all.slice(0, at + 1), deck, ...all.slice(at + 1)];
        });
        return deck;
      },
      renameDeck(id, name) {
        updateDeck(id, (d) => ({ ...d, name }));
      },
      deleteDeck(id) {
        setDecks((all) => all.filter((d) => d.id !== id));
        tables.drop((key) => key === id || key.endsWith(`:${id}`));
        setSessions((all) => all.map((s) => ({ ...s, deckIds: s.deckIds.filter((d) => d !== id) })));
        deleteDeckFiles(id);
      },
      resetDeck(id, name) {
        tables.drop((key) => key === id || key.endsWith(`:${id}`));
        deleteDeckFiles(id);
        updateDeck(id, (d) => ({ id: d.id, name, backImage: null, cards: [], groupId: d.groupId, createdAt: d.createdAt, updatedAt: Date.now() }));
      },
      addCards(deckId, uris, names, originals) {
        const deck = getDeck(deckId);
        if (!deck) return;
        const start = deck.cards.length;
        const cards: Card[] = uris.map((uri, i) => ({
          id: newId(),
          name: names?.[i] ?? `Card ${start + i + 1}`,
          image: importImage(deckId, uri),
          ...(originals?.[i] ? { original: importImage(deckId, originals[i]) } : {}),
        }));
        updateDeck(deckId, (d) => ({ ...d, cards: [...d.cards, ...cards] }));
      },
      setCopies(deckId, cardId, copies) {
        updateDeck(deckId, (d) => ({
          ...d,
          cards: d.cards.map((c) => (c.id === cardId ? { ...c, copies: copiesOf({ copies }) } : c)),
        }));
      },
      renameCard(deckId, cardId, name) {
        updateDeck(deckId, (d) => ({
          ...d,
          cards: d.cards.map((c) => (c.id === cardId ? { ...c, name } : c)),
        }));
      },
      removeCard(deckId, cardId) {
        const deck = getDeck(deckId);
        const card = deck?.cards.find((c) => c.id === cardId);
        if (!deck || !card) return;
        // Cards duplicated by older app versions share one image file, so only delete it once nothing uses it.
        const stillUsed =
          deck.backImage === card.image || deck.cards.some((c) => c.id !== cardId && c.image === card.image);
        if (!stillUsed) deleteImage(card.image);
        if (card.original) deleteImage(card.original);
        if (card.back) deleteImage(card.back);
        if (card.backOriginal) deleteImage(card.backOriginal);
        updateDeck(deckId, (d) => ({ ...d, cards: d.cards.filter((c) => c.id !== cardId) }));
      },
      removeCards(deckId, cardIds) {
        const deck = getDeck(deckId);
        if (!deck) return;
        const gone = deck.cards.filter((c) => cardIds.includes(c.id));
        const kept = deck.cards.filter((c) => !cardIds.includes(c.id));
        // A picture still used by a card that's kept (or the deck's back) stays, as in `removeCard`.
        const used = new Set([deck.backImage, deck.backOriginal, ...kept.flatMap((c) => [c.image, c.original, c.back, c.backOriginal])]);
        const files = new Set(gone.flatMap((c) => [c.image, c.original, c.back, c.backOriginal]));
        for (const f of files) if (f && !used.has(f)) deleteImage(f);
        updateDeck(deckId, (d) => ({ ...d, cards: d.cards.filter((c) => !cardIds.includes(c.id)) }));
      },
      reorderCards(deckId, picked, to) {
        updateDeck(deckId, (d) => ({ ...d, cards: moveItems(d.cards, picked, to) }));
      },
      replaceCardImage(deckId, cardId, uri, original) {
        const deck = getDeck(deckId);
        const card = deck?.cards.find((c) => c.id === cardId);
        if (!deck || !card) return;
        const image = importImage(deckId, uri);
        const stillUsed =
          deck.backImage === card.image || deck.cards.some((c) => c.id !== cardId && c.image === card.image);
        if (!stillUsed) deleteImage(card.image);
        // A new original replaces the old one; without one, the card is just cut again from the one it has.
        const kept = original === undefined ? card.original : importImage(deckId, original);
        if (original !== undefined && card.original) deleteImage(card.original);
        updateDeck(deckId, (d) => ({
          ...d,
          cards: d.cards.map((c) => (c.id === cardId ? { ...c, image, ...(kept ? { original: kept } : {}) } : c)),
        }));
      },
      setCardBack(deckId, uri, original) {
        const deck = getDeck(deckId);
        if (!deck) return;
        const inUse = (path: string) => deck.cards.some((c) => c.image === path);
        if (deck.backImage && !inUse(deck.backImage)) deleteImage(deck.backImage);
        const backImage = uri ? importImage(deckId, uri) : null;
        // The uncropped picture: replaced when a new one is given, kept when the same one is just cut again, and
        // gone with the back.
        const replacing = original !== undefined || !uri;
        if (replacing && deck.backOriginal && !inUse(deck.backOriginal)) deleteImage(deck.backOriginal);
        const backOriginal = replacing ? (uri && original ? importImage(deckId, original) : null) : (deck.backOriginal ?? null);
        updateDeck(deckId, (d) => ({ ...d, backImage, backOriginal }));
      },
      setOwnBack(deckId, cardId, uri, original) {
        const card = getDeck(deckId)?.cards.find((c) => c.id === cardId);
        if (!card) return;
        // Its own back's files are its alone, so the old ones simply go (the original only when it's replaced).
        if (card.back) deleteImage(card.back);
        const replacing = original !== undefined || !uri;
        if (replacing && card.backOriginal) deleteImage(card.backOriginal);
        const back = uri ? importImage(deckId, uri) : undefined;
        const backOriginal = replacing ? (uri && original ? importImage(deckId, original) : undefined) : card.backOriginal;
        updateDeck(deckId, (d) => ({
          ...d,
          cards: d.cards.map((c) => {
            if (c.id !== cardId) return c;
            const { back: _b, backOriginal: _o, ...rest } = c;
            return { ...rest, ...(back ? { back } : {}), ...(back && backOriginal ? { backOriginal } : {}) };
          }),
        }));
      },
      setPlayMode(deckId, playMode) {
        updateDeck(deckId, (d) => ({ ...d, playMode }));
      },
      setHandFolded(deckId, handFolded) {
        updateDeck(deckId, (d) => ({ ...d, handFolded }));
      },
      setCardShape(deckId, cardShape) {
        updateDeck(deckId, (d) => ({ ...d, cardShape }));
      },
      setRoundness(deckId, roundness) {
        updateDeck(deckId, (d) => ({ ...d, roundness }));
      },
      getTable(deckId, sessionId) {
        const deck = getDeck(deckId);
        if (!deck) return undefined;
        const saved = tables.get(tableKey(deckId, sessionId));
        return saved ? pruneTable(saved, deck) : createTable(deck);
      },
      setTable(deckId, sessionId, table) {
        tables.set(tableKey(deckId, sessionId), table);
      },
      sessions,
      getSession: (id) => sessions.find((s) => s.id === id),
      createSession(name, deckIds) {
        const now = Date.now();
        const session: Session = { id: newId(), name, deckIds, createdAt: now, updatedAt: now };
        setSessions((all) => [session, ...all]);
        return session;
      },
      updateSession(id, changes) {
        setSessions((all) => all.map((s) => (s.id === id ? { ...s, ...changes, updatedAt: Date.now() } : s)));
        // A deck taken out of the session keeps its game there, so taking one out by mistake loses nothing:
        // adding it back picks up where it left off. (Reset table starts it fresh; deleting the session clears it.)
      },
      moveSession(id, to) {
        setSessions((all) => {
          const session = all.find((s) => s.id === id);
          if (!session) return all;
          const rest = all.filter((s) => s.id !== id);
          return [...rest.slice(0, to), session, ...rest.slice(to)];
        });
      },
      groups,
      createGroup(name) {
        const group: DeckGroup = { id: newId(), name };
        setGroups((all) => [...all, group]);
        return group;
      },
      renameGroup(id, name) {
        setGroups((all) => all.map((g) => (g.id === id ? { ...g, name } : g)));
      },
      deleteGroup(id) {
        setGroups((all) => all.filter((g) => g.id !== id));
        setDecks((all) => all.map((d) => (d.groupId === id ? { ...d, groupId: undefined } : d)));
      },
      toggleGroup(id) {
        setGroups((all) => all.map((g) => (g.id === id ? { ...g, collapsed: !g.collapsed } : g)));
      },
      setGroupOrder(next) {
        setGroups(next);
      },
      arrangeDecks(order, groupOf) {
        setDecks((all) => {
          const byId = new Map(all.map((d) => [d.id, d]));
          const placed = order.flatMap((id) => {
            const d = byId.get(id);
            return d ? [{ ...d, groupId: groupOf[id] }] : [];
          });
          const listed = new Set(order);
          return [...placed, ...all.filter((d) => !listed.has(d.id))];
        });
      },
      deleteSession(id) {
        setSessions((all) => all.filter((s) => s.id !== id));
        tables.drop((key) => key.startsWith(`${id}:`));
      },
    };
  }, [decks, tables, sessions, groups, updateDeck]);

  return <DecksContext.Provider value={api}>{children}</DecksContext.Provider>;
}

export function useDecks(): DecksApi {
  const ctx = useContext(DecksContext);
  if (!ctx) throw new Error('useDecks must be used inside DecksProvider');
  return ctx;
}
