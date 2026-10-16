// The guided walkthrough ("tour"): a step at a time, a tip by a real control, moving on when the player does
// what it asks. Kept outside React state, as a tiny store, so the busy table doesn't redraw for it: the parts of
// the app that take part just report where their controls are (`setTourTarget`) and what happens (`tourEvent`).
import { useSyncExternalStore } from 'react';

/** A box on screen, in window coordinates. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Something the player did that a step can wait for. */
export type TourEvent =
  | 'deck-created'
  | 'add-cards-menu'
  | 'cards-added'
  | 'back-menu'
  | 'back-set'
  | 'table-opened'
  | 'to-table'
  | 'card-menu'
  | 'flipped'
  | 'to-hand'
  | 'shuffled'
  | 'undone'
  | 'table-menu'
  | 'reveal-mode'
  | 'revealed';

/** A control a step can point at, on screen. */
export type TourTarget =
  | 'home.newDeck'
  | 'deck.addCards'
  | 'deck.back'
  | 'deck.play'
  | 'table.deck'
  | 'table.play'
  | 'table.card'
  | 'table.hand'
  | 'table.buttons'
  | 'table.undo'
  | 'table.title';

export interface TourStep {
  title: string;
  text: string;
  /** The control the tip points at; without one, the tip sits in the middle of the screen. */
  target?: TourTarget;
  /** What moves the tour on. Without one, the tip has a button to carry on. */
  until?: TourEvent;
  /** The button, for steps that don't wait for anything. */
  next?: string;
  /** Inside a menu (which draws over everything): the menu itself shows the tip, by this tile. */
  tile?: string;
  /**
   * Where the tip sits: by default beside its control (above or below), or in the middle without one. 'top' puts
   * it at the top of the screen, 'right' to the control's right (narrower), to keep clear of what's needed.
   */
  place?: 'top' | 'right';
  /** How long to wait after the step's event before moving on, so its result can be seen. */
  after?: number;
  /** Darken everything but the target. Off where the player needs to see the table to drag across it. */
  dim?: boolean;
}

export const TOUR: TourStep[] = [
  {
    title: 'Welcome to Shufflevale',
    text: "Let's make a deck and play a quick hand together. It takes about a minute, and you can skip any time.",
    next: "Let's go",
  },
  {
    title: 'Make a deck',
    text: 'Tap + New Deck to start one.',
    target: 'home.newDeck',
    until: 'deck-created',
    dim: true,
  },
  {
    title: 'Start with the back',
    text: "The back is what you see when a card is face down, and it's the same on every card. Tap Choose image.",
    target: 'deck.back',
    until: 'back-menu',
    dim: true,
  },
  {
    title: 'Upload your card back',
    text: "Here you can take a photo or choose a picture. For now, we'll use the sample back.",
    tile: 'Sample back',
    until: 'back-set',
  },
  {
    title: 'Now the fronts',
    text: 'Each card gets its own picture: a photo, a scan, artwork. Tap + Add cards.',
    target: 'deck.addCards',
    until: 'add-cards-menu',
    dim: true,
  },
  {
    title: 'Upload your art',
    text: "Here you can take photos, choose pictures or cut up a sprite sheet. For now, we'll use the sample cards.",
    tile: 'Sample cards',
    until: 'cards-added',
  },
  {
    title: 'Ready to play',
    text: 'Your deck is ready. Take it to the table.',
    target: 'deck.play',
    until: 'table-opened',
    dim: true,
  },
  {
    title: 'This is your deck',
    text: 'Drag the top card off the deck and drop it anywhere on the table.',
    target: 'table.deck',
    until: 'to-table',
    place: 'right',
  },
  {
    title: 'Tap a card',
    text: 'Tap the card you put down to see what you can do with it.',
    target: 'table.card',
    until: 'card-menu',
    place: 'top',
  },
  {
    title: 'Flip it over',
    text: "Tap Flip over to reveal the card. Cards can also be flipped while they're being dragged.",
    tile: 'Flip over',
    until: 'flipped',
    // Time to watch it turn over.
    after: 1300,
  },
  {
    title: 'Your hand',
    text: 'Drag a card from the table or the deck down into your hand. Tap the tab on top to tuck it away.',
    target: 'table.hand',
    until: 'to-hand',
    place: 'top',
  },
  {
    title: 'Shuffle',
    text: 'Draw, Shuffle and Search sit between the piles. Tap Shuffle and watch the deck get shuffled.',
    target: 'table.buttons',
    until: 'shuffled',
  },
  {
    title: 'Reveal mode',
    text: "Some games just turn cards over one at a time. That's reveal mode. Tap the deck's name to open the table menu.",
    target: 'table.title',
    until: 'table-menu',
    dim: true,
  },
  {
    title: 'Switch to reveal mode',
    text: 'Tap Switch to reveal mode. If you have cards out, you can keep them aside or discard them.',
    tile: 'Switch to reveal mode',
    until: 'reveal-mode',
  },
  {
    title: 'Turn over a card',
    text: 'Tap the deck, or drag a card to the discard pile, to reveal it.',
    target: 'table.deck',
    until: 'revealed',
  },
  {
    title: "You're all set",
    text: 'Switch back to table mode from the same menu any time. Start a session to play several decks at once. To see this again, tap ? on the home screen.',
    next: 'Done',
    place: 'top',
  },
];
interface State {
  /** The step showing, or null when the tour isn't running. */
  step: number | null;
  /** A step whose result is being shown before the next (see `after`): the tour is still on. */
  pausedAt: number | null;
  /** Where the controls steps point at are on screen, as their screens report them. */
  targets: Partial<Record<TourTarget, Rect>>;
}

