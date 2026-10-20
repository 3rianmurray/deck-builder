// Sharing and backing up Shufflevale files from a menu, saying how it went (see deckExport.ts for the files).
import { Alert } from 'react-native';

import { backUpFile, shareFile } from './deckExport';
import type { FileContents } from './deckExport';
import * as haptics from './haptics';

/** Opens the share sheet with the file (Messages, AirDrop, Mail…). */
export async function shareWithNotice(contents: FileContents) {
  try {
    await shareFile(contents);
  } catch (e) {
    Alert.alert('Couldn’t share', e instanceof Error ? e.message : String(e));
  }
}

/** Saves the file into a folder picked in Files, and says where it went. */
export async function backUpWithNotice(contents: FileContents) {
  try {
    const folder = await backUpFile(contents);
    if (!folder) return;
    haptics.success();
    Alert.alert('Backed up', `“${contents.name}” is saved in “${folder}” in the Files app.`);
  } catch (e) {
    Alert.alert('Couldn’t back up', e instanceof Error ? e.message : String(e));
  }
}
