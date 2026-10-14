import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';

/** Saved cards are scaled down to this height, which is plenty for any phone screen. */
const MAX_OUTPUT_HEIGHT = 1400;

export interface LoadedImage {
  uri: string;
  width: number;
  height: number;
}

export interface CropRect {
  originX: number;
  originY: number;
  width: number;
  height: number;
}

/**
 * Re-encodes an image so its pixels are in display orientation (camera photos often rely on EXIF rotation),
 * which keeps what the user sees and crop coordinates in agreement.
 */
export async function loadUpright(uri: string): Promise<LoadedImage> {
  const ref = await ImageManipulator.manipulate(uri).renderAsync();
  const img = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 1 });
  return { uri: img.uri, width: img.width, height: img.height };
}

/** A quarter turn: -90 is counter-clockwise (left), 90 is clockwise (right). */
export type QuarterTurn = -90 | 0 | 90;

/**
 * Crops an upright image, optionally turns the result a quarter turn (for art drawn sideways, e.g. cards
 * played horizontally), scales it down if needed, and returns the saved file's uri.
 */
export async function saveCrop(uri: string, rect: CropRect, turn: QuarterTurn = 0): Promise<string> {
  let ctx = ImageManipulator.manipulate(uri).crop(rect);
  if (turn) ctx = ctx.rotate(turn);
  const outHeight = turn ? rect.width : rect.height;
  if (outHeight > MAX_OUTPUT_HEIGHT) ctx = ctx.resize({ height: MAX_OUTPUT_HEIGHT });
  const ref = await ctx.renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  return out.uri;
}

/** Turns a whole image a quarter turn and returns the new file, keeping full quality for further editing. */
export async function rotateImage(uri: string, turn: -90 | 90): Promise<LoadedImage> {
  const ref = await ImageManipulator.manipulate(uri).rotate(turn).renderAsync();
  const img = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 1 });
  return { uri: img.uri, width: img.width, height: img.height };
}
