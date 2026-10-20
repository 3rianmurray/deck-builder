// Shufflevale files (decks, and any tables laid out with them; the format is in deckFile.ts): shared through the
// share sheet (Messages, AirDrop, Mail…), backed up into a folder in Files, and opened to add what's in them.
import * as DocumentPicker from 'expo-document-picker';
import { Directory, File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { DeckFileError, decksOnTable, fileNameFor, packDecks, unpackFile } from './deckFile';
import type { UnpackedFile } from './deckFile';
import type { SandboxTable } from './sandbox';
import { readImageData } from './storage';
import type { Deck } from './types';

/** What goes in a file: decks, any tables (whose decks must be among them), and the file's name. */
export interface FileContents {
  name: string;
  decks: Deck[];
  tables?: SandboxTable[];
}

/** A file for one table: the table, and the decks its cards come from. */
export const tableFile = (table: SandboxTable, allDecks: Deck[]): FileContents => ({
  name: table.name,
  decks: decksOnTable(table, allDecks),
  tables: [table],
});

/** Everything: every deck and every table, named by today's date. */
export const everythingFile = (decks: Deck[], tables: SandboxTable[]): FileContents => ({
  name: `Shufflevale backup ${new Date().toISOString().slice(0, 10)}`,
  decks,
  tables,
});

const contentsOf = ({ decks, tables }: FileContents) => JSON.stringify(packDecks(decks, readImageData, tables ?? []));

/**
 * Opens the share sheet with the file, to send (Messages, AirDrop, Mail…) or save. Resolves once the sheet has
 * closed.
 */
export async function shareFile(contents: FileContents): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing isn’t available on this device.');
  const file = new File(Paths.cache, fileNameFor(contents.name));
  if (file.exists) file.delete();
  file.create();
  file.write(contentsOf(contents));
  try {
    await Sharing.shareAsync(file.uri, { UTI: 'public.json', mimeType: 'application/json', dialogTitle: 'Share' });
  } finally {
    // It's been copied wherever it went; the one here was only for handing over.
    if (file.exists) file.delete();
  }
}

/**
 * Saves the file into a folder the player picks in Files (iCloud Drive, On My iPhone…), beside anything already
 * there (numbered if the name's taken). Returns the folder's name, or null if they didn't pick one.
 */
export async function backUpFile(contents: FileContents): Promise<string | null> {
  let folder: Directory;
  try {
    folder = await Directory.pickDirectoryAsync();
  } catch {
    // Closed without picking a folder.
    return null;
  }
  const base = fileNameFor(contents.name).replace(/\.shufflevale\.json$/, '');
  let file = new File(folder, `${base}.shufflevale.json`);
  for (let n = 2; file.exists; n++) file = new File(folder, `${base} (${n}).shufflevale.json`);
  file.create();
  file.write(contentsOf(contents));
  return folder.name;
}

/** The biggest file that's opened: far more than any real deck needs. */
const MAX_FILE_BYTES = 250 * 1024 * 1024;

/**
 * Asks for a Shufflevale file (from Files, iCloud Drive…) and reads its decks and tables, or null if none was
 * chosen. Throws a DeckFileError, with a message for the player, if it isn't one.
 */
export async function pickDeckFile(): Promise<UnpackedFile | null> {
  const result = await DocumentPicker.getDocumentAsync({ type: ['application/json', 'public.json', '*/*'], copyToCacheDirectory: true });
  if (result.canceled || !result.assets[0]) return null;
  const picked = new File(result.assets[0].uri);
  try {
    // Read all at once, so a file this big could run the phone out of memory.
    if (picked.size > MAX_FILE_BYTES) throw new DeckFileError('This file is too big to open (over 250 MB).');
    return unpackFile(await picked.text());
  } finally {
    if (picked.exists) picked.delete();
  }
}
