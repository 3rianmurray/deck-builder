import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { AppState } from 'react-native';

import { newId } from './id';
import {
  deleteDeckFiles,
  deleteImage,
  imageUri,
  importImage,
  loadDecks,
  loadGroups,
  loadSessions,
  loadTables,
  saveDecks,
  saveGroups,
  saveSessions,
  saveTables,
} from './storage';
import type { DeckGroup } from './groups';
import { moveItems } from './order';
import { createTable, pruneTable } from './table';
import type { Card, CardShape, Deck, PlayMode, Session, TableState } from './types';

interface DecksApi {
  decks: Deck[];
  getDeck: (id: string) => Deck | undefined;
  createDeck: (name: string) => Deck;
  /** Copies a deck, art and all, placing the copy right after it. Returns the copy. */
  duplicateDeck: (id: string) => Deck | undefined;
  renameDeck: (id: string, name: string) => void;
  deleteDeck: (id: string) => void;
  addCards: (deckId: string, imageUris: string[]) => void;
  setCopies: (deckId: string, cardId: string, copies: number) => void;
  renameCard: (deckId: string, cardId: string, name: string) => void;
  removeCard: (deckId: string, cardId: string) => void;
  /** Moves cards (indexes, in the order picked) together as a block to start at index `to` in the deck's order. */
  reorderCards: (deckId: string, picked: number[], to: number) => void;
  /** Swaps a card's art for a new image (e.g. the old art rotated), deleting the old file if nothing else uses it. */
  replaceCardImage: (deckId: string, cardId: string, imageUri: string) => void;
  setCardBack: (deckId: string, imageUri: string | null) => void;
  setPlayMode: (deckId: string, mode: PlayMode) => void;
  setHandFolded: (deckId: string, folded: boolean) => void;
  setCardShape: (deckId: string, shape: CardShape) => void;
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
        const deck: Deck = { id: newId(), name, backImage: null, cards: [], createdAt: now, updatedAt: now };
        setDecks((all) => [deck, ...all]);
        return deck;
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
          cards: original.cards.map((c) => ({ ...c, id: newId(), image: copyImage(c.image) })),
          backImage: original.backImage ? copyImage(original.backImage) : null,
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
      addCards(deckId, uris) {
        const deck = getDeck(deckId);
        if (!deck) return;
        const start = deck.cards.length;
        const cards: Card[] = uris.map((uri, i) => ({
          id: newId(),
          name: `Card ${start + i + 1}`,
          image: importImage(deckId, uri),
        }));
        updateDeck(deckId, (d) => ({ ...d, cards: [...d.cards, ...cards] }));
      },
      setCopies(deckId, cardId, copies) {
        updateDeck(deckId, (d) => ({
          ...d,
          cards: d.cards.map((c) => (c.id === cardId ? { ...c, copies: Math.max(1, Math.floor(copies)) } : c)),
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
        updateDeck(deckId, (d) => ({ ...d, cards: d.cards.filter((c) => c.id !== cardId) }));
      },
      reorderCards(deckId, picked, to) {
        updateDeck(deckId, (d) => ({ ...d, cards: moveItems(d.cards, picked, to) }));
      },
      replaceCardImage(deckId, cardId, uri) {
        const deck = getDeck(deckId);
        const card = deck?.cards.find((c) => c.id === cardId);
        if (!deck || !card) return;
        const image = importImage(deckId, uri);
        const stillUsed =
          deck.backImage === card.image || deck.cards.some((c) => c.id !== cardId && c.image === card.image);
        if (!stillUsed) deleteImage(card.image);
        updateDeck(deckId, (d) => ({ ...d, cards: d.cards.map((c) => (c.id === cardId ? { ...c, image } : c)) }));
      },
      setCardBack(deckId, uri) {
        const deck = getDeck(deckId);
        if (!deck) return;
        if (deck.backImage && !deck.cards.some((c) => c.image === deck.backImage)) deleteImage(deck.backImage);
        const backImage = uri ? importImage(deckId, uri) : null;
        updateDeck(deckId, (d) => ({ ...d, backImage }));
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
