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
  | 'revealed'
  | 'left-table'
  | 'tables-opened'
  | 'tables-moved'
  | 'tables-lifted'
  | 'tables-flipped'
  | 'tables-options'
  | 'tables-to-hand';

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
  | 'table.title'
  | 'table.back'
  | 'home.table';

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
    text: "Let's make a deck and play it together. It takes about a minute, and you can skip any time.",
    next: "Let's go",
  },
  {
    title: 'Make a deck',
    text: 'Tap + Deck to start one.',
    target: 'home.newDeck',
    until: 'deck-created',
    dim: true,
  },
  {
    title: 'Start with the back',
    text: "The back is what you see when a card is face down, and it's the same on every card. Tap Choose Image.",
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
    text: 'Each card gets its own picture: a photo, a scan, artwork. Tap + Add.',
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
    text: 'Your deck is ready. Tap Play with this deck.',
    target: 'deck.play',
    until: 'table-opened',
    dim: true,
  },
  {
    title: 'Turn over a card',
    text: 'Tap the deck, or drag its top card to the discard pile, to reveal it.',
    target: 'table.deck',
    until: 'revealed',
    // Time to watch it turn over.
    after: 1300,
  },
  {
    title: 'Now, tables',
    text: 'Decks are for turning cards over. To lay cards out, with hands and several decks at once, there are tables. Tap the back arrow.',
    target: 'table.back',
    until: 'left-table',
    dim: true,
  },
  {
    title: 'Open a table',
    text: "Here's a Solitaire table, already dealt. Tap Play.",
    target: 'home.table',
    until: 'tables-opened',
    dim: true,
  },
  {
    title: 'A table',
    text: 'A big open table for any of your decks, with four hands at the bottom. Slide one finger to look around; pinch and twist with two to zoom and turn.',
    next: 'Got it',
    place: 'top',
    dim: false,
  },
  {
    title: 'Move a card',
    text: 'Drag a card and drop it anywhere. Dragging a stack takes its top card.',
    until: 'tables-moved',
    place: 'top',
    dim: false,
  },
  {
    title: 'Move a whole stack',
    text: 'Hold a stack a moment, until it lifts, then drag it somewhere else.',
    until: 'tables-lifted',
    place: 'top',
    dim: false,
  },
  {
    title: 'Flip a card',
    text: 'Double-tap a card to turn it over.',
    until: 'tables-flipped',
    after: 900,
    place: 'top',
    dim: false,
  },
  {
    title: 'Its options',
    text: 'Tap a card once to pick it out (flip and more buttons show at the bottom left). Tap it again for all its options: draw, shuffle, search, deal and more.',
    until: 'tables-options',
    place: 'top',
    dim: false,
  },
  {
    title: 'Your hand',
    text: 'Close the options, then drag a card down into the tray at the bottom: that hand holds it. The tabs switch between four hands.',
    until: 'tables-to-hand',
    place: 'top',
    dim: false,
  },
  {
    title: "You're all set",
    text: 'Tap the table’s name at the top to add decks or cards, or change its color. The wrench on the left snaps cards to a grid. For every gesture, or this tour again, tap ? on the home screen.',
    next: 'Done',
    place: 'top',
  },];interface State {
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

/** What the current step waits for, if anything (a cheap check, outside React). */
export const tourWaitingFor = (): TourEvent | undefined => (state.step === null ? undefined : TOUR[state.step].until);

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
