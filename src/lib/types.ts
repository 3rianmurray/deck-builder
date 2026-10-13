/** A card design inside a deck. `image` is a path relative to the app's document directory. */
export interface Card {
  id: string;
  name: string;
  image: string;
}

export interface Deck {
  id: string;
  name: string;
  /** Relative image path for the card back, or null to use the built-in back. */
  backImage: string | null;
  cards: Card[];
  createdAt: number;
  updatedAt: number;
}

/** Where a card can sit while playing. */
export type Zone = 'deck' | 'hand' | 'table' | 'discard';

/** One physical copy of a card on the table. */
export interface CardInstance {
  /** Unique per instance, so duplicate cards can be told apart. */
  iid: string;
  cardId: string;
  faceUp: boolean;
}

/** Index 0 is the top of the deck/discard pile, and the leftmost card in hand/table. */
export type TableState = Record<Zone, CardInstance[]>;
