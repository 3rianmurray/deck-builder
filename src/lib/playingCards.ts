// A classic 52-card deck that comes with the app (drawn for it), for the Solitaire example in Free Play:
// spades, hearts, diamonds and clubs, ace to king, with big corner indexes that show where cards overlap.
import { fileOf } from './sampleDeck';

const CARDS = [
  { name: 'Ace of Spades', art: require('../../assets/playing-cards/as.jpg') },
  { name: 'Two of Spades', art: require('../../assets/playing-cards/2s.jpg') },
  { name: 'Three of Spades', art: require('../../assets/playing-cards/3s.jpg') },
  { name: 'Four of Spades', art: require('../../assets/playing-cards/4s.jpg') },
  { name: 'Five of Spades', art: require('../../assets/playing-cards/5s.jpg') },
  { name: 'Six of Spades', art: require('../../assets/playing-cards/6s.jpg') },
  { name: 'Seven of Spades', art: require('../../assets/playing-cards/7s.jpg') },
  { name: 'Eight of Spades', art: require('../../assets/playing-cards/8s.jpg') },
  { name: 'Nine of Spades', art: require('../../assets/playing-cards/9s.jpg') },
  { name: 'Ten of Spades', art: require('../../assets/playing-cards/10s.jpg') },
  { name: 'Jack of Spades', art: require('../../assets/playing-cards/js.jpg') },
  { name: 'Queen of Spades', art: require('../../assets/playing-cards/qs.jpg') },
  { name: 'King of Spades', art: require('../../assets/playing-cards/ks.jpg') },
  { name: 'Ace of Hearts', art: require('../../assets/playing-cards/ah.jpg') },
  { name: 'Two of Hearts', art: require('../../assets/playing-cards/2h.jpg') },
  { name: 'Three of Hearts', art: require('../../assets/playing-cards/3h.jpg') },
  { name: 'Four of Hearts', art: require('../../assets/playing-cards/4h.jpg') },
  { name: 'Five of Hearts', art: require('../../assets/playing-cards/5h.jpg') },
  { name: 'Six of Hearts', art: require('../../assets/playing-cards/6h.jpg') },
  { name: 'Seven of Hearts', art: require('../../assets/playing-cards/7h.jpg') },
  { name: 'Eight of Hearts', art: require('../../assets/playing-cards/8h.jpg') },
  { name: 'Nine of Hearts', art: require('../../assets/playing-cards/9h.jpg') },
  { name: 'Ten of Hearts', art: require('../../assets/playing-cards/10h.jpg') },
  { name: 'Jack of Hearts', art: require('../../assets/playing-cards/jh.jpg') },
  { name: 'Queen of Hearts', art: require('../../assets/playing-cards/qh.jpg') },
  { name: 'King of Hearts', art: require('../../assets/playing-cards/kh.jpg') },
  { name: 'Ace of Diamonds', art: require('../../assets/playing-cards/ad.jpg') },
  { name: 'Two of Diamonds', art: require('../../assets/playing-cards/2d.jpg') },
  { name: 'Three of Diamonds', art: require('../../assets/playing-cards/3d.jpg') },
  { name: 'Four of Diamonds', art: require('../../assets/playing-cards/4d.jpg') },
  { name: 'Five of Diamonds', art: require('../../assets/playing-cards/5d.jpg') },
  { name: 'Six of Diamonds', art: require('../../assets/playing-cards/6d.jpg') },
  { name: 'Seven of Diamonds', art: require('../../assets/playing-cards/7d.jpg') },
  { name: 'Eight of Diamonds', art: require('../../assets/playing-cards/8d.jpg') },
  { name: 'Nine of Diamonds', art: require('../../assets/playing-cards/9d.jpg') },
  { name: 'Ten of Diamonds', art: require('../../assets/playing-cards/10d.jpg') },
  { name: 'Jack of Diamonds', art: require('../../assets/playing-cards/jd.jpg') },
  { name: 'Queen of Diamonds', art: require('../../assets/playing-cards/qd.jpg') },
  { name: 'King of Diamonds', art: require('../../assets/playing-cards/kd.jpg') },
  { name: 'Ace of Clubs', art: require('../../assets/playing-cards/ac.jpg') },
  { name: 'Two of Clubs', art: require('../../assets/playing-cards/2c.jpg') },
  { name: 'Three of Clubs', art: require('../../assets/playing-cards/3c.jpg') },
  { name: 'Four of Clubs', art: require('../../assets/playing-cards/4c.jpg') },
  { name: 'Five of Clubs', art: require('../../assets/playing-cards/5c.jpg') },
  { name: 'Six of Clubs', art: require('../../assets/playing-cards/6c.jpg') },
  { name: 'Seven of Clubs', art: require('../../assets/playing-cards/7c.jpg') },
  { name: 'Eight of Clubs', art: require('../../assets/playing-cards/8c.jpg') },
  { name: 'Nine of Clubs', art: require('../../assets/playing-cards/9c.jpg') },
  { name: 'Ten of Clubs', art: require('../../assets/playing-cards/10c.jpg') },
  { name: 'Jack of Clubs', art: require('../../assets/playing-cards/jc.jpg') },
  { name: 'Queen of Clubs', art: require('../../assets/playing-cards/qc.jpg') },
  { name: 'King of Clubs', art: require('../../assets/playing-cards/kc.jpg') },
];
const BACK = require('../../assets/playing-cards/back.jpg');

/** The 52 cards' pictures (as files) and names, spades to clubs, ace to king; and the back's. */
export async function playingCards(): Promise<{ cards: { uri: string; name: string }[]; back: string }> {
  const [uris, back] = await Promise.all([Promise.all(CARDS.map((c) => fileOf(c.art))), fileOf(BACK)]);
  return { cards: uris.map((uri, i) => ({ uri, name: CARDS[i].name })), back };
}