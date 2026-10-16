import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode as decodeJpeg } from 'jpeg-js';

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

/**
 * Cuts the largest piece of the given shape (width over height) from the middle of an image, as `saveCrop`
 * does: e.g. to fit a card back to a new card size.
 */
export async function cropToShape(uri: string, ratio: number): Promise<string> {
  const ref = await ImageManipulator.manipulate(uri).renderAsync();
  const { width, height } = ref;
  const w = Math.min(width, Math.round(height * ratio));
  const h = Math.min(height, Math.round(w / ratio));
  return saveCrop(uri, { originX: Math.round((width - w) / 2), originY: Math.round((height - h) / 2), width: w, height: h });
}

/** How wide an image is made for looking at its pixels (see `smallPixels`): plenty to find a grid of cards in. */
const ANALYSIS_WIDTH = 480;

/**
 * A small copy of an image, decoded to raw pixels (4 bytes per pixel: red, green, blue, alpha), for working
 * things out from what's in it, like a sprite sheet's grid.
 */
export async function smallPixels(uri: string, width: number): Promise<{ width: number; height: number; data: Uint8Array }> {
  let ctx = ImageManipulator.manipulate(uri);
  if (width > ANALYSIS_WIDTH) ctx = ctx.resize({ width: ANALYSIS_WIDTH });
  const ref = await ctx.renderAsync();
  const small = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  const file = new File(small.uri);
  try {
    return decodeJpeg(await file.bytes(), { useTArray: true, formatAsRGBA: true });
  } finally {
    if (file.exists) file.delete();
  }
}

/** Turns a whole image a quarter turn and returns the new file, keeping full quality for further editing. */
export async function rotateImage(uri: string, turn: -90 | 90): Promise<LoadedImage> {
  const ref = await ImageManipulator.manipulate(uri).rotate(turn).renderAsync();
  const img = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 1 });
  return { uri: img.uri, width: img.width, height: img.height };
}
