// Whether a PNG has see-through pixels: decoded here in plain JavaScript (pure logic, so it can be tested), for
// keeping card art with transparency (e.g. die-cut shapes, rounded corners) as PNG rather than flattening it.
import { unzlibSync } from 'fflate';

/** Pixels at least this opaque count as solid (a PNG exported "with alpha" is often all but solid). */
const SOLID = 250;

const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

/**
 * Whether a PNG file has any see-through pixels. Reads 8-bit, non-interlaced gray+alpha and RGBA images in full
 * (what the image tools write); for the rest, goes by the header: a transparency chunk means see-through.
 */
export function pngHasTransparency(bytes: Uint8Array): boolean {
  if (bytes.length < 33 || SIGNATURE.some((b, i) => bytes[i] !== b)) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let interlaced = false;
  let hasTrns = false;
  const idat: Uint8Array[] = [];
  for (let at = 8; at + 8 <= bytes.length; ) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(bytes[at + 4], bytes[at + 5], bytes[at + 6], bytes[at + 7]);
    const data = bytes.subarray(at + 8, at + 8 + length);
    if (type === 'IHDR') {
      width = view.getUint32(at + 8);
      height = view.getUint32(at + 12);
      depth = data[8];
      colorType = data[9];
      interlaced = data[12] === 1;
    } else if (type === 'tRNS') hasTrns = true;
    else if (type === 'IDAT') idat.push(data);
    else if (type === 'IEND') break;
    at += 12 + length;
  }
  // No alpha channel: see-through only by a transparency chunk (a palette entry or a color key).
  if (colorType !== 4 && colorType !== 6) return hasTrns;
  // An alpha channel this reader doesn't unpack: assume it's used.
  if (depth !== 8 || interlaced || !width || !height) return true;

  const joined = new Uint8Array(idat.reduce((n, d) => n + d.length, 0));
  idat.reduce((at, d) => (joined.set(d, at), at + d.length), 0);
  const raw = unzlibSync(joined);
  const bpp = colorType === 6 ? 4 : 2;
  const stride = width * bpp;
  let prev = new Uint8Array(stride);
  let row = new Uint8Array(stride);
  for (let y = 0; y < height; y++) {
    const start = y * (stride + 1);
    const filter = raw[start];
    for (let x = 0; x < stride; x++) {
      const v = raw[start + 1 + x];
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let p = v;
      if (filter === 1) p = v + a;
      else if (filter === 2) p = v + b;
      else if (filter === 3) p = v + ((a + b) >> 1);
      else if (filter === 4) {
        const pa = Math.abs(b - c);
        const pb = Math.abs(a - c);
        const pc = Math.abs(a + b - 2 * c);
        p = v + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      }
      row[x] = p & 255;
    }
    for (let x = bpp - 1; x < stride; x += bpp) if (row[x] < SOLID) return true;
    [prev, row] = [row, prev];
  }
  return false;
}
