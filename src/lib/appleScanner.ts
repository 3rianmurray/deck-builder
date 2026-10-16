// Apple's document scanner (VisionKit), for photographing cards: it finds the card's edges in the camera view,
// takes the shot by itself, lets the player adjust the corners, and straightens the card, one card after
// another. Only in the app's own builds (TestFlight, the App Store): Expo Go doesn't have it, so there the app
// uses its own finder instead (see cardWarp.ts and CardScanModal).
import { Platform, TurboModuleRegistry } from 'react-native';

import { cropToShape, loadUpright, rotateImage } from './images';

/** Whether this copy of the app has Apple's scanner (checked without loading it, which would fail without it). */
export const appleScannerAvailable = () => Platform.OS === 'ios' && TurboModuleRegistry.get('DocumentScanner') != null;

/**
 * Opens Apple's scanner and returns the cards scanned (straightened, as files), in order, or none if the player
 * cancels. Several can be scanned in one go.
 */
export async function scanCards(): Promise<string[]> {
  // Loaded only here, once it's known to be there.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const scanner = require('react-native-document-scanner-plugin').default as {
    scanDocument: (o: { croppedImageQuality?: number }) => Promise<{ scannedImages?: string[]; status?: string }>;
  };
  const result = await scanner.scanDocument({ croppedImageQuality: 92 });
  if (result.status !== 'success') return [];
  return (result.scannedImages ?? []).map((p) => (p.startsWith('file://') ? p : `file://${p}`));
}

/**
 * Fits a scanned card to the deck's card shape (width over height): turned upright if it was scanned sideways,
 * then trimmed to exactly the shape (a real card scans close to it, so very little goes).
 */
export async function fitScan(uri: string, cardRatio: number): Promise<string> {
  let img = await loadUpright(uri);
  if (img.width > img.height !== cardRatio > 1) img = await rotateImage(img.uri, 90);
  return cropToShape(img.uri, cardRatio);
}
