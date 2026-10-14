import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { newId } from './id';
import {
  deleteDeckFiles,
  deleteImage,
  importImage,
  loadDecks,
  loadSessions,
  loadSettings,
  loadTables,
  saveDecks,
  saveSessions,
  saveSettings,
  saveTables,
} from './storage';
import { moveItems } from './order';
import { createTable, pruneTable } from './table';
import type { Card, CardShape, Deck, PlayMode, Session, Settings, TableLook, TableState } from './types';

interface DecksApi {
  decks: Deck[];
  getDeck: (id: string) => Deck | undefined;
  createDeck: (name: string) => Deck;
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
  setCardShape: (deckId: string, shape: CardShape) => void;
  /**
   * Returns the saved table for a deck, creating a freshly shuffled one if needed. Each session keeps its own
   * table for each of its decks, separate from playing the deck on its own (no `sessionId`).
   */
  getTable: (deckId: string, sessionId?: string) => TableState | undefined;
  setTable: (deckId: string, sessionId: string | undefined, table: TableState) => void;
  settings: Settings;
  setTableLook: (look: TableLook) => void;
  sessions: Session[];
  getSession: (id: string) => Session | undefined;
  createSession: (name: string, deckIds: string[]) => Session;
  updateSession: (id: string, changes: Pick<Session, 'name' | 'deckIds'>) => void;
  deleteSession: (id: string) => void;
}

const DecksContext = createContext<DecksApi | null>(null);

/** Saved tables are keyed by deck id when played alone (as before sessions existed), or `sessionId:deckId`. */
function tableKey(deckId: string, sessionId?: string): string {
  return sessionId ? `${sessionId}:${deckId}` : deckId;
}

function withoutTables(all: Record<string, TableState>, drop: (key: string) => boolean): Record<string, TableState> {
  return Object.fromEntries(Object.entries(all).filter(([key]) => !drop(key)));
}

export function DecksProvider({ children }: { children: ReactNode }) {
  const [decks, setDecks] = useState<Deck[]>(() => loadDecks());
  const [tables, setTables] = useState<Record<string, TableState>>(() => loadTables());
  const [sessions, setSessions] = useState<Session[]>(() => loadSessions());
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) saveDecks(decks);
  }, [decks]);
  useEffect(() => {
    if (loaded.current) saveTables(tables);
  }, [tables]);
  useEffect(() => {
    if (loaded.current) saveSessions(sessions);
  }, [sessions]);
  useEffect(() => {
    if (loaded.current) saveSettings(settings);
  }, [settings]);
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
      renameDeck(id, name) {
        updateDeck(id, (d) => ({ ...d, name }));
      },
      deleteDeck(id) {
        setDecks((all) => all.filter((d) => d.id !== id));
        setTables((all) => withoutTables(all, (key) => key === id || key.endsWith(`:${id}`)));
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
      setCardShape(deckId, cardShape) {
        updateDeck(deckId, (d) => ({ ...d, cardShape }));
      },
      getTable(deckId, sessionId) {
        const deck = getDeck(deckId);
        if (!deck) return undefined;
        const saved = tables[tableKey(deckId, sessionId)];
        return saved ? pruneTable(saved, deck) : createTable(deck);
      },
      setTable(deckId, sessionId, table) {
        setTables((all) => ({ ...all, [tableKey(deckId, sessionId)]: table }));
      },
      settings,
      setTableLook(tableLook) {
        setSettings((s) => ({ ...s, tableLook }));
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
        // A deck taken out of the session loses its game there, so adding it back later starts fresh.
        setTables((all) =>
          withoutTables(all, (key) => key.startsWith(`${id}:`) && !changes.deckIds.some((d) => key === tableKey(d, id))),
        );
      },
      deleteSession(id) {
        setSessions((all) => all.filter((s) => s.id !== id));
        setTables((all) => withoutTables(all, (key) => key.startsWith(`${id}:`)));
      },
    };
  }, [decks, tables, sessions, settings, updateDeck]);

  return <DecksContext.Provider value={api}>{children}</DecksContext.Provider>;
}

export function useDecks(): DecksApi {
  const ctx = useContext(DecksContext);
  if (!ctx) throw new Error('useDecks must be used inside DecksProvider');
  return ctx;
}
