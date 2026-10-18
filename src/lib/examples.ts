// The app's own examples: a Playing Cards deck and a Solitaire table dealt from it, made once on first opening
// to show what Free Play can do, and restored from Help whenever they're wanted again (e.g. after being deleted).
import { useDecks } from './DecksContext';
import { newId } from './id';
import { playingCards } from './playingCards';
import { solitaire } from './sandbox';
import { createSandboxWith, sandboxes } from './sandboxStore';
import { loadSettings, saveSettings } from './storage';

const SOLITAIRE = 'Solitaire';

export function useExamples() {
  const { decks, createReadyDeck, getDeck } = useDecks();

  /** The Playing Cards deck the app made, if it's still here (found by name, if made before it was noted). */
  const playingDeck = () => {
    const id = loadSettings().playingCardsDeckId;
    return id ? getDeck(id) : decks.find((d) => d.name === 'Playing Cards');
  };

  const addPlayingCards = async () => {
    const { cards, back } = await playingCards();
    const deck = createReadyDeck('Playing Cards', cards, back);
    saveSettings({ ...loadSettings(), playingCardsDeckId: deck.id });
    return deck;
  };

  /**
   * Brings back whichever examples are missing: the Playing Cards deck, and a Solitaire table (dealt afresh
   * from it). Says what it brought back (nothing, if both were still there).
   */
  const restore = async (): Promise<string[]> => {
    const restored: string[] = [];
    let deck = playingDeck();
    if (!deck) {
      deck = await addPlayingCards();
      restored.push('Playing Cards');
    }
    const used = deck.id;
    const hasTable = sandboxes().some((t) => t.name === SOLITAIRE || t.stacks.some((s) => s.cards.some((c) => c.deckId === used)));
    if (!hasTable) {
      const dealt = deck;
      createSandboxWith(SOLITAIRE, (empty) => solitaire(empty, dealt, newId));
      restored.push(SOLITAIRE);
    }
    return restored;
  };

  return { restore };
}
