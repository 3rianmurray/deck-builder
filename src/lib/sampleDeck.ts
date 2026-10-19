// Sample card art that comes with the app, for trying it out (and the walkthrough) before having pictures of
// one's own: four suits (suns, moons, stars and leaves) of one to three, and a back.
import { Asset } from 'expo-asset';

const CARDS = [
  { name: 'One of Suns', art: require('../../assets/sample/sun-1.jpg') },
  { name: 'Two of Suns', art: require('../../assets/sample/sun-2.jpg') },
  { name: 'Three of Suns', art: require('../../assets/sample/sun-3.jpg') },
  { name: 'One of Moons', art: require('../../assets/sample/moon-1.jpg') },
  { name: 'Two of Moons', art: require('../../assets/sample/moon-2.jpg') },
  { name: 'Three of Moons', art: require('../../assets/sample/moon-3.jpg') },
  { name: 'One of Stars', art: require('../../assets/sample/star-1.jpg') },
  { name: 'Two of Stars', art: require('../../assets/sample/star-2.jpg') },
  { name: 'Three of Stars', art: require('../../assets/sample/star-3.jpg') },
  { name: 'One of Leaves', art: require('../../assets/sample/leaf-1.jpg') },
  { name: 'Two of Leaves', art: require('../../assets/sample/leaf-2.jpg') },
  { name: 'Three of Leaves', art: require('../../assets/sample/leaf-3.jpg') },
];
const BACK = require('../../assets/sample/back.jpg');

/** A bundled picture as a file on the phone, ready to be copied into a deck. */
export async function fileOf(art: number): Promise<string> {
  const [asset] = await Asset.loadAsync(art);
  if (!asset.localUri) throw new Error('Sample art could not be loaded');
  return asset.localUri;
}

/** The sample cards' pictures (as files) and names, in order. */
export async function sampleCards(): Promise<{ uris: string[]; names: string[] }> {
  const uris = await Promise.all(CARDS.map((c) => fileOf(c.art)));
  return { uris, names: CARDS.map((c) => c.name) };
}

/** The sample back's picture, as a file. */
export const sampleBack = () => fileOf(BACK);
