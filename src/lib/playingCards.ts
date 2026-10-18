// A classic 52-card deck that comes with the app (drawn for it), for the Solitaire example in Free Play:
// spades, hearts, diamonds and clubs, ace to king, with big corner indexes that show where cards overlap.
import { fileOf } from './sampleDeck';

const CARDS = [
  { name: 'Ace of Spades', art: require('../../assets/playing-cards/as.png') },
  { name: 'Two of Spades', art: require('../../assets/playing-cards/2s.png') },
  { name: 'Three of Spades', art: require('../../assets/playing-cards/3s.png') },
  { name: 'Four of Spades', art: require('../../assets/playing-cards/4s.png') },
  { name: 'Five of Spades', art: require('../../assets/playing-cards/5s.png') },
  { name: 'Six of Spades', art: require('../../assets/playing-cards/6s.png') },
  { name: 'Seven of Spades', art: require('../../assets/playing-cards/7s.png') },
  { name: 'Eight of Spades', art: require('../../assets/playing-cards/8s.png') },
  { name: 'Nine of Spades', art: require('../../assets/playing-cards/9s.png') },
  { name: 'Ten of Spades', art: require('../../assets/playing-cards/10s.png') },
  { name: 'Jack of Spades', art: require('../../assets/playing-cards/js.png') },
  { name: 'Queen of Spades', art: require('../../assets/playing-cards/qs.png') },
  { name: 'King of Spades', art: require('../../assets/playing-cards/ks.png') },
  { name: 'Ace of Hearts', art: require('../../assets/playing-cards/ah.png') },
  { name: 'Two of Hearts', art: require('../../assets/playing-cards/2h.png') },
  { name: 'Three of Hearts', art: require('../../assets/playing-cards/3h.png') },
  { name: 'Four of Hearts', art: require('../../assets/playing-cards/4h.png') },
  { name: 'Five of Hearts', art: require('../../assets/playing-cards/5h.png') },
  { name: 'Six of Hearts', art: require('../../assets/playing-cards/6h.png') },
  { name: 'Seven of Hearts', art: require('../../assets/playing-cards/7h.png') },
  { name: 'Eight of Hearts', art: require('../../assets/playing-cards/8h.png') },
  { name: 'Nine of Hearts', art: require('../../assets/playing-cards/9h.png') },
  { name: 'Ten of Hearts', art: require('../../assets/playing-cards/10h.png') },
  { name: 'Jack of Hearts', art: require('../../assets/playing-cards/jh.png') },
  { name: 'Queen of Hearts', art: require('../../assets/playing-cards/qh.png') },
  { name: 'King of Hearts', art: require('../../assets/playing-cards/kh.png') },
  { name: 'Ace of Diamonds', art: require('../../assets/playing-cards/ad.png') },
  { name: 'Two of Diamonds', art: require('../../assets/playing-cards/2d.png') },
  { name: 'Three of Diamonds', art: require('../../assets/playing-cards/3d.png') },
  { name: 'Four of Diamonds', art: require('../../assets/playing-cards/4d.png') },
  { name: 'Five of Diamonds', art: require('../../assets/playing-cards/5d.png') },
  { name: 'Six of Diamonds', art: require('../../assets/playing-cards/6d.png') },
  { name: 'Seven of Diamonds', art: require('../../assets/playing-cards/7d.png') },
  { name: 'Eight of Diamonds', art: require('../../assets/playing-cards/8d.png') },
  { name: 'Nine of Diamonds', art: require('../../assets/playing-cards/9d.png') },
  { name: 'Ten of Diamonds', art: require('../../assets/playing-cards/10d.png') },
  { name: 'Jack of Diamonds', art: require('../../assets/playing-cards/jd.png') },
  { name: 'Queen of Diamonds', art: require('../../assets/playing-cards/qd.png') },
  { name: 'King of Diamonds', art: require('../../assets/playing-cards/kd.png') },
  { name: 'Ace of Clubs', art: require('../../assets/playing-cards/ac.png') },
  { name: 'Two of Clubs', art: require('../../assets/playing-cards/2c.png') },
  { name: 'Three of Clubs', art: require('../../assets/playing-cards/3c.png') },
  { name: 'Four of Clubs', art: require('../../assets/playing-cards/4c.png') },
  { name: 'Five of Clubs', art: require('../../assets/playing-cards/5c.png') },
  { name: 'Six of Clubs', art: require('../../assets/playing-cards/6c.png') },
  { name: 'Seven of Clubs', art: require('../../assets/playing-cards/7c.png') },
  { name: 'Eight of Clubs', art: require('../../assets/playing-cards/8c.png') },
  { name: 'Nine of Clubs', art: require('../../assets/playing-cards/9c.png') },
  { name: 'Ten of Clubs', art: require('../../assets/playing-cards/10c.png') },
  { name: 'Jack of Clubs', art: require('../../assets/playing-cards/jc.png') },
  { name: 'Queen of Clubs', art: require('../../assets/playing-cards/qc.png') },
  { name: 'King of Clubs', art: require('../../assets/playing-cards/kc.png') },
];
const BACK = require('../../assets/playing-cards/back.png');

/** The 52 cards' pictures (as files) and names, spades to clubs, ace to king; and the back's. */
export async function playingCards(): Promise<{ cards: { uri: string; name: string }[]; back: string }> {
  const [uris, back] = await Promise.all([Promise.all(CARDS.map((c) => fileOf(c.art))), fileOf(BACK)]);
  return { cards: uris.map((uri, i) => ({ uri, name: CARDS[i].name })), back };
}