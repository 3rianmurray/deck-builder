// Saving decks to a file and sharing it (Files, AirDrop, Messages, Mail…), and opening one to add its decks.
// The file's format is in deckFile.ts.
import * as DocumentPicker from 'expo-document-picker';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { deckFileName, packDecks, unpackDecks } from './deckFile';
import type { UnpackedDeck } from './deckFile';
import { readImageData } from './storage';
import type { Deck } from './types';

/**
 * Writes the decks to a deck file and opens the share sheet for it, to save to Files, AirDrop, send, etc.
 * Resolves once the sheet has closed.
 */
export async function shareDecks(decks: Deck[]): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this device.');
  const file = new File(Paths.cache, deckFileName(decks));
  if (file.exists) file.delete();
  file.create();
  file.write(JSON.stringify(packDecks(decks, readImageData)));
  try {
    await Sharing.shareAsync(file.uri, { UTI: 'public.json', mimeType: 'application/json', dialogTitle: 'Save or send' });
  } finally {
    // It's been copied wherever it went; the one here was only for handing over.
    if (file.exists) file.delete();
  }
}

/**
 * Asks for a deck file (from Files, iCloud Drive…) and reads its decks, or null if none was chosen. Throws a
 * DeckFileError, with a message for the player, if the file isn't a deck file.
 */
export async function pickDeckFile(): Promise<UnpackedDeck[] | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'public.json', '*/*'], copyToCacheDirectory: true });
  if (result.canceled || !result.assets[0]) return null;
  const picked = new File(result.assets[0].uri);
  try {
    return unpackDecks(await picked.text());
  } finally {
    if (picked.exists) picked.delete();
  }
}
