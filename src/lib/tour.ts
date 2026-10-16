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
  | 'undone';

/** A control a step can point at, on screen. */
export type TourTarget =
  | 'home.newDeck'
  | 'deck.addCards'
  | 'deck.back'
  | 'deck.play'
  | 'table.deck'
  | 'table.play'
  | 'table.hand'
  | 'table.buttons'
  | 'table.undo';

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
    title: 'Add some cards',
    text: 'Every card is a picture: a photo, a scan, artwork. Tap + Add cards.',
    target: 'deck.addCards',
    until: 'add-cards-menu',
    dim: true,
  },
  {
    title: 'No pictures yet?',
    text: 'Use our sample cards for now. Later, add your own from the camera, Photos or Files.',
    tile: 'Sample cards',
    until: 'cards-added',
  },
  {
    title: 'Give it a back',
    text: 'The back is what you see when a card is face down. Tap Choose image.',
    target: 'deck.back',
    until: 'back-menu',
    dim: true,
  },
  {
    title: 'Pick a back',
    text: 'Use the sample back for now.',
    tile: 'Sample back',
    until: 'back-set',
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
  },
  {
    title: 'Tap a card',
    text: 'Tap the card you put down to see what you can do with it.',
    target: 'table.play',
    until: 'card-menu',
  },
  {
    title: 'Flip it over',
    text: 'Tap Flip over to turn the card face down.',
    tile: 'Flip over',
    until: 'flipped',
  },
  {
    title: 'Your hand',
    text: 'Drag a card from the table or the deck down into your hand. Tap the tab on top to tuck it away.',
    target: 'table.hand',
    until: 'to-hand',
  },
  {
    title: 'Shuffle',
    text: 'Draw, Shuffle and Search sit between the piles. Tap Shuffle.',
    target: 'table.buttons',
    until: 'shuffled',
  },
  {
    title: 'Undo',
    text: 'Changed your mind? Undo takes back the last thing you did. Try it.',
    target: 'table.undo',
    until: 'undone',
  },
  {
    title: "You're all set",
    text: 'Start a session to play several decks at once. To see this again, tap ? on the home screen.',
    next: 'Done',
  },
];

interface State {
  /** The step showing, or null when the tour isn't running. */
  step: number | null;
  /** Where the controls steps point at are on screen, as their screens report them. */
  targets: Partial<Record<TourTarget, Rect>>;
}

let state: State = { step: null, targets: {} };
const listeners = new Set<() => void>();
const set = (next: Partial<State>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export const startTour = () => set({ step: 0 });
export const endTour = () => set({ step: null });
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
  if (state.step !== null && TOUR[state.step].until === event) nextTourStep();
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
export const tourRunning = () => state.step !== null;

/** The current step (and its number), or null. Redraws only when the step changes. */
export function useTourStep(): { index: number; step: TourStep } | null {
  const index = useSyncExternalStore(subscribe, () => state.step);
  return index === null ? null : { index, step: TOUR[index] };
}

/** Where a target is on screen. */
export function useTourTargetRect(target: TourTarget | undefined): Rect | undefined {
  return useSyncExternalStore(subscribe, () => (target ? state.targets[target] : undefined));
}