let state: State = { step: null, pausedAt: null, targets: {} };
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const startTour = () => set({ step: 0, pausedAt: null });
export const endTour = () => set({ step: null, pausedAt: null });
/** On to the next step, or the end. */
export const nextTourStep = () => {
  if (state.step === null) return;
  set({ step: state.step + 1 < TOUR.length ? state.step + 1 : null });
};

/** Back a step: a menu step's menu was closed without choosing, so back to the step that opens it. */
export const previousTourStep = () => {
  if (state.step !== null && state.step > 0) set({ step: state.step - 1 });
};

/** The player did something: if it's what the current step waits for, the tour moves on. */
export function tourEvent(event: TourEvent) {
  const at = state.step;
  if (at === null || TOUR[at].until !== event) return;
  const wait = TOUR[at].after;
  if (!wait) return nextTourStep();
  // Meanwhile the tip goes, so the result is in plain view; then on, unless the tour has moved since.
  set({ step: null, pausedAt: at });
  setTimeout(() => {
    if (state.pausedAt === at) set({ step: at + 1 < TOUR.length ? at + 1 : null, pausedAt: null });
  }, wait);
}

/** Reports where a control is on screen (null once it's gone), for steps that point at it. */
export function setTourTarget(target: TourTarget, rect: Rect | null) {
  const was = state.targets[target];
  if (rect && was && was.x === rect.x && was.y === rect.y && was.w === rect.w && was.h === rect.h) return;
  if (!rect && !was) return;
  const targets = { ...state.targets };
  if (rect) targets[target] = rect;
  else delete targets[target];
  set({ targets });
}

/** Whether the tour is running (a cheap check, outside React). */
export const tourRunning = () => state.step !== null || state.pausedAt !== null;

/** The current step (and its number), or null. Redraws only when the step changes. */
export function useTourStep(): { index: number; step: TourStep } | null {
  const index = useSyncExternalStore(subscribe, () => state.step);
  return index === null ? null : { index, step: TOUR[index] };
}

/** Where a target is on screen. */
export function useTourTargetRect(target: TourTarget | undefined): Rect | undefined {
  return useSyncExternalStore(subscribe, () => (target ? state.targets[target] : undefined));
}
