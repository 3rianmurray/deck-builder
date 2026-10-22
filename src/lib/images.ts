import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { decode as decodeJpeg } from 'jpeg-js';

import { pngHasTransparency } from './pngAlpha';

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
 * Pictures with see-through parts (e.g. die-cut card shapes) are kept as PNG from the moment they're loaded, so
 * every step after (cropping, turning, keeping the original) keeps them see-through; everything else is JPEG.
 * A PNG with no see-through pixels is solid, so it's JPEG too (much smaller).
 */
const isPng = (uri: string) => /\.png(\?.*)?$/i.test(uri);
const formatOf = (uri: string) => (isPng(uri) ? SaveFormat.PNG : SaveFormat.JPEG);

/** How small a copy is looked at to tell whether a PNG has see-through parts: plenty to see clear corners. */
const ALPHA_CHECK_WIDTH = 160;

/** Whether a picture has see-through pixels (only a PNG can). */
async function hasTransparency(uri: string): Promise<boolean> {
  if (!isPng(uri)) return false;
  try {
    const ref = await ImageManipulator.manipulate(uri).resize({ width: ALPHA_CHECK_WIDTH }).renderAsync();
    const small = await ref.saveAsync({ format: SaveFormat.PNG });
    const file = new File(small.uri);
    try {
      return pngHasTransparency(await file.bytes());
    } finally {
      if (file.exists) file.delete();
    }
  } catch {
    return false;
  }
}

/**
 * Re-encodes an image so its pixels are in display orientation (camera photos often rely on EXIF rotation),
 * which keeps what the user sees and crop coordinates in agreement. See-through pictures stay PNG.
 */
export async function loadUpright(uri: string): Promise<LoadedImage> {
  const ref = await ImageManipulator.manipulate(uri).renderAsync();
  const img = await ref.saveAsync({ format: (await hasTransparency(uri)) ? SaveFormat.PNG : SaveFormat.JPEG, compress: 1 });
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
  const out = await ref.saveAsync({ format: formatOf(uri), compress: 0.85 });
  return out.uri;
}

/** How big a card's kept original is, on its longest side: plenty to cut a card from again. */
const ORIGINAL_MAX_SIDE = 1600;

/**
 * A copy of a picture to keep as the original a card was cut from (to cut it again if the card size changes),
 * shrunk to a sensible size so keeping it doesn't take much room.
 */
export async function keepOriginal(uri: string): Promise<string> {
  const size = await ImageManipulator.manipulate(uri).renderAsync();
  let ctx = ImageManipulator.manipulate(uri);
  if (Math.max(size.width, size.height) > ORIGINAL_MAX_SIDE) {
    ctx = ctx.resize(size.width >= size.height ? { width: ORIGINAL_MAX_SIDE } : { height: ORIGINAL_MAX_SIDE });
  }
  const format = (await hasTransparency(uri)) ? SaveFormat.PNG : SaveFormat.JPEG;
  const out = await (await ctx.renderAsync()).saveAsync({ format, compress: 0.85 });
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
  const img = await ref.saveAsync({ format: formatOf(uri), compress: 1 });
  return { uri: img.uri, width: img.width, height: img.height };
}

/** How big a token's picture is kept: plenty for a token, even zoomed right in. */
const TOKEN_SIDE = 360;

/**
 * A picture made into a token's, shrunk to TOKEN_SIDE: the largest square from its middle; or, for a cut-out (a
 * picture with see-through parts, like a subject lifted from a photo), the whole of it, kept see-through.
 */
export async function tokenPicture(uri: string): Promise<string> {
  if (await hasTransparency(uri)) {
    const size = await ImageManipulator.manipulate(uri).renderAsync();
    const ref = await ImageManipulator.manipulate(uri)
      .resize(size.width >= size.height ? { width: TOKEN_SIDE } : { height: TOKEN_SIDE })
      .renderAsync();
    return (await ref.saveAsync({ format: SaveFormat.PNG })).uri;
  }
  const square = await cropToShape(uri, 1);
  const ref = await ImageManipulator.manipulate(square).resize({ width: TOKEN_SIDE }).renderAsync();
  const out = await ref.saveAsync({ format: SaveFormat.JPEG, compress: 0.85 });
  return out.uri;
}
/** How big custom art is kept, on its longest side: sharp zoomed in close, as a card's art is (see ART_MAX for the limit). */
const ART_SIDE = 1024;

/** A picture made into custom art: shrunk to ART_SIDE on its longest side, kept see-through if it is. */
export async function artPicture(uri: string): Promise<LoadedImage> {
  const see = await hasTransparency(uri);
  const size = await ImageManipulator.manipulate(uri).renderAsync();
  let ctx = ImageManipulator.manipulate(uri);
  if (Math.max(size.width, size.height) > ART_SIDE) ctx = ctx.resize(size.width >= size.height ? { width: ART_SIDE } : { height: ART_SIDE });
  const out = await (await ctx.renderAsync()).saveAsync(see ? { format: SaveFormat.PNG } : { format: SaveFormat.JPEG, compress: 0.92 });
  return { uri: out.uri, width: out.width, height: out.height };
}