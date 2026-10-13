import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

import { newId } from './id';
import {
  deleteDeckFiles,
  deleteImage,
  importImage,
  loadDecks,
  loadTables,
  saveDecks,
  saveTables,
} from './storage';
import { createTable, pruneTable } from './table';
import type { Card, Deck, TableState } from './types';

interface DecksApi {
  decks: Deck[];
  getDeck: (id: string) => Deck | undefined;
  createDeck: (name: string) => Deck;
  renameDeck: (id: string, name: string) => void;
  deleteDeck: (id: string) => void;
  addCards: (deckId: string, imageUris: string[]) => void;
  duplicateCard: (deckId: string, cardId: string) => void;
  renameCard: (deckId: string, cardId: string, name: string) => void;
  removeCard: (deckId: string, cardId: string) => void;
  setCardBack: (deckId: string, imageUri: string | null) => void;
  /** Returns the saved table for a deck, creating a freshly shuffled one if needed. */
  getTable: (deckId: string) => TableState | undefined;
  setTable: (deckId: string, table: TableState) => void;
}

const DecksContext = createContext<DecksApi | null>(null);

export function DecksProvider({ children }: { children: ReactNode }) {
  const [decks, setDecks] = useState<Deck[]>(() => loadDecks());
  const [tables, setTables] = useState<Record<string, TableState>>(() => loadTables());
  const loaded = useRef(false);

  useEffect(() => {
    if (loaded.current) saveDecks(decks);
  }, [decks]);
  useEffect(() => {
    if (loaded.current) saveTables(tables);
  }, [tables]);
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
        setTables(({ [id]: _, ...rest }) => rest);
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
      duplicateCard(deckId, cardId) {
        updateDeck(deckId, (d) => {
          const i = d.cards.findIndex((c) => c.id === cardId);
          if (i === -1) return d;
          const copy = { ...d.cards[i], id: newId() };
          return { ...d, cards: [...d.cards.slice(0, i + 1), copy, ...d.cards.slice(i + 1)] };
        });
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
        // Duplicated cards share one image file, so only delete it once nothing uses it.
        const stillUsed =
          deck.backImage === card.image || deck.cards.some((c) => c.id !== cardId && c.image === card.image);
        if (!stillUsed) deleteImage(card.image);
        updateDeck(deckId, (d) => ({ ...d, cards: d.cards.filter((c) => c.id !== cardId) }));
      },
      setCardBack(deckId, uri) {
        const deck = getDeck(deckId);
        if (!deck) return;
        if (deck.backImage && !deck.cards.some((c) => c.image === deck.backImage)) deleteImage(deck.backImage);
        const backImage = uri ? importImage(deckId, uri) : null;
        updateDeck(deckId, (d) => ({ ...d, backImage }));
      },
      getTable(deckId) {
        const deck = getDeck(deckId);
        if (!deck) return undefined;
        const saved = tables[deckId];
        return saved ? pruneTable(saved, deck) : createTable(deck);
      },
      setTable(deckId, table) {
        setTables((all) => ({ ...all, [deckId]: table }));
      },
    };
  }, [decks, tables, updateDeck]);

  return <DecksContext.Provider value={api}>{children}</DecksContext.Provider>;
}

export function useDecks(): DecksApi {
  const ctx = useContext(DecksContext);
  if (!ctx) throw new Error('useDecks must be used inside DecksProvider');
  return ctx;
}
