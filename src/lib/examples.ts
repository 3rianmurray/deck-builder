// The app's own examples: a Playing Cards deck and a Solitaire table dealt from it, and the Playground (every
// component, to try), made once on first opening to show what Free Play can do, and put back as new from Help
// whenever they're wanted again (deleted or changed).
import { Alert } from 'react-native';

import { useDecks } from './DecksContext';
import * as haptics from './haptics';
import { newId } from './id';
import { playingCards } from './playingCards';
import { deckLook } from './pro';
import { newSandbox, playground, solitaire } from './sandbox';
import type { SandboxTable } from './sandbox';
import { createSandboxWith, sandboxes, updateSandbox } from './sandboxStore';
import type { Deck } from './types';
import { loadSettings, saveSettings } from './storage';

const PLAYING_CARDS = 'Playing Cards';
const SOLITAIRE = 'Solitaire';
const PLAYGROUND = 'Playground';

/**
 * The Playground, as new: laid out again in place (keeping its spot, and its name if it's been renamed), or made
 * again (and noted as the Playground), with the Playing Cards deck. Whether it was made.
 */
function restorePlayground(deck: Deck | undefined): boolean {
  const id = loadSettings().playgroundTableId;
  const table = id ? sandboxes().find((t) => t.id === id) : undefined;
  if (table) {
    updateSandbox(playground(newSandbox(table.id, table.name, table.createdAt), deck, newId));
    return false;
  }
  const made: SandboxTable = createSandboxWith(PLAYGROUND, (empty) => playground(empty, deck, newId));
  saveSettings({ ...loadSettings(), playgroundTableId: made.id, playgroundMade: true });
  return true;
}

export function useExamples() {
  const { decks, createReadyDeck, refillDeck, getDeck } = useDecks();

  /** The Playing Cards deck the app made, if it's still here (found by name, if made before it was noted). */
  const playingDeck = () => {
    const id = loadSettings().playingCardsDeckId;
    return id ? getDeck(id) : decks.find((d) => d.name === PLAYING_CARDS);
  };

  /**
   * Puts both examples back as they were first made: the Playing Cards deck (made again if it's gone, or its
   * cards, back, name and settings put back if it's been changed) and the Solitaire table, dealt afresh from it
   * (made again if it's gone). Says what it brought back, and what it reset.
   */
  const restore = async (): Promise<{ added: string[]; reset: string[] }> => {
    const added: string[] = [];
    const reset: string[] = [];
    const { cards, back } = await playingCards();
    const found = playingDeck();
    const deck = found ? refillDeck(found.id, PLAYING_CARDS, cards, back) : createReadyDeck(PLAYING_CARDS, cards, back);
    if (!deck) throw new Error('The Playing Cards deck couldn’t be found.');
    // As it's made: the Playground's cards are this deck's only while it stays so (see deckLook).
    saveSettings({ ...loadSettings(), playingCardsDeckId: deck.id, playingCardsLook: deckLook(deck) });
    (found ? reset : added).push(PLAYING_CARDS);

    // The Solitaire table: dealt again in place (keeping its spot on the home screen), or made again.
    const table = sandboxes().find((t) => t.name === SOLITAIRE);
    if (table) {
      updateSandbox(solitaire(newSandbox(table.id, SOLITAIRE, table.createdAt), deck, newId));
      reset.push(SOLITAIRE);
    } else {
      createSandboxWith(SOLITAIRE, (empty) => solitaire(empty, deck, newId));
      added.push(SOLITAIRE);
    }
    (restorePlayground(deck) ? added : reset).push(PLAYGROUND);
    return { added, reset };
  };

  /** Just the Playground, if it's never been made (for those who had the other examples before it came). */
  const addPlayground = () => {
    const s = loadSettings();
    if (s.playgroundMade) return;
    const deck = playingDeck();
    // Noted as it is now, if it never was (made before the Playground came, before there was a reason to change it).
    if (deck && !s.playingCardsLook) saveSettings({ ...loadSettings(), playingCardsLook: deckLook(deck) });
    restorePlayground(deck);
  };

  /** Asks first (changes to the examples are lost), then restores them and says so. */
  const confirmRestore = () =>
    Alert.alert(
      'Restore the examples?',
      'The Playing Cards deck and the Solitaire and Playground tables go back to how they first were. Any changes made to them are lost.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          style: 'destructive',
          onPress: () =>
            void restore().then(
              () => {
                haptics.success();
                Alert.alert('Examples restored', 'The Playing Cards deck and the Solitaire and Playground tables are on the home screen, as new.');
              },
              (e) => Alert.alert('Couldn’t restore the examples', e instanceof Error ? e.message : String(e)),
            ),
        },
      ],
    );

  return { restore, confirmRestore, addPlayground };
}
