import { router, Stack } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  Alert,
  Animated,
  Easing,
  LayoutAnimation,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent, NativeTouchEvent, StyleProp, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet, type SheetAction, type SheetTile } from './ActionSheet';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { matSpot, OnTabletopContext, TabletopSurface, tabletopShadow, WoodRail } from './Tabletop';
import { CardZoom, type ZoomItem } from './CardZoom';
import { ReorderableGrid } from './ReorderableGrid';
import type { GridHold } from './ReorderableGrid';
import { Riffle, riffleHeight } from './Riffle';
import { CardView, EmptySlot, PileDepth, pileRise, pileThickness, prefersReducedMotion } from './CardView';
import { leanAt, leanOffset, useViewTilt } from './viewpoint';
import type { Lean } from './viewpoint';
import { useDecks } from '../lib/DecksContext';
import * as haptics from '../lib/haptics';
import * as T from '../lib/table';
import { fitTilt, tiltTransform, unproject } from '../lib/tilt';
import { cardRatio } from '../lib/types';
import type { Card, CardInstance, Deck, PlayMode, Spot, TableState, Zone } from '../lib/types';
import { colors } from '../theme';

type Sheet =
  /** A card's menu; for a card in a table stack, `whole` has it act on the whole stack. */
  | { kind: 'card'; iid: string; whole?: boolean }
  | { kind: 'discard' }
  | { kind: 'table' }
  /** Several cards (top first) let go on an empty table spot, asking how to put them down. */
  | { kind: 'place'; iids: string[]; spot: Spot; faceUp: boolean };

/** Distance a finger must travel before a press turns into a drag. */
const DRAG_SLOP = 8;
/** Holding a card this long without moving counts as a long press. */
const LONG_PRESS_MS = 450;
/** Holding a face-up card still this long opens it full size. */
const HOLD_TO_ZOOM_MS = 450;
/**
 * A card isn't lifted until this long after the press, giving a second finger time to land for a pinch:
 * the first finger often slides a little before the second touches down.
 */
const LIFT_DELAY_MS = 90;
const FLIP_SIZE = { w: 150, h: 56 };
/** Extra hit area around the small piles and the FLIP button. */
const PILE_PAD = 16;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const inside = (r: Rect, x: number, y: number, pad = 0) =>
  x >= r.x - pad && x <= r.x + r.w + pad && y >= r.y - pad && y <= r.y + r.h + pad;

const toRect = (e: LayoutChangeEvent): Rect => {
  const { x, y, width, height } = e.nativeEvent.layout;
  return { x, y, w: width, h: height };
};

type LayoutKey =
  | 'piles'
  | 'deckPile'
  | 'discardPile'
  | 'play'
  | 'hand'
  | 'handScroll'
  | 'reveal'
  | 'revealPiles'
  | 'revealDeck'
  | 'revealDiscard';

/** Tabletop look: how far the table leans back, and the camera's distance (smaller is stronger perspective). */
const TILT_ANGLE = 14;
const TILT_PERSPECTIVE = 900;
/** How many actions on a table can be undone, most recent first. */
const UNDO_STEPS = 30;
/** How long a revealed card takes to travel from the deck to the discard pile. */
const FLIGHT_MS = 450;
/** Where a pile's top card sits inside its slot (the slot's highlight border plus padding). */
const PILE_INSET = 4;
/** Height taken in reveal mode by everything but the two cards: their labels, gaps and padding. */
const REVEAL_CHROME = 100;
/** Width of reveal mode's column of icon buttons, including the gap beside it. */
const REVEAL_RAIL = 72;
/** How far down the table the eye sits, for which way piles lean (0 is the top, 1 the bottom). */
const VIEW_DOWN = 0.78;
/** Size of the trash can that appears while dragging. */
const TRASH_SIZE = 56;
/** The play table's grid: space round its edge, and the least space between cards. */
const GRID_PAD = 14;
const GRID_GAP = 10;
/** The play area's highlight border, on each side. */
const PLAY_BORDER = 2;
/** A card being pressed or dragged. Positions are page coordinates of the finger. */
interface Drag {
  iid: string;
  cardId: string;
  from: Zone;
  width: number;
  /** Only cards in the hand: horizontal swipes scroll the hand instead of picking the card up. */
  verticalOnly: boolean;
  touchId: string;
  startX: number;
  startY: number;
  /** Where on the card the finger landed, so the lifted card stays under the finger. */
  offX: number;
  offY: number;
  pressedAt: number;
  /** Face up and not in the deck: holding it still opens it full size. */
  zoomable: boolean;
  /** True once the finger has moved far enough to lift the card. */
  active: boolean;
  /** True when the finger moved in a way that hands the touch to a scroll view. */
  abandoned: boolean;
  /**
   * True when the card's touch handler was released by another finger (e.g. the one tapping FLIP) while the
   * holding finger is still down. The screen's own touch events then carry the drag until that finger lifts.
   */
  orphaned: boolean;
  startFaceUp: boolean;
  /** Which way up the whole held stack is showing. */
  faceUp: boolean;
  /**
   * Every card being held, top first. It starts as just the pressed card; tapping other cards with another
   * finger puts them on top, and FLIP turns the stack over, so the bottom card ends up showing.
   */
  stack: HeldCard[];
  /** Picked up by its count: a whole table stack, which stays a stack wherever it's dropped on the table. */
  wholeStack: boolean;
  /** Taken out of the deck or discard pile from the search: put back on its pile, it goes on top. */
  fromSearch?: boolean;
  /** A second finger on the screen while cards are held: a tap picks up a card, a swipe scrolls the hand or table. */
  helper?: Helper;
  /**
   * The lifted copy of the card is on screen (its picture takes a few frames to appear). Until then the card
   * itself stays visible where it is; after, it turns into a blank space and the copy grows from it.
   */
  shown: boolean;
  /**
   * Two fingers landed before the card was lifted: a pinch, not a drag. Spreading them zooms a face-up card;
   * the card never lifts, and letting go doesn't count as a tap. `startDistance` is between the two fingers.
   */
  pinch?: { startDistance: number };
}

/** Spreading two fingers to this multiple of their starting distance zooms the card. */
const PINCH_OPEN = 1.15;

const fingerDistance = (a: NativeTouchEvent, b: NativeTouchEvent) => Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);

interface Helper {
  touchId: string;
  startX: number;
  startY: number;
  /** The scroll view this finger landed on, which it scrolls if it slides. */
  scrolls: 'hand' | 'play' | null;
  startOffset: number;
  /** Slid far enough to count as a swipe, not a tap. */
  moved: boolean;
}

/**
 * How much bigger the held stack is than the cards it came from. It's drawn at that size (not scaled up from
 * the smaller card, which blurs the art).
 */
const LIFTED_SCALE = 1.25;
/**
 * Dropping on a table card stacks onto it only over its middle: this fraction of the card on each side is
 * left for dropping next to it instead.
 */
const STACK_TARGET_INSET = 0.22;
/** How long dropped cards take to glide into their place in the hand or on the table. */
const LANDING_MS = 220;

/** Cards just dropped into the hand or onto the table, gliding into place (see `landing` in Table). */
interface Landing {
  zone: 'hand' | 'table';
  /** The dropped cards, hidden until the glide ends. The first is the one shown gliding. */
  iids: string[];
  cardId: string;
  faceUp: boolean;
  /** It lands facing the other way from how it was held (onto a stack facing that way), so it turns as it lands. */
  turns?: boolean;
  /** The width the glide starts at: the held stack's. */
  width: number;
  /** The first card's layout when it was dropped, to tell when it has been laid out in its new place. */
  before?: Rect;
  /** The glide has finished and the real cards are showing; the stand-in goes a moment later. */
  revealed?: boolean;
  /** Where the card lands relative to its spot: on top of a stack it sits risen above the pile (see leanOffset). */
  rise: { x: number; y: number };
  /** The card's view is already in its final place, so the glide can start straight away. */
  settled?: boolean;
  /**
   * The dropped cards make up the whole pile where they land: a stack picked up by its count and put down on
   * its own. The pile stays hidden while the stand-in, drawn with the pile's edges, glides into place.
   */
  pile?: boolean;
}

/** How many card edges the stand-in for a landing stack is drawn with. */
const LANDING_EDGES = 6;

/**
 * Where carried cards would go: a position between the cards in the hand (counting the cards there that
 * aren't being carried), or a free spot in the table's grid.
 */
type InsertAt = { zone: 'hand'; index: number } | { zone: 'table'; spot: Spot };

const sameSpot = (a: Spot | undefined, b: Spot | undefined) => a?.row === b?.row && a?.col === b?.col;
function sameInsert(a: InsertAt | null, b: InsertAt | null): boolean {
  if (!a || !b) return a === b;
  if (a.zone === 'hand') return b.zone === 'hand' && a.index === b.index;
  return b.zone === 'table' && sameSpot(a.spot, b.spot);
}

interface HeldCard {
  iid: string;
  cardId: string;
  from: Zone;
}

/** A card picked up mid-drag, on its way to the held stack (see `pickups` in Table). */
interface Pickup {
  card: HeldCard;
  /** Where it was drawn when picked up, on the flat table: top-left corner and width. */
  from: { x: number; y: number; w: number };
  /** Which way up it lay there; it turns to the held stack's way on the way over. */
  faceUp: boolean;
}

/** The icon for turning a card or stack over. */
const FLIP_ICON: SheetTile['icon'] = { ios: 'arrow.triangle.2.circlepath', android: 'flip', web: 'flip' };

/** How long a card picked up mid-drag takes to fly onto the held stack. */
const PICKUP_MS = 260;

/**
 * A card flying to its new place after a change made without dragging it: drawn, moved from a menu, a hand
 * discarded, the discard pile shuffled back in, the table reset, an action undone (see `moveCards`).
 */
interface Flight {
  iid: string;
  cardId: string;
  /** Where it was drawn before the change, on the flat table: top-left corner and width. */
  from: { x: number; y: number; w: number };
  /** Where it's drawn now; measured once the change has been laid out. */
  to?: { x: number; y: number; w: number };
  fromFaceUp: boolean;
  toFaceUp: boolean;
  /** When it sets off, after the flights before it, so several cards go one after another. */
  delay: number;
  /** Where it's going. */
  zone: Zone;
  /** Which change sent it, so a card sent off again (say, by an undo) starts a fresh flight. */
  batch: number;
  /**
   * It has landed and the real card is showing underneath; the flying copy stays over it a moment longer, until
   * the real card's picture is surely drawn, so there's no blank frame at the hand-over.
   */
  landed?: boolean;
  /** The last of its batch: its landing is felt (see `moveCards`). */
  thud?: boolean;
  /**
   * A stack turning over where it lies (see `flipStack`): it starts as the old top card (`fromCardId`) and turns
   * to show the new one. The stack stays as it is underneath (its count included), its top card hidden.
   */
  turn?: boolean;
  fromCardId?: string;
}

/** How long a menu takes to get out of the way, for something it asked for to be seen happening. */
const SHEET_CLEAR_MS = 200;
/** How long each card takes to fly to its new place. */
const FLIGHT_MOVE_MS = 320;
/** The gap between one card setting off and the next. */
const FLIGHT_STAGGER_MS = 45;
/** At most this many cards visibly come off one pile in one go; the rest are inside it and just move. */
const FLIGHTS_FROM_PILE = 4;
/** At most this many cards fly in one go; any more just move. */
const MAX_FLIGHTS = 24;

interface PressOptions {
  /** `wholeStack`: the press was on a table stack's count (see `stack`). */
  onPress?: (wholeStack?: boolean) => void;
  onLongPress?: () => void;
  verticalOnly?: boolean;
  /**
   * A stack on the table: its cards (top first) and its size. Dragging from its count, in the bottom-right
   * corner, picks up the whole stack; dragging from anywhere else takes just its top card.
   */
  stack?: { cards: CardInstance[]; w: number; h: number };
}

/** How far in from a stack's bottom-right corner (where its count is) a press grabs the whole stack. */
const STACK_HANDLE = 40;

interface PageProps {
  /** Whether this table is the one on screen. Only the active table sets the screen header. */
  active?: boolean;
  /** Told when a finger lands on a card (true) and when that touch ends (false), so a session pager can hold still. */
  onTouchingCard?: (touching: boolean) => void;
}

/**
 * A deck's play table: piles, play area and hand, or reveal mode. Loads and saves the deck's table state,
 * which is kept separately for each session (`sessionId`) and for playing the deck on its own.
 */
export function DeckTable({
  deckId,
  sessionId,
  active = true,
  onTouchingCard,
}: PageProps & { deckId: string; sessionId?: string }) {
  const decks = useDecks();
  const deck = decks.getDeck(deckId);
  const [table, setTable] = useState<TableState | undefined>(() => decks.getTable(deckId, sessionId));

  useEffect(() => {
    if (table) decks.setTable(deckId, sessionId, table);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- save only when the table itself changes
  }, [table]);

  if (!deck || !table) {
    return (
      <View style={[styles.felt, styles.center]}>
        <Text style={styles.muted}>This deck no longer exists.</Text>
      </View>
    );
  }
  return (
    // Cards and piles read this to cast their shadows on the cloth.
    <OnTabletopContext.Provider value>
      <Table
        deck={deck}
        table={table}
        setTable={setTable}
        setMode={(mode) => decks.setPlayMode(deck.id, mode)}
        active={active}
        onTouchingCard={onTouchingCard}
      />
    </OnTabletopContext.Provider>
  );
}

function Table({
  deck,
  table,
  setTable,
  setMode,
  active,
  onTouchingCard,
}: PageProps & {
  deck: Deck;
  table: TableState;
  setTable: Dispatch<SetStateAction<TableState | undefined>>;
  setMode: (mode: PlayMode) => void;
}) {
  const mode: PlayMode = deck.playMode ?? 'table';
  const reveal = mode === 'reveal';
  const { width, height: windowHeight } = useWindowDimensions();
  /** The whole screen, for showing a card full size over a menu. */
  const screen = { w: width, h: windowHeight };
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<Sheet>({ kind: 'table' });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchZone, setSearchZone] = useState<SearchPile | null>(null);
  // The search stays up while it slides away after closing.
  const [searchMounted, setSearchMounted] = useState(false);
  if (searchZone && !searchMounted) setSearchMounted(true);
  /** Cards have been dragged out of the search and are being carried over the table (see 	akeOutOfSearch). */
  const [searchLeaving, setSearchLeaving] = useState(false);
  const [toast, setToast] = useState<{ msg: string } | null>(null);
  /**
   * Cards a second finger has just picked up, flying from where they lay onto the held stack. They're in the
   * held stack already; it just doesn't show them (or count them) until they land.
   */
  const [pickups, setPickups] = useState<Pickup[]>([]);
  /** Cards flying to their new places (see `moveCards`). Each is hidden there until it lands. */
  const [flights, setFlights] = useState<Flight[]>([]);
  /** A riffle waiting for cards flying back to the deck to land before it plays. */
  const [riffleWaiting, setRiffleWaiting] = useState(false);
  /** Numbers each batch of flights (see planFlights). */
  const flightBatch = useMemo(() => {
    const box = { n: 0 };
    return { next: () => Object.assign(box, { n: box.n + 1 }).n };
  }, []);
  /** How the table was before each of the last few actions, oldest first, for undo. Kept while it's open. */
  const [history, setHistory] = useState<TableState[]>([]);
  /** A riffle playing over the deck, by when it started (see `shuffleDeck`). */
  const [shuffling, setShuffling] = useState<number | null>(null);
  /** How much of the deck's pile is on the table, which drops away and builds back up during a riffle. */
  const [deckHeight] = useState(() => new Animated.Value(1));
  /**
   * The deck's real top card during a riffle: gone as the halves lift off, and fading back in under the last
   * cards to land, so its shadow is already there when the riffle ends, rather than popping in.
   */
  const [deckTopShown] = useState(() => deckHeight.interpolate({ inputRange: [0.85, 1], outputRange: [0, 1], extrapolate: 'clamp' }));

  // Drag and drop. Layouts are relative to the screen's root view, which sits at `rootOrigin` in the window.
  const [drag, setDrag] = useState<Drag | null>(null);
  const [hover, setHover] = useState<Zone | null>(null);
  /** Where the carried cards would go if dropped in the hand or on the table now, shown by a marker. */
  const [insertAt, setInsertAt] = useState<InsertAt | null>(null);
  /** The table card (or stack) the carried cards would be stacked onto if dropped now, outlined in gold. */
  const [stackTarget, setStackTarget] = useState<string | null>(null);
  /** How far the held stack has moved from where it was picked up, kept outside React state (it changes every frame). */
  const lastPan = useMemo(() => {
    const now = { x: 0, y: 0 };
    return { get: () => now, set: (p: { x: number; y: number }) => Object.assign(now, p) };
  }, []);
  /**
   * Over a stack target the held stack leaves the finger and settles onto the target, at table size, exactly
   * where it would land (see `snapTo`). `on` is while it's settled there; `returning` while it springs back to
   * the finger. Either way the finger doesn't move it. `x`, `y`, `scale` are where and how big it's shown.
   */
  // `leftSource`: the finger has been off the stack the held card came from, so it may now go back onto it.
  const snap = useMemo(() => {
    const now = { on: false, returning: false, x: 0, y: 0, scale: 1, leftSource: false };
    return { get: () => now, set: (p: Partial<typeof now>) => Object.assign(now, p) };
  }, []);
  // Cards dropped into the hand or onto the table glide from where they were let go into their new place. The
  // real cards wait, hidden, until they're laid out there; then a stand-in card flies to them and they appear.
  const [landing, setLanding] = useState<Landing | null>(null);
  /** The table's flat layer (inside any tilt), which landing cards are measured against. */
  const stageRef = useRef<View>(null);
  /** Each card's view in the hand and on the table, so a landing card can be measured exactly. */
  const cardViews = useMemo(() => {
    const views = new Map<string, View>();
    return {
      get: (iid: string) => views.get(iid),
      track: (iid: string, view: View | null) => {
        if (view) views.set(iid, view);
        else views.delete(iid);
      },
    };
  }, []);
  const [landingAnim] = useState(() => ({
    pos: new Animated.ValueXY(),
    scale: new Animated.Value(1),
    /** How much of the held stack's big "lifted" shadow is left: it fades as the card settles onto the table. */
    lift: new Animated.Value(1),
  }));
  const [pan] = useState(() => new Animated.ValueXY());
  /** The held stack's growth from its own size to the lifted size, as a fraction of the lifted size. */
  const [liftGrow] = useState(() => new Animated.Value(1));
  /** The stack-target preview count's size as it pops in. */
  const [badgePop] = useState(() => new Animated.Value(0));
  /** A stack (by its new top card) whose count should pop because cards were just dropped on it. */
  const [poppedStack, setPoppedStack] = useState<string | null>(null);
  const [dropPop] = useState(() => new Animated.Value(1));
  // Pops start once the count is on screen: started before its view exists, an animation never reaches it.
  // Layout effects, so the count starts small rather than showing full size for a frame first.
  useLayoutEffect(() => {
    if (!stackTarget) return;
    badgePop.setValue(0);
    Animated.spring(badgePop, { toValue: 1, speed: 14, bounciness: 14, useNativeDriver: true }).start();
  }, [stackTarget, badgePop]);
  useLayoutEffect(() => {
    if (!poppedStack) return;
    dropPop.setValue(0);
    Animated.spring(dropPop, { toValue: 1, speed: 14, bounciness: 14, useNativeDriver: true }).start(() => setPoppedStack(null));
  }, [poppedStack, dropPop]);
  const [rootOrigin, setRootOrigin] = useState<{ x: number; y: number } | null>(null);
  const rootRef = useRef<View>(null);
  // Measured on layout and again whenever a finger lands: in a session pager this table slides sideways,
  // so where it sat when it was laid out (possibly off screen) isn't where it is when touched.
  const measureRoot = () => rootRef.current?.measureInWindow((x, y) => setRootOrigin({ x, y }));
  const [layout, setLayout] = useState<Partial<Record<LayoutKey, Rect>>>({});
  /** A card on its way from the deck to the discard pile after a reveal. */
  // `landed`: it has reached the discard pile and the real card is there underneath; the flying one stays on
  // top until the real one's picture is on screen, so swapping them never shows a blank frame.
  const [flying, setFlying] = useState<{
    iid: string;
    cardId: string;
    faceUp: boolean;
    /** Where it lands, on the flat table. */
    to?: { x: number; y: number };
    landed?: boolean;
  } | null>(null);
  const [flight] = useState(() => ({ pos: new Animated.ValueXY(), scale: new Animated.Value(1) }));
  /** The flying card is gone once the real top card of the discard pile has been drawn under it. */
  const flightDone = (iid: string) => setFlying((f) => (f?.landed && f.iid === iid ? null : f));
  /** The card (by instance, so its neighbours can be found) blown up to nearly full screen, if any. */
  const [zoomed, setZoomed] = useState<string | null>(null);
  /** A card shown full size over its menu (see `cardMenu`). */
  const [menuZoom, setMenuZoom] = useState<string | null>(null);
  const [rootSize, setRootSize] = useState({ w: 0, h: 0 });

  // The tabletop's camera tilt. Everything on the table is laid out flat and drawn tilted, so screen positions
  // (fingers) are converted back onto the flat table before comparing them with any layout.
  const tilt = fitTilt(rootSize, TILT_ANGLE, TILT_PERSPECTIVE);
  /** A window position as a point on the (flat) table, or null before the table has been measured. */
  const toTable = (pageX: number, pageY: number) =>
    rootOrigin ? unproject(pageX - rootOrigin.x, pageY - rootOrigin.y, rootSize, tilt) : null;
  /** How far a finger has moved across the table since it was at (startX, startY) on screen. */
  const tableDelta = (startX: number, startY: number, now: NativeTouchEvent) => {
    const a = toTable(startX, startY);
    const b = toTable(now.pageX, now.pageY);
    return a && b ? { x: b.x - a.x, y: b.y - a.y } : { x: now.pageX - startX, y: now.pageY - startY };
  };

  /** The card just turned over onto the discard pile, which flips face up as it lands. */
  const [revealed, setRevealed] = useState<string | null>(null);
  // Read the event now: React clears it before a state updater would run.
  const measure = (key: LayoutKey) => (e: LayoutChangeEvent) => {
    const rect = toRect(e);
    setLayout((l) => ({ ...l, [key]: rect }));
  };
  // Where each card in the hand and on the table sits inside its scroll view, and how far those are scrolled,
  // so a second finger's tap can be matched to the card under it while another card is held.
  const [cardLayouts, setCardLayouts] = useState<Record<string, Rect>>({});
  const [scroll, setScroll] = useState({ play: 0, hand: 0 });
  // Callers pass the offset, read straight from the event: like layout events, scroll events are cleared
  // before a state updater would get to read them.
  const trackScroll = (key: 'play' | 'hand', offset: number) => setScroll((s) => ({ ...s, [key]: offset }));
  // While cards are held the scroll views' own scrolling is off (it would steal the holding finger), so a second
  // finger scrolls them from here. These are the views themselves and how big their content is.
  const [scrollViews, setScrollViews] = useState<{ play?: ScrollView | null; hand?: ScrollView | null }>({});
  // Created once: a new ref callback each render would be detached and re-attached, re-rendering forever.
  const [attachPlayView] = useState(
    () => (view: ScrollView | null) => setScrollViews((v) => (v.play === view ? v : { ...v, play: view })),
  );
  const [attachHandView] = useState(
    () => (view: ScrollView | null) => setScrollViews((v) => (v.hand === view ? v : { ...v, hand: view })),
  );
  const [contentSize, setContentSize] = useState({ play: 0, hand: 0 });
  const measureCard = (iid: string) => (e: LayoutChangeEvent) => {
    const rect = toRect(e);
    setCardLayouts((all) => ({ ...all, [iid]: rect }));
  };

  // Sizes are tuned for upright cards; sideways ones get wider so they aren't tiny.
  const ratio = cardRatio(deck);
  const wide = ratio > 1 ? 1.35 : 1;
  const pileWidth = reveal
    ? // The two piles stack beside the button column; leave room for each pile's depth (at most 14pt).
      Math.min(
        width - 32 - REVEAL_RAIL - pileThickness(width) - 8,
        layout.reveal ? ((layout.reveal.h - insets.bottom - REVEAL_CHROME) / 2 - pileThickness(width)) * ratio : 0,
      )
    : // Two piles share the row with the buttons, so keep at least ~110pt for those.
      // Each pile also needs room for its depth, about 8% of its width.
      Math.min(Math.min(96, width * 0.2) * wide, ((width - 32 - 24 - 110) / 2 - 8) / 1.08);
  const handWidth = Math.min(110, width * 0.24) * wide;
  const tableCardWidth = Math.min(90, width * 0.2) * wide;
  // The play table's grid: as many columns as fit across, spread evenly. Rows go on down as far as needed.
  const cellH = tableCardWidth / ratio;
  const gridWidth = (layout.play?.w ?? 0) - PLAY_BORDER * 2 - GRID_PAD * 2;
  const gridReady = !reveal && gridWidth > tableCardWidth;
  const cols = gridReady ? Math.max(1, Math.floor((gridWidth + GRID_GAP) / (tableCardWidth + GRID_GAP))) : 1;
  const colStep = cols > 1 ? (gridWidth - tableCardWidth) / (cols - 1) : 0;
  const rowStep = cellH + GRID_GAP;
  /** Where a grid spot's card goes, within the play area's content. */
  const spotPlace = (s: Spot) => ({ position: 'absolute' as const, left: GRID_PAD + s.col * colStep, top: GRID_PAD + s.row * rowStep });
  const cardsById = new Map(deck.cards.map((c) => [c.id, c]));
  const missing = T.missingCards(table, deck).length;

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 1200);
    return () => clearTimeout(timer);
  }, [toast]);

  // A new object each time, so repeating the same message restarts the timer.
  const flash = (msg: string) => setToast({ msg });

  const apply = (fn: (t: TableState) => TableState, msg?: string) => {
    // Remember how the table was, to undo back to.
    setHistory((h) => [...h.slice(-(UNDO_STEPS - 1)), table]);
    setTable((t) => (t ? fn(t) : t));
    if (msg) flash(msg);
  };

  // An action that changed nothing leaves the table as it was in the history; those steps are skipped.
  const undoTo = (() => {
    for (let i = history.length - 1; i >= 0; i--) if (history[i] !== table) return i;
    return -1;
  })();
  /** Not while cards are in motion: held, flying from the deck, or still gliding into place. */
  const canUndo = undoTo !== -1 && !drag?.active && !flying && !landing && !flights.length;

  /** Puts the table back as it was before the last thing done to it. */
  const undo = () => {
    if (!canUndo) return;
    const previous = history[undoTo];
    setHistory(history.slice(0, undoTo));
    animateLayout();
    setTable(previous);
    // Cards fly back to where they were.
    if (!prefersReducedMotion()) launch(planFlights(table, previous));
    // Anything still playing for what's being undone stops: a riffle (or one about to start), and the deck's
    // pile with it.
    setRiffleWaiting(false);
    setShuffling(null);
    deckHeight.stopAnimation();
    deckHeight.setValue(1);
    setRevealed(null);
    haptics.tick();
    flash('Undone');
  };

  /**
   * Shuffles the deck (or does something else that ends with it shuffled, e.g. shuffling the discard pile back
   * in) and plays a riffle over it. With motion turned down there's just a tap to feel it happen.
   */
  const shuffleDeck = (fn: (t: TableState) => TableState = (t) => T.shuffleZone(t, 'deck'), msg = 'Shuffled') => {
    // The riffle shows it happened, so there's no message, unless motion is turned down and it can't play.
    if (prefersReducedMotion()) {
      apply(fn, msg);
      haptics.success();
      return;
    }
    // Any cards coming back to the deck fly there first; then it's riffled (see `riffleWaiting`).
    moveCards(fn);
    setRiffleWaiting(true);
  };

  /**
   * Cards dragged out of the search (top first), with the finger still on them: they become a normal drag
   * over the table, as if picked up there, to drop anywhere. The search gets out of the way, and closes once
   * they've been dropped. They're held face up, as they were seen in the search.
   */
  const takeOutOfSearch = (zone: SearchPile, iids: string[], finger: Finger, grip: Grip) => {
    const held = iids.flatMap((iid) => table[zone].filter((c) => c.iid === iid));
    if (!held.length) return;
    pan.setValue({ x: 0, y: 0 });
    lastPan.set({ x: 0, y: 0 });
    snap.set({ on: false, returning: false, leftSource: false });
    const w = tableCardWidth;
    // Starts at the size it was held at in the search, and grows (or shrinks) to the held size here once it's
    // on screen (see `drag.shown`).
    liftGrow.setValue(grip.width / (w * LIFTED_SCALE));
    setDrag({
      iid: held[0].iid,
      cardId: held[0].cardId,
      from: zone,
      width: w,
      verticalOnly: false,
      touchId: finger.identifier,
      startX: finger.pageX,
      startY: finger.pageY,
      // Held at the same point on the card as in the search.
      offX: (grip.offX / grip.width) * w * 1.08,
      offY: (grip.offY / grip.width) * w * 1.08,
      pressedAt: Date.now(),
      zoomable: false,
      active: true,
      abandoned: false,
      // The finger's touch began in the search, not on a card here: the screen's own touch events carry it.
      orphaned: true,
      startFaceUp: true,
      faceUp: true,
      stack: held.map((c) => ({ iid: c.iid, cardId: c.cardId, from: zone })),
      wholeStack: false,
      fromSearch: true,
      shown: false,
    });
    setSearchLeaving(true);
    onTouchingCard?.(true);
  };

  // While searching, a session's deck pager holds still, so sideways drags in the search don't change deck.
  useEffect(() => {
    if (searchZone) onTouchingCard?.(true);
    else if (!zoomed) onTouchingCard?.(false);
    // Only as the search opens and closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchZone !== null]);

  // Once cards taken out of the search have been dropped, the search closes. (Updated while rendering, React's
  // pattern for state that follows other state.)
  if (searchLeaving && !drag) {
    setSearchLeaving(false);
    setSearchZone(null);
  }

  // The riffle plays once every card flying back to the deck has landed (at once, if none are). Started while
  // rendering, React's pattern for state that follows other state; a new number each time, so shuffling again
  // mid-riffle starts it over.
  if (riffleWaiting && !flights.some((f) => f.zone === 'deck' && !f.landed)) {
    setRiffleWaiting(false);
    setShuffling((n) => (n ?? 0) + 1);
  }
  // The deck's pile drops away and builds back up with each riffle.
  useEffect(() => {
    if (shuffling !== null) riffleHeight(deckHeight).start();
  }, [shuffling, deckHeight]);

  /**
   * The deck is being shuffled, or cards are still flying onto it: it can't be drawn from or revealed until it's
   * settled, or a card could leave from the wrong place (or one still on its way).
   */
  const deckBusy = shuffling !== null || riffleWaiting || flights.some((f) => f.zone === 'deck' && !f.landed);

  /** Deals the deck's top card into the hand. */
  const drawOne = () => {
    if (!table.deck.length || deckBusy) return;
    moveCards((t) => T.draw(t, 1));
    haptics.deal();
  };

  const open = (s: Sheet) => {
    setSheet(s);
    setSheetOpen(true);
  };

  const confirmReset = () =>
    Alert.alert('Reset the table?', 'Every card goes back into the deck, face down.', [
      { text: 'Shuffled', onPress: () => shuffleDeck(T.resetTable, 'Shuffled') },
      {
        text: 'In deck order',
        onPress: () => {
          moveCards(() => T.orderedTable(deck), 'Back in deck order');
          haptics.success();
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);

  /**
   * A card's menu: where it can go, as a grid of tiles (its own place dimmed), and turning it over. For a card
   * in a table stack with `wholeStack`, the same tiles move the whole stack, and it turns over as a whole. To a
   * pile, a stack's top card ends up on top; into the hand, its cards are laid out top card first.
   *
   * Its Full size tile calls `onFullSize`, to show the card full size over the menu.
   */
  const cardMenu = (
    iid: string,
    from: Zone,
    wholeStack = false,
    onFullSize?: () => void,
  ): { tiles: SheetTile[]; actions: SheetAction[] } => {
    const group = from === 'table' ? T.stackGroups(table.table).find((g) => g.some((c) => c.iid === iid)) : undefined;
    const stack = wholeStack && group && group.length > 1 ? group.map((c) => c.iid).reverse() : null;
    // Felt as the cards are put down where they're going.
    const go = (fn: (t: TableState) => TableState, msg?: string) => () => {
      moveCards(fn, msg, true);
    };
    const moveTo = (zone: Zone, position?: T.Position) => (t: TableState) => {
      if (!stack) return T.moveCard(t, iid, zone, position);
      if (position === 'bottom') return stack.reduce((s, id) => T.moveCard(s, id, zone, 'bottom'), t);
      return T.moveCards(t, stack, zone);
    };
    const tile = (label: string, icon: SheetTile['icon'], zone: Zone, position?: T.Position): SheetTile => ({
      label,
      icon,
      // Already there (except the deck, where it can still move to the top or bottom).
      disabled: zone === from && zone !== 'deck',
      destructive: zone === 'trash',
      onPress: go(moveTo(zone, position), zone === 'trash' ? 'Moved to the trash' : undefined),
    });
    // A face-down card on the table or in the hand can't be looked at; in the search every card is face up.
    const found = T.findCard(table, iid);
    const canView = from === 'deck' || from === 'discard' || from === 'trash' || !!(found && table[found.zone][found.index].faceUp);
    const tiles: SheetTile[] = [
      {
        label: 'Full size',
        icon: { ios: 'arrow.up.left.and.arrow.down.right', android: 'open_in_full', web: 'open_in_full' },
        disabled: !canView || !onFullSize,
        // Shown over the menu, which stays open underneath.
        keepsOpen: true,
        onPress: () => onFullSize?.(),
      },
      // Turning over: a whole stack as one, or a single card (not one in a stack: a stack's cards all face the
      // same way).
      ...(stack
        ? [{ label: 'Flip over', icon: FLIP_ICON, onPress: () => flipStack(iid) }]
        : !reveal && (from === 'hand' || (from === 'table' && !(group && group.length > 1)))
          ? [{ label: 'Flip over', icon: FLIP_ICON, onPress: () => apply((t) => T.flip(t, iid)) }]
          : []),
      ...(reveal
        ? []
        : [
            tile('Hand', { ios: 'hand.raised', android: 'back_hand', web: 'back_hand' }, 'hand'),
            tile('Table', { ios: 'square.grid.2x2', android: 'grid_view', web: 'grid_view' }, 'table'),
          ]),
      tile('Deck top', { ios: 'arrow.up.to.line', android: 'vertical_align_top', web: 'vertical_align_top' }, 'deck', 'top'),
      tile('Deck bottom', { ios: 'arrow.down.to.line', android: 'vertical_align_bottom', web: 'vertical_align_bottom' }, 'deck', 'bottom'),
      tile('Discard', { ios: 'rectangle.stack', android: 'layers', web: 'layers' }, 'discard'),
      // Out of the game, but it can be found in the search's Trash and brought back.
      tile('Trash', { ios: 'trash', android: 'delete', web: 'delete' }, 'trash'),
    ];
    return { tiles, actions: [] };
  };


  /** Turns the top card of the deck face up onto the discard pile. */
  const revealNext = () => {
    const top = table.deck[0];
    if (!top || flying || deckBusy) return;
    // Felt as it comes off the deck, and again as it lands on the discard pile.
    haptics.deal();
    const move = () => apply((t) => T.moveCard(t, top.iid, 'discard'));
    const from = zoneRects.find(([z]) => z === 'deck')?.[1];
    const to = zoneRects.find(([z]) => z === 'discard')?.[1];
    if (!from || !to || prefersReducedMotion()) {
      // No room to animate (or motion turned down): just land it, flipping in place.
      setRevealed(top.iid);
      move();
      return;
    }
    // The card lifts off the deck, turns face up on the way, and lands on the discard pile; only then is it
    // actually moved there. Meanwhile it counts as gone from the deck and not yet on the discard pile.
    // A pile's top card rises above its spot by the pile's height: start on the deck's current top card and
    // land where the discard pile's top card will be once this one is on it.
    const lift = leanOffset(pileLean('deck'), pileRise(pileWidth, table.deck.length));
    const land = leanOffset(pileLean('discard'), pileRise(pileWidth, table.discard.length + 1));
    flight.pos.setValue({ x: from.x + PILE_INSET + lift.x, y: from.y + PILE_INSET + lift.y });
    flight.scale.setValue(1);
    // It sets off once its view is on screen (see below).
    setFlying({ iid: top.iid, cardId: top.cardId, faceUp: false, to: { x: to.x + PILE_INSET + land.x, y: to.y + PILE_INSET + land.y } });
  };

  // A revealed card's flight, started once its view is there: the native driver can't move a view that doesn't
  // exist yet. Its timers are cleared if the table goes away mid-flight.
  const flyingId = flying && !flying.landed ? flying.iid : null;
  useLayoutEffect(() => {
    if (!flyingId || !flying?.to) return;
    const iid = flyingId;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setFlying((f) => (f?.iid === iid ? { ...f, faceUp: true } : f)), FLIGHT_MS * 0.2));
    const half = { duration: FLIGHT_MS / 2, useNativeDriver: true };
    Animated.parallel([
      Animated.timing(flight.pos, { toValue: flying.to, duration: FLIGHT_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }),
      // Rises a little mid-flight, then settles onto the pile.
      Animated.sequence([
        Animated.timing(flight.scale, { toValue: 1.12, easing: Easing.out(Easing.quad), ...half }),
        Animated.timing(flight.scale, { toValue: 1, easing: Easing.in(Easing.quad), ...half }),
      ]),
    ]).start(({ finished }) => {
      if (!finished) return;
      haptics.drop();
      // Put the real card on the pile under the flying one; the flying one goes once that's drawn (or after a
      // moment, if its picture is slow to report).
      apply((t) => T.moveCard(t, iid, 'discard'));
      setFlying((f) => (f?.iid === iid ? { ...f, landed: true } : f));
      setTimeout(() => flightDone(iid), 150);
    });
    return () => timers.forEach(clearTimeout);
    // Once per revealed card.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyingId]);

  const switchMode = (next: PlayMode) => {
    setMode(next);
    haptics.tick();
    const outside = table.hand.length + table.table.length;
    if (next !== 'reveal' || outside === 0) return;
    // Reveal mode only shows the deck and discard pile, so offer to clear cards that would be hidden.
    Alert.alert(
      `${outside} ${outside === 1 ? 'card is' : 'cards are'} in your hand or on the table`,
      'Reveal mode only shows the deck and discard pile.',
      [
        { text: 'Keep them aside', style: 'cancel' },
        {
          text: 'Discard them',
          onPress: () => apply((t) => ({ ...t, hand: [], table: [], discard: [...t.hand, ...t.table].map((c) => ({ ...c, faceUp: true })).concat(t.discard) })),
        },
      ],
    );
  };

  // ---- Drop zones and the FLIP button, in root-view coordinates ----

  const within = (parent: Rect | undefined, child: Rect | undefined) =>
    parent && child ? { ...child, x: parent.x + child.x, y: parent.y + child.y } : undefined;
  const playRect = layout.play;
  const handRect = layout.hand;
  const zoneRects: [Zone, Rect | undefined, number][] = reveal
    ? [
        ['deck', within(layout.reveal, within(layout.revealPiles, layout.revealDeck)), PILE_PAD],
        ['discard', within(layout.reveal, within(layout.revealPiles, layout.revealDiscard)), PILE_PAD],
      ]
    : [
        ['deck', within(layout.piles, layout.deckPile), PILE_PAD],
        ['discard', within(layout.piles, layout.discardPile), PILE_PAD],
        ['hand', handRect, 0],
        ['table', playRect, 0],
      ];
  // ---- Perspective: which way each pile leans (see viewpoint.ts) ----
  // Seen from above a point low on the table (VIEW_DOWN of the way down), so piles lean away from it, more the
  // further out they are, and most of them lean up. A pile half the screen's width away leans by its full
  // thickness.
  const viewCenter = { x: rootSize.w / 2, y: rootSize.h * VIEW_DOWN };
  const leanReach = Math.max(1, width / 2);
  /** How the deck or discard pile leans, from where its top card lies on the (flat) table. */
  const pileLean = (z: 'deck' | 'discard'): Lean => {
    const r = zoneRects.find(([zone]) => zone === z)?.[1];
    if (!r) return { x: 0, y: 0 };
    return leanAt({ x: r.x + PILE_INSET + pileWidth / 2, y: r.y + PILE_INSET + pileWidth / ratio / 2 }, viewCenter, leanReach);
  };
  /** How a stack in this grid spot leans, from where it lies on the (flat) table, scrolling included. */
  const spotLean = (s: Spot): Lean => {
    if (!playRect) return { x: 0, y: 0 };
    const { left, top } = spotPlace(s);
    return leanAt(
      { x: playRect.x + PLAY_BORDER + left + tableCardWidth / 2, y: playRect.y + PLAY_BORDER + top - scroll.play + cellH / 2 },
      viewCenter,
      leanReach,
    );
  };
  // The eye moves as the phone tilts, while this table is the one on screen.
  useViewTilt(active !== false && !prefersReducedMotion());

  // In reveal mode the piles decide which way up a card lies, so there is nothing to flip.
  const flipRect: Rect | undefined = !reveal && playRect ? {
    x: playRect.x + (playRect.w - FLIP_SIZE.w) / 2,
    y: playRect.y + playRect.h - FLIP_SIZE.h - 16,
    ...FLIP_SIZE,
  } : undefined;

  /**
   * The trash can that appears while cards are being dragged, in the bottom-right corner of the play area (or of
   * the screen, in reveal mode). Cards dropped on it go to the trash.
   */
  const trashRect: Rect | undefined = playRect
    ? { x: playRect.x + playRect.w - TRASH_SIZE - 14, y: playRect.y + playRect.h - TRASH_SIZE - 16, w: TRASH_SIZE, h: TRASH_SIZE }
    : reveal && rootSize.w
      ? { x: rootSize.w - TRASH_SIZE - 16, y: rootSize.h - insets.bottom - TRASH_SIZE - 16, w: TRASH_SIZE, h: TRASH_SIZE }
      : undefined;
  // Checked first, as it sits over the play area.
  const dropZones: [Zone, Rect | undefined, number][] = drag?.active ? [['trash', trashRect, PILE_PAD], ...zoneRects] : zoneRects;

  const zoneAt = (pageX: number, pageY: number): Zone | null => {
    const p = toTable(pageX, pageY);
    return p ? (dropZones.find(([, r, pad]) => r && inside(r, p.x, p.y, pad))?.[0] ?? null) : null;
  };

  const onFlipButton = (t: NativeTouchEvent) => {
    const p = toTable(t.pageX, t.pageY);
    return !!p && !!flipRect && inside(flipRect, p.x, p.y, PILE_PAD);
  };

  /**
   * Slides cards into place on the next layout change, e.g. closing the gap a picked-up card leaves. Only
   * movement is animated: fading new views in would make the piles blink out for a moment after a drop, since
   * their top card is swapped for a fresh view.
   */
  const animateLayout = () =>
    LayoutAnimation.configureNext({ duration: 180, update: { type: LayoutAnimation.Types.easeInEaseOut } });

  const isHeld = (iid: string | undefined) => !!iid && !!drag?.active && drag.stack.some((h) => h.iid === iid);
  /**
   * Carried, and its lifted copy is on screen: only then does the card itself vanish from where it was (as a
   * blank space in a row, or from the top of a pile), so nothing blinks out while the copy appears.
   */
  const carriedAway = (iid: string) => isHeld(iid) && !!drag?.shown;
  /** Held in a drag, or mid-flight after a reveal: either way, not shown on its pile. */
  /** Flying to its new place after a change (see `moveCards`): it's there, but not shown there until it lands. */
  const arriving = (iid: string) => flights.some((f) => f.iid === iid && !f.landed && !f.turn);
  /** The top card of a stack that's turning over (see `flipStack`), hidden under its turning copy. */
  const turningOver = (iid: string) => flights.some((f) => f.iid === iid && !f.landed && f.turn);
  const isAway = (iid: string) => isHeld(iid) || flying?.iid === iid || arriving(iid);
  /** As `isAway`, for drawing: a just-lifted card stays on its pile until its lifted copy is showing. */
  const drawnAway = (iid: string) => carriedAway(iid) || (flying?.iid === iid && !flying.landed) || arriving(iid);
  /** The top card of a pile that isn't already in the held stack: what tapping that pile would pick up. */
  const nextFree = (zone: Zone) => table[zone].find((c) => !isAway(c.iid));

  // The play table in groups: each stack together (bottom first), every other card alone. A group is drawn as
  // one card, in the view of its top card (its last), which is the view that's measured; while cards are being
  // carried off it, the next one down shows.
  const tableGroups = T.stackGroups(table.table);
  /** Each group's spot in the grid, in the same order as `tableGroups`. */
  const groupSpots = T.gridSpots(table.table, cols);
  // Cards played without a spot (from a menu, or saved before the grid) are given the first free one, and
  // keep it: otherwise they'd shuffle up whenever a card before them left. Only once the grid's width is known.
  useEffect(() => {
    if (gridReady) setTable((t) => t && T.pinSpots(t, cols));
  }, [table.table, cols, gridReady, setTable]);
  const groupTop = (g: CardInstance[]) => g[g.length - 1];
  /** A group's top card that's still on the table (not being carried), if any. */
  const shownOf = (g: CardInstance[]) => [...g].reverse().find((c) => !isHeld(c.iid));
  /** Where a group is drawn on the (flat) table, or undefined if it isn't laid out yet. */
  const groupRect = (g: CardInstance[]): Rect | undefined => {
    const r = cardLayouts[groupTop(g).iid];
    return r && playRect ? { ...r, x: playRect.x + r.x, y: playRect.y + r.y - scroll.play } : undefined;
  };
  /** The table group (stack or card) at a point on the flat table, ignoring ones being carried away entirely. */
  const groupAt = (x: number, y: number, inset = 0) =>
    tableGroups.find((g) => {
      const r = shownOf(g) && groupRect(g);
      return r && inside({ x: r.x + r.w * inset, y: r.y + r.h * inset, w: r.w * (1 - 2 * inset), h: r.h * (1 - 2 * inset) }, x, y);
    });

  /** The card under a page position, for picking up extra cards mid-drag. */
  const cardAt = (pageX: number, pageY: number): HeldCard | null => {
    const p = toTable(pageX, pageY);
    if (!p) return null;
    const { x, y } = p;
    const laidOut = (zone: 'table' | 'hand', origin: { x: number; y: number }) =>
      table[zone].find((c) => {
        // Held cards are invisible and out of the layout, possibly sitting under a visible one.
        const r = !isHeld(c.iid) && cardLayouts[c.iid];
        return r && inside({ ...r, x: origin.x + r.x, y: origin.y + r.y }, x, y);
      });
    let found: CardInstance | undefined;
    let zone: Zone | null = null;
    // On the table a tap goes to the stack (or card) under it, and takes the stack's top card still there.
    const tableGroup = !reveal && playRect ? groupAt(x, y) : undefined;
    if (tableGroup && (found = shownOf(tableGroup))) {
      zone = 'table';
    } else if (
      !reveal &&
      handRect &&
      layout.handScroll &&
      (found = laidOut('hand', { x: handRect.x + layout.handScroll.x - scroll.hand, y: handRect.y + layout.handScroll.y }))
    ) {
      zone = 'hand';
    } else {
      // Tapping a pile takes its next card, so repeated taps on the deck pick up several.
      const pile = zoneRects.find(([z, r, pad]) => (z === 'deck' || z === 'discard') && r && inside(r, x, y, pad))?.[0];
      if (pile) {
        found = nextFree(pile);
        zone = pile;
      }
    }
    return found && zone ? { iid: found.iid, cardId: found.cardId, from: zone } : null;
  };

  /** Where a card is drawn on the (flat) table right now, as its top-left corner and width: risen, on a pile. */
  const drawnAt = (h: HeldCard): { x: number; y: number; w: number } | null => {
    if (h.from === 'hand') {
      const r = cardLayouts[h.iid];
      if (!r || !handRect || !layout.handScroll) return null;
      return { x: handRect.x + layout.handScroll.x - scroll.hand + r.x, y: handRect.y + layout.handScroll.y + r.y, w: r.w };
    }
    if (h.from === 'table') {
      const i = tableGroups.findIndex((g) => g.some((c) => c.iid === h.iid));
      const r = i === -1 ? undefined : groupRect(tableGroups[i]);
      if (!r) return null;
      const left = tableGroups[i].filter((c) => !isHeld(c.iid)).length;
      const rise = leanOffset(spotLean(groupSpots[i]), pileRise(tableCardWidth, left));
      return { x: r.x + rise.x, y: r.y + rise.y, w: r.w };
    }
    // The trash isn't drawn on the table: its cards are only seen in the search.
    if (h.from === 'trash') return null;
    const left = table[h.from].filter((c) => !isAway(c.iid)).length;
    return pileTopAt(h.from, left);
  };

  /** Where the top card of the deck or discard pile is drawn when the pile has `count` cards. */
  const pileTopAt = (z: 'deck' | 'discard', count: number) => {
    const r = zoneRects.find(([zone]) => zone === z)?.[1];
    if (!r) return null;
    const rise = leanOffset(pileLean(z), pileRise(pileWidth, count));
    return { x: r.x + PILE_INSET + rise.x, y: r.y + PILE_INSET + rise.y, w: pileWidth };
  };

  // ---- Cards flying to their new places ----
  // Changes made without dragging (drawing, menu moves, discarding the hand, shuffling the discard pile in,
  // resetting, undoing) would otherwise make cards jump. Instead each card that changes place flies there from
  // where it was, a little after the one before, and is only shown in its new place once it lands.

  /**
   * Which cards fly for a change from `before` to `after`, and from where. Cards inside a pile can't be seen,
   * so only the first few off a pile fly (from its top card); the rest just move.
   */
  const planFlights = (before: TableState, after: TableState, thud = false): Flight[] => {
    // Each batch gets its own number (from the first flight in it), to key its flights by.
    const batch = flightBatch.next();
    const planned: Flight[] = [];
    const fromPile: Record<string, number> = {};
    for (const zone of ['deck', 'hand', 'table', 'discard'] as Zone[]) {
      for (const c of after[zone]) {
        const was = T.findCard(before, c.iid);
        if (!was || was.zone === zone) continue;
        if (was.zone === 'deck' || was.zone === 'discard') {
          const route = `${was.zone}>${zone}`;
          fromPile[route] = (fromPile[route] ?? 0) + 1;
          if (fromPile[route] > FLIGHTS_FROM_PILE) continue;
        }
        const from = drawnAt({ iid: c.iid, cardId: c.cardId, from: was.zone });
        if (!from) continue;
        planned.push({
          iid: c.iid,
          cardId: c.cardId,
          from,
          fromFaceUp: before[was.zone][was.index].faceUp,
          toFaceUp: c.faceUp,
          delay: 0,
          zone,
          batch,
        });
        if (planned.length === MAX_FLIGHTS) break;
      }
    }
    return planned.map((f, i) => ({ ...f, delay: i * FLIGHT_STAGGER_MS, thud: thud && i === planned.length - 1 }));
  };

  /**
   * Turns a table stack over as a whole, and shows it happen: once the menu that asked for it has gone, its old
   * top card turns over where it lies and comes up as the new top card (the old bottom one).
   */
  const flipStack = (iid: string) => {
    const g = tableGroups.find((grp) => grp.some((c) => c.iid === iid));
    if (!g || g.length < 2) return;
    const oldTop = g[g.length - 1];
    const newTop = g[0];
    const from = drawnAt({ iid: oldTop.iid, cardId: oldTop.cardId, from: 'table' });
    apply((t) => T.turnStackOver(t, iid, cols));
    if (!from || prefersReducedMotion()) return haptics.drop();
    launch([
      {
        iid: newTop.iid,
        cardId: newTop.cardId,
        fromCardId: oldTop.cardId,
        from,
        fromFaceUp: oldTop.faceUp,
        toFaceUp: !oldTop.faceUp,
        // Once the menu has slid away, so it can be seen.
        delay: SHEET_CLEAR_MS,
        zone: 'table',
        batch: flightBatch.next(),
        turn: true,
        thud: true,
      },
    ]);
  };

  /** Sends cards on their way, alongside any still in the air (a card sent off again starts over). */
  const launch = (planned: Flight[]) =>
    setFlights((all) => [...all.filter((f) => !planned.some((p) => p.iid === f.iid)), ...planned]);

  /**
   * Changes the table (as `apply` does), flying each card that changes place to where it ends up. With `thud`,
   * the cards being put down is felt: as the last one lands (or straight away, if none fly).
   */
  const moveCards = (fn: (t: TableState) => TableState, msg?: string, thud = false) => {
    // Worked out once, so a shuffle comes out the same for the flights as for the table.
    const next = fn(table);
    // Cards making room (or closing up) in the hand slide over.
    animateLayout();
    apply(() => next, msg);
    const planned = prefersReducedMotion() ? [] : planFlights(table, next, thud);
    if (planned.length) launch(planned);
    else if (thud) haptics.drop();
  };

  /** Where a card that has just moved is drawn now, on the flat table, once it's laid out there. */
  const measureLanding = (iid: string): Promise<{ x: number; y: number; w: number } | null> => {
    const found = T.findCard(table, iid);
    if (!found) return Promise.resolve(null);
    if (found.zone === 'deck' || found.zone === 'discard') return Promise.resolve(pileTopAt(found.zone, table[found.zone].length));
    // On the table a card is drawn by its stack's top card, risen above the stack's spot.
    const i = found.zone === 'table' ? tableGroups.findIndex((g) => g.some((c) => c.iid === iid)) : -1;
    const group = i === -1 ? undefined : tableGroups[i];
    const view = cardViews.get(group ? groupTop(group).iid : iid);
    const stage = stageRef.current;
    const rise = group ? leanOffset(spotLean(groupSpots[i]), pileRise(tableCardWidth, group.length)) : { x: 0, y: 0 };
    return new Promise((resolve) => {
      if (!view || !stage) return resolve(null);
      view.measureLayout(
        stage,
        (x, y, w) => resolve({ x: x + rise.x, y: y + rise.y, w }),
        () => resolve(null),
      );
    });
  };

  // Once the change has been laid out, find where each flying card has landed, and send it on its way.
  const waitingFlights = flights.filter((f) => !f.to).map((f) => f.iid).join(',');
  useEffect(() => {
    if (!waitingFlights) return;
    let cancelled = false;
    // Two frames: one for the new layout to be drawn, one for its views to be in place to measure.
    const frame = requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        const waiting = flights.filter((f) => !f.to);
        Promise.all(waiting.map((f) => measureLanding(f.iid))).then((tos) => {
          if (cancelled) return;
          const measured = new Map(waiting.map((f, i) => [f.iid, tos[i]]));
          // Any that can't be found (gone, or off screen) just appear where they are.
          setFlights((all) =>
            all.flatMap((f) => {
              if (f.to || !measured.has(f.iid)) return [f];
              const to = measured.get(f.iid);
              return to ? [{ ...f, to }] : [];
            }),
          );
        });
      }),
    );
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
    // Measures once per batch of flights; everything else is read fresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [waitingFlights]);

  /** The furthest a scroll view can scroll, so a second finger can't push it past its ends. */
  const maxScroll = (key: 'play' | 'hand') =>
    key === 'play'
      ? Math.max(0, contentSize.play - (layout.play?.h ?? 0))
      : Math.max(0, contentSize.hand - (layout.handScroll?.w ?? 0));

  const scrollTo = (key: 'play' | 'hand', offset: number) => {
    const clamped = Math.min(maxScroll(key), Math.max(0, offset));
    scrollViews[key]?.scrollTo(key === 'play' ? { y: clamped, animated: false } : { x: clamped, animated: false });
    return clamped;
  };

  const helperOffset = (h: Helper, t: NativeTouchEvent) =>
    h.startOffset - (h.scrolls === 'hand' ? tableDelta(h.startX, h.startY, t).x : tableDelta(h.startX, h.startY, t).y);

  /** A second finger lands while cards are held. FLIP turns the stack over at once; anything else waits to see if it's a tap or a swipe. */
  const helperStart = (touches: NativeTouchEvent[]) => {
    const t = touches.find((c) => c.identifier !== drag?.touchId);
    if (!t) return;
    if (onFlipButton(t)) {
      haptics.tick();
      setDrag((d) => d && { ...d, faceUp: !d.faceUp, stack: d.stack.slice().reverse() });
      return;
    }
    const zone = zoneAt(t.pageX, t.pageY);
    const scrolls = zone === 'hand' ? 'hand' : zone === 'table' ? 'play' : null;
    const helper: Helper = {
      touchId: t.identifier,
      startX: t.pageX,
      startY: t.pageY,
      scrolls,
      startOffset: scrolls ? scroll[scrolls] : 0,
      moved: false,
    };
    setDrag((d) => d && { ...d, helper });
  };

  const helperMove = (touches: NativeTouchEvent[]) => {
    const h = drag?.helper;
    const t = h && touches.find((c) => c.identifier === h.touchId);
    if (!h || !t) return;
    if (!h.moved) {
      if (Math.hypot(t.pageX - h.startX, t.pageY - h.startY) < DRAG_SLOP) return;
      setDrag((d) => (d?.helper ? { ...d, helper: { ...d.helper, moved: true } } : d));
    }
    if (h.scrolls) scrollTo(h.scrolls, helperOffset(h, t));
  };

  /** The second finger lifts: a swipe leaves the view scrolled; a tap picks up the card under it. */
  const helperEnd = (touches: NativeTouchEvent[]) => {
    const h = drag?.helper;
    const t = h && touches.find((c) => c.identifier === h.touchId);
    if (!h || !t) return;
    setDrag((d) => d && { ...d, helper: undefined });
    if (h.moved || Math.hypot(t.pageX - h.startX, t.pageY - h.startY) >= DRAG_SLOP) {
      if (h.scrolls) trackScroll(h.scrolls, scrollTo(h.scrolls, helperOffset(h, t)));
      return;
    }
    const card = cardAt(h.startX, h.startY);
    if (!card || drag?.stack.some((c) => c.iid === card.iid)) return;
    animateLayout();
    haptics.lift();
    // It flies from where it lies onto the held stack, measured before it's taken (and its spot closes up).
    const from = drawnAt(card);
    const original = T.findCard(table, card.iid);
    if (from && original && !prefersReducedMotion()) {
      setPickups((p) => [...p, { card, from, faceUp: table[original.zone][original.index].faceUp }]);
    }
    setDrag((d) => (d && !d.stack.some((c) => c.iid === card.iid) ? { ...d, stack: [card, ...d.stack] } : d));
  };

  const endDrag = () => {
    // Cards dropped (or put back) slide into their new places.
    if (drag?.active) animateLayout();
    setDrag(null);
    // Any cards still flying to the held stack just go with it (they're already in it).
    setPickups([]);
    setHover(null);
    setInsertAt(null);
    setStackTarget(null);
    setRevealed(null);
    // The drag offset is deliberately left alone here: resetting it moves the lifted card back to where it was
    // picked up a moment before it disappears, which flashes it there. The next drag resets it when it starts.
    // A session's pager may move again, unless a card is zoomed: after a hold or pinch opens the zoom, the
    // finger that did it lifts off the card here, and the zoom still needs the pager held.
    onTouchingCard?.(zoomed !== null);
  };

  // Press and hold a face-up card without moving to open it full size. The timer restarts with each press and
  // is cancelled as soon as the card lifts, a pinch starts, or the finger lets go (any of which changes `holdKey`).
  const holding = drag && drag.zoomable && !drag.active && !drag.abandoned && !drag.pinch;
  const holdKey = holding ? drag.pressedAt : null;
  const holdIid = holding ? drag.iid : null;
  useEffect(() => {
    if (holdKey === null || !holdIid) return;
    const timer = setTimeout(() => {
      // The finger stays down, but the press is over: letting go now won't also count as a tap. (The session
      // pager stays held, now on behalf of the zoom; see below.)
      setDrag(null);
      setZoomed(holdIid);
      haptics.liftHeavy();
    }, HOLD_TO_ZOOM_MS);
    return () => clearTimeout(timer);
  }, [holdKey, holdIid]);

  // The lifted copy of a card appears only once its picture is on screen (see `drag.shown`); then it grows from
  // the card's own size to the lifted size. If the picture is slow to report, it goes ahead after a moment.
  const markShown = () => setDrag((d) => (d && d.active && !d.shown ? { ...d, shown: true } : d));
  const liftKey = drag?.active ? drag.pressedAt : null;
  const shownKey = drag?.active && drag.shown ? drag.pressedAt : null;
  useEffect(() => {
    if (liftKey === null) return;
    const timer = setTimeout(markShown, 150);
    return () => clearTimeout(timer);
  }, [liftKey]);
  useEffect(() => {
    if (shownKey === null) return;
    Animated.spring(liftGrow, { toValue: 1, speed: 24, bounciness: 5, useNativeDriver: true }).start();
  }, [shownKey, liftGrow]);

  // While a card is zoomed, its sideways swipes step through cards; a session's deck pager must hold still,
  // or it would swipe to another deck at the same time.
  const zoomOpen = zoomed !== null;
  useEffect(() => {
    if (zoomOpen) onTouchingCard?.(true);
    else onTouchingCard?.(false);
  }, [zoomOpen, onTouchingCard]);

  /**
   * Which way up a held card is showing. A whole stack picked up by its count is a real stack, whose cards can
   * face either way: each keeps its own face, all turned the other way if the stack has been turned over. Any
   * other held cards all face the held stack's way.
   */
  const heldFaceUp = (d: Drag, h: HeldCard) => {
    const c = d.wholeStack ? table.table.find((t) => t.iid === h.iid) : undefined;
    return c ? c.faceUp !== (d.faceUp !== d.startFaceUp) : d.faceUp;
  };

  const drop = (d: Drag, zone: Zone | null, at: InsertAt | null, onto: string | null) => {
    const ids = d.stack.map((h) => h.iid);
    // Felt as the cards are put down somewhere (letting go nowhere just puts them back).
    if (zone) haptics.drop();

    // Glide in from where the held stack is now (its top-left corner, as drawn) to wherever the cards end up,
    // even if that's exactly where they came from: otherwise they'd jump back into place. The stand-in starts
    // exactly as the held card was drawn, at the lifted size, and shrinks as it lands, so it stays sharp.
    // `rise` is where the card ends up relative to its spot (risen, on top of a stack; see `leanOffset`).
    // `settled`: the card's view is already where it will end up (its own blank space, back in its own row), so
    // there's no new layout to wait for before gliding.
    const glideIn = (to: 'hand' | 'table', rise = { x: 0, y: 0 }, settled = false, pile = false) => {
      if (!liftedFrom) return;
      const w = d.width * LIFTED_SCALE;
      const s = snap.get();
      if (s.on) {
        // Already settled on the stack, at table size: start there. (The stand-in scales about its centre, so
        // put its unscaled box where that shows it at s.x, s.y.)
        landingAnim.pos.setValue({ x: s.x - (w * (1 - s.scale)) / 2, y: s.y - ((w / ratio) * (1 - s.scale)) / 2 });
        landingAnim.scale.setValue(s.scale);
      } else {
        landingAnim.pos.setValue({
          x: liftedFrom.x - d.offX * LIFTED_SCALE + lastPan.get().x,
          y: liftedFrom.y - d.offY * LIFTED_SCALE + lastPan.get().y,
        });
        landingAnim.scale.setValue(1);
      }
      landingAnim.lift.setValue(1);
      setLanding({
        zone: to,
        iids: ids,
        cardId: d.stack[0].cardId,
        // In the hand every card faces the held stack's way; on the table a whole stack keeps its cards' faces.
        faceUp: to === 'hand' ? d.faceUp : heldFaceUp(d, d.stack[0]),
        width: d.width * LIFTED_SCALE,
        before: cardLayouts[ids[0]],
        rise,
        settled,
        pile,
      });
    };
    /** Whether the dragged card left a blank space in this row (a single card, not the top of a stack). */
    const leftBlankIn = (z: Zone) =>
      d.from === z && (z === 'hand' || tableGroups.some((g) => g.length === 1 && g[0].iid === d.iid));

    // Let go somewhere that isn't a place for cards: a single card from the hand or table glides back into
    // its blank space.
    if (!zone) {
      if (d.stack.length === 1 && (d.from === 'hand' || d.from === 'table') && leftBlankIn(d.from)) {
        glideIn(d.from, undefined, true);
      }
      return;
    }

    // Dropped right on a table card or stack: the cards go on top of it, making (or growing) a stack.
    if (zone === 'table' && onto) {
      const i = tableGroups.findIndex((g) => g.some((c) => c.iid === onto));
      const staying = i !== -1 ? tableGroups[i].filter((c) => !isHeld(c.iid)).length : 1;
      const lean = i !== -1 ? spotLean(groupSpots[i]) : undefined;
      glideIn('table', lean && leanOffset(lean, pileRise(tableCardWidth, staying + ids.length)));
      // The cards turn to face the way the stack does (a stack's cards all face the same way), turning over as
      // they land if they were held the other way up.
      const stackFace = i !== -1 ? tableGroups[i][0].faceUp : d.faceUp;
      const heldFace = heldFaceUp(d, d.stack[0]);
      if (stackFace !== heldFace) setLanding((l) => l && { ...l, faceUp: stackFace, turns: true });
      apply((t) => T.stackOnto(t, ids, onto));
      // The held stack's top card becomes the stack's top; its count pops again as the new count.
      setPoppedStack(ids[0]);
      return;
    }

    // A whole stack picked up by its count goes to the free spot by the finger, still a stack.
    if (d.wholeStack && zone === 'table' && at?.zone === 'table') {
      const home = tableGroups.findIndex((g) => g.some((c) => c.iid === d.iid));
      const back = home !== -1 && sameSpot(groupSpots[home], at.spot);
      const turnedOver = d.faceUp !== d.startFaceUp;
      glideIn('table', leanOffset(spotLean(at.spot), pileRise(tableCardWidth, ids.length)), back, true);
      if (!back || turnedOver) apply((t) => T.placeStackOnTable(turnedOver ? T.flipAll(t, ids) : t, ids, at.spot, cols));
      return;
    }

    // Several cards put down on an empty spot: ask whether they go there together as a stack, or side by side.
    // They go back where they were until the player chooses (or cancels).
    if (ids.length > 1 && zone === 'table' && at?.zone === 'table') {
      open({ kind: 'place', iids: ids, spot: at.spot, faceUp: d.faceUp });
      return;
    }

    // On the table they go in the free spot by the finger (any further cards in the free spots after it).
    if (zone === 'table' && at?.zone === 'table') {
      // A single card dropped back into its own row lands in its blank space, which is already in place.
      const own = d.stack.length === 1 && leftBlankIn('table');
      glideIn('table', undefined, own);
      // Put back in the spot it came from, it stays put, just turned over if it was flipped.
      const home = tableGroups.findIndex((g) => g[0].iid === d.iid);
      if (own && home !== -1 && sameSpot(groupSpots[home], at.spot)) {
        if (d.faceUp !== d.startFaceUp) apply((t) => T.flip(t, d.iid));
        return;
      }
      apply((t) => T.placeOnTable(t, ids, at.spot, cols, d.faceUp));
      return;
    }

    // In the hand the cards go where the finger is, between the cards there.
    if (zone === 'hand' && at?.zone === zone) {
      // A single card dropped back into its own row lands in its blank space, which is already in place.
      glideIn(zone, undefined, d.stack.length === 1 && leftBlankIn(zone));
      // A single card put back exactly where it came from stays put, just turned over if it was flipped.
      const was = table.hand.findIndex((c) => c.iid === d.iid);
      if (d.stack.length === 1 && d.from === 'hand' && at.index === was) {
        if (d.faceUp !== d.startFaceUp) apply((t) => T.flip(t, d.iid));
        return;
      }
      apply((t) => T.insertCards(t, ids, zone, at.index, d.faceUp));
      return;
    }
    // A single card put back on its own pile stays where it is, just turned over if it was flipped. (Not one
    // taken out from the search, from somewhere in the pile: put back, it goes on top.)
    if (d.stack.length === 1 && zone === d.from && !d.fromSearch) {
      if (d.faceUp !== d.startFaceUp) apply((t) => T.flip(t, d.iid));
      return;
    }
    // Piles keep their rules: the deck is always face down and the discard pile always face up.
    const faceUp = zone === 'deck' ? false : zone === 'discard' || zone === 'trash' ? true : d.faceUp;
    if (zone === 'discard' && !d.faceUp) setRevealed(d.stack[0].iid);
    apply((t) => T.moveCards(t, ids, zone, faceUp), zone === 'trash' ? 'Moved to the trash' : undefined);
  };

  /** Where a card in the hand or on the table sits on the (flat) table, counting how far its row is scrolled. */
  const laidOutAt = (zone: 'hand' | 'table') =>
    zone === 'table'
      ? playRect && { x: playRect.x, y: playRect.y - scroll.play }
      : handRect && layout.handScroll && { x: handRect.x + layout.handScroll.x - scroll.hand, y: handRect.y + layout.handScroll.y };

  /**
   * Where dropped cards would go in the hand: after every card to the left of the finger. Cards being carried
   * don't count, since they're leaving.
   */
  const handInsertionAt = (pageX: number, pageY: number): number | null => {
    const o = laidOutAt('hand');
    const p = toTable(pageX, pageY);
    if (!o || !p) return null;
    return table.hand.filter((c) => {
      const r = !isHeld(c.iid) && cardLayouts[c.iid];
      return r && o.x + r.x + r.w / 2 < p.x;
    }).length;
  };

  /**
   * The grid spot dropped cards would go in on the table: the one under the finger, or if a card is already
   * there, the nearest free one. Spots of cards being carried away count as free.
   */
  const spotAt = (pageX: number, pageY: number): Spot | null => {
    const o = laidOutAt('table');
    const p = toTable(pageX, pageY);
    if (!o || !p || !gridReady) return null;
    // The finger, measured from the middle of the first spot.
    const x = p.x - o.x - GRID_PAD - tableCardWidth / 2;
    const y = p.y - o.y - GRID_PAD - cellH / 2;
    const taken = new Set(
      tableGroups.flatMap((g, i) => (g.some((c) => !isHeld(c.iid)) ? [`${groupSpots[i].row}:${groupSpots[i].col}`] : [])),
    );
    const under = {
      row: Math.max(0, Math.round(y / rowStep)),
      col: Math.min(cols - 1, Math.max(0, colStep ? Math.round(x / colStep) : 0)),
    };
    if (!taken.has(`${under.row}:${under.col}`)) return under;
    // The row below the last card is always free, so this always finds one.
    const lastRow = Math.max(under.row, ...groupSpots.map((s) => s.row)) + 1;
    let best: Spot = { row: lastRow, col: 0 };
    let bestDistance = Infinity;
    for (let row = 0; row <= lastRow; row++) {
      for (let col = 0; col < cols; col++) {
        if (taken.has(`${row}:${col}`)) continue;
        const distance = Math.hypot(col * colStep - x, row * rowStep - y);
        if (distance < bestDistance) {
          best = { row, col };
          bestDistance = distance;
        }
      }
    }
    return best;
  };

  /**
   * The table card or stack the finger is right over, to drop the carried cards on top of it. Only its middle
   * counts: near its edges (or in the gaps) the cards go next to it instead.
   */
  const stackTargetAt = (pageX: number, pageY: number): string | null => {
    const p = toTable(pageX, pageY);
    if (!p || reveal) return null;
    // The stack a card is being taken off starts out under the finger, so it only becomes a target once the
    // finger has been off it: then the card can go back on if the player changes their mind.
    const source = tableGroups.find((grp) => grp.length > 1 && grp.some((c) => isHeld(c.iid)));
    const sourceRect = source && groupRect(source);
    if (sourceRect && !inside(sourceRect, p.x, p.y)) snap.set({ leftSource: true });
    const g = groupAt(p.x, p.y, STACK_TARGET_INSET);
    if (!g || (g === source && !snap.get().leftSource)) return null;
    // A card that's being carried away whole (every card of it held) isn't there to stack onto.
    return shownOf(g)?.iid ?? null;
  };

  /**
   * Where the held stack would sit on the stack it's over, once dropped: the target's top card spot, risen by
   * the stack's new height, at table-card size. Also the pan and scale that put the held stack there: it scales
   * about its grab point, so its top-left lands at base + pan + origin·(1 − scale).
   */
  const snapPlacement = (onto: string) => {
    const i = tableGroups.findIndex((grp) => grp.some((c) => c.iid === onto));
    const g = tableGroups[i];
    const r = g && groupRect(g);
    if (!drag || !liftedFrom || !g || !r) return null;
    const total = g.filter((c) => !isHeld(c.iid)).length + drag.stack.length;
    const rise = leanOffset(spotLean(groupSpots[i]), pileRise(tableCardWidth, total));
    const scale = r.w / liftedWidth;
    const x = r.x + rise.x;
    const y = r.y + rise.y;
    const base = { x: liftedFrom.x - drag.offX * LIFTED_SCALE, y: liftedFrom.y - drag.offY * LIFTED_SCALE };
    const origin = { x: drag.offX * LIFTED_SCALE, y: drag.offY * LIFTED_SCALE };
    return { x, y, scale, pan: { x: x - base.x - origin.x * (1 - scale), y: y - base.y - origin.y * (1 - scale) } };
  };

  /** Settles the held stack onto a stack target, with a light tap so it can be felt as well as seen. */
  const snapTo = (onto: string) => {
    const place = snapPlacement(onto);
    if (!place) return;
    snap.set({ on: true, returning: false, x: place.x, y: place.y, scale: place.scale });
    Animated.parallel([
      Animated.spring(pan, { toValue: place.pan, speed: 28, bounciness: 4, useNativeDriver: true }),
      Animated.spring(liftGrow, { toValue: place.scale, speed: 28, bounciness: 4, useNativeDriver: true }),
    ]).start();
    haptics.tick();
  };

  /** Springs the held stack back up to the finger after leaving a stack target. */
  const unsnap = () => {
    snap.set({ on: false, returning: true });
    Animated.parallel([
      Animated.timing(pan, { toValue: lastPan.get(), duration: 120, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.spring(liftGrow, { toValue: 1, speed: 28, bounciness: 4, useNativeDriver: true }),
    ]).start(() => {
      // The finger kept moving while it sprang back: catch up with it.
      snap.set({ returning: false });
      if (!snap.get().on) pan.setValue(lastPan.get());
    });
    haptics.tick();
  };

  const followFinger = (finger: NativeTouchEvent) => {
    if (!drag) return;
    const delta = tableDelta(drag.startX, drag.startY, finger);
    lastPan.set(delta);
    // While settled on a stack target (or springing back from one) the held stack doesn't follow the finger.
    if (!snap.get().on && !snap.get().returning) pan.setValue(delta);
    const zone = zoneAt(finger.pageX, finger.pageY);
    if (zone !== hover) setHover(zone);
    // Over the middle of a table card it's a stack; anywhere else on the table, a free spot; in the hand, a gap.
    const onto = zone === 'table' ? stackTargetAt(finger.pageX, finger.pageY) : null;
    let next: InsertAt | null = null;
    if (zone === 'hand') {
      const index = handInsertionAt(finger.pageX, finger.pageY);
      if (index !== null) next = { zone, index };
    } else if (zone === 'table' && !onto) {
      const spot = spotAt(finger.pageX, finger.pageY);
      if (spot) next = { zone, spot };
    }
    const moved = !sameInsert(next, insertAt);
    // The blank space moves (or opens, or closes): the cards around it slide over rather than jump.
    if (moved || onto !== stackTarget) animateLayout();
    if (onto !== stackTarget) {
      if (onto) snapTo(onto);
      else unsnap();
      setStackTarget(onto);
    }
    if (moved) setInsertAt(next);
  };

  /** A release or terminate that arrives while the holding finger is still down came from another finger. */
  const stillHeld = (e: GestureResponderEvent) =>
    !!drag?.active && e.nativeEvent.touches.some((t) => t.identifier === drag.touchId);

  const keepHolding = () => setDrag((d) => d && { ...d, orphaned: true });

  // Screen-level touch events: carry a drag once it has been orphaned (see Drag.orphaned), and keep the
  // table's window position fresh before any drag can start.
  const rootTouches = {
    onTouchStart: (e: GestureResponderEvent) => {
      if (!drag) measureRoot();
      if (drag?.orphaned) helperStart(e.nativeEvent.changedTouches);
    },
    onTouchMove: (e: GestureResponderEvent) => {
      if (!drag?.orphaned) return;
      const finger = e.nativeEvent.touches.find((t) => t.identifier === drag.touchId);
      if (finger) followFinger(finger);
      helperMove(e.nativeEvent.touches);
    },
    onTouchEnd: (e: GestureResponderEvent) => {
      if (!drag?.orphaned) return;
      if (!e.nativeEvent.changedTouches.some((t) => t.identifier === drag.touchId)) {
        helperEnd(e.nativeEvent.changedTouches);
        return;
      }
      const d = drag;
      endDrag();
      drop(d, hover, insertAt, stackTarget);
    },
    onTouchCancel: (e: GestureResponderEvent) => {
      if (drag?.orphaned && e.nativeEvent.changedTouches.some((t) => t.identifier === drag.touchId)) endDrag();
    },
  };

  /**
   * Touch handling for one card: tap, long press, or drag to another zone.
   * While a card is lifted, a second finger on the FLIP button turns it over, and on another card picks that up too.
   */
  const dragHandlers = (inst: CardInstance, from: Zone, cardWidth: number, opts: PressOptions) =>
    PanResponder.create({
      // While a card is lifted, other cards ignore new fingers so a FLIP tap can't pick one up. Nothing can be
      // grabbed while a revealed card is still flying to the discard pile.
      onStartShouldSetPanResponder: () => !drag?.active && !flying,
      // Let the hand and table scroll views take over a swipe that hasn't lifted the card yet.
      onShouldBlockNativeResponder: () => false,
      onPanResponderTerminationRequest: () => !drag?.active,
      onPanResponderGrant: (e) => {
        const n = e.nativeEvent;
        pan.setValue({ x: 0, y: 0 });
        lastPan.set({ x: 0, y: 0 });
        // Reset here rather than when the last drag ended: dropping reads it after the drag has been cleared.
        snap.set({ on: false, returning: false, leftSource: false });
        onTouchingCard?.(true);
        const s = opts.stack;
        const whole = !!s && n.locationX > s.w - STACK_HANDLE && n.locationY > s.h - STACK_HANDLE;
        setDrag({
          iid: inst.iid,
          cardId: inst.cardId,
          from,
          width: cardWidth,
          verticalOnly: !!opts.verticalOnly,
          touchId: n.identifier,
          startX: n.pageX,
          startY: n.pageY,
          offX: n.locationX,
          offY: n.locationY,
          pressedAt: Date.now(),
          // Holding a stack's count still does nothing: it's for dragging the stack.
          zoomable: inst.faceUp && from !== 'deck' && !whole,
          active: false,
          abandoned: false,
          orphaned: false,
          startFaceUp: inst.faceUp,
          faceUp: inst.faceUp,
          stack: whole && s ? s.cards.map((c) => ({ iid: c.iid, cardId: c.cardId, from })) : [{ iid: inst.iid, cardId: inst.cardId, from }],
          wholeStack: whole,
          shown: false,
        });
      },
      // These fire for every extra finger that lands, moves or lifts while this card is held.
      onPanResponderStart: (e) => {
        const touches = e.nativeEvent.touches;
        if (drag?.active && !drag.orphaned) helperStart(e.nativeEvent.changedTouches);
        else if (drag && !drag.active && !drag.pinch && touches.length >= 2) {
          const startDistance = fingerDistance(touches[0], touches[1]);
          setDrag((d) => d && { ...d, pinch: { startDistance } });
        }
      },
      onPanResponderEnd: (e) => {
        if (drag?.active && !drag.orphaned) helperEnd(e.nativeEvent.changedTouches);
      },
      onPanResponderMove: (e) => {
        if (!drag || drag.abandoned || drag.orphaned) return;
        if (drag.pinch) {
          const touches = e.nativeEvent.touches;
          const spread = touches.length >= 2 && fingerDistance(touches[0], touches[1]) / drag.pinch.startDistance;
          // Face-down cards stay put, so a pinch can't be used to peek.
          if (spread && spread >= PINCH_OPEN && inst.faceUp) {
            endDrag();
            setZoomed(inst.iid);
            haptics.tick();
          }
          return;
        }
        if (drag.active) helperMove(e.nativeEvent.touches);
        const finger = e.nativeEvent.touches.find((t) => t.identifier === drag.touchId);
        if (!finger) return;
        if (!drag.active) {
          const dx = finger.pageX - drag.startX;
          const dy = finger.pageY - drag.startY;
          if (Math.hypot(dx, dy) < DRAG_SLOP || Date.now() - drag.pressedAt < LIFT_DELAY_MS) return;
          const lift = !drag.verticalOnly || Math.abs(dy) > Math.abs(dx);
          if (lift) {
            // Felt as it comes off the table: a whole stack a little heavier than one card.
            if (drag.wholeStack) haptics.liftHeavy();
            else haptics.lift();
            animateLayout();
            // Grow from the card's own size up to the lifted size, rather than popping straight to it.
            // Starts at the card's own size; it grows once its lifted copy is on screen (see `drag.shown`).
            liftGrow.setValue(1 / LIFTED_SCALE);
          }
          setDrag((d) => d && (lift ? { ...d, active: true } : { ...d, abandoned: true }));
          if (!lift) return;
        }
        followFinger(finger);
      },
      onPanResponderRelease: (e) => {
        if (stillHeld(e)) return keepHolding();
        const d = drag;
        endDrag();
        if (!d || d.abandoned || d.pinch) return;
        if (d.active) return drop(d, hover, insertAt, stackTarget);
        const longPress = Date.now() - d.pressedAt >= LONG_PRESS_MS && opts.onLongPress;
        if (longPress) opts.onLongPress?.();
        else opts.onPress?.(d.wholeStack);
      },
      onPanResponderTerminate: (e) => (stillHeld(e) ? keepHolding() : endDrag()),
    });

  /** Wraps a card so the wrapper, not the card's own children, receives touches. */
  const draggable = (
    inst: CardInstance,
    from: Zone,
    cardWidth: number,
    opts: PressOptions,
    children: ReactNode,
    onLayout?: (e: LayoutChangeEvent) => void,
    collapsed?: boolean,
    place?: ViewStyle,
  ) => (
    <View
      key={inst.iid}
      ref={(view) => cardViews.track(inst.iid, view)}
      onLayout={onLayout}
      {...dragHandlers(inst, from, cardWidth, opts).panHandlers}
      accessible
      accessibilityRole="button"
      accessibilityLabel={inst.faceUp ? cardsById.get(inst.cardId)?.name : 'Face-down card'}
      onAccessibilityTap={opts.onPress}
      style={[{ pointerEvents: 'box-only' }, place, collapsed && styles.collapsed]}>
      {children}
    </View>
  );

  // A held card in the hand or on the table steps out of the layout so the cards around it close the gap. It
  // stays mounted (just invisible), because the finger holding the stack may still be attached to it.
  /** A dropped card waiting, hidden, while its stand-in glides into its spot. */
  const landingOn = (iid: string) => !!landing && !landing.revealed && landing.iids.includes(iid);
  /** A gold outline on the table card or stack that carried cards would be stacked onto. */
  const targetOutline = (iid: string | undefined) =>
    iid && iid === stackTarget ? <View style={[styles.stackTargetOutline, { borderRadius: Math.max(4, tableCardWidth * 0.06) + 3 }]} /> : null;

  const renderCard = (inst: CardInstance, w: number, from: Zone, place?: ViewStyle) =>
    draggable(
      inst,
      from,
      w,
      { onPress: () => open({ kind: 'card', iid: inst.iid }), verticalOnly: from === 'hand' },
      <>
        {/*
          A blank space while it's being carried (once its lifted copy is showing), and while a dropped card's
          stand-in glides into this spot.
        */}
        <View style={(carriedAway(inst.iid) || landingOn(inst.iid) || arriving(inst.iid)) && styles.hiddenCard}>
          <CardView deck={deck} card={cardsById.get(inst.cardId)} faceUp={inst.faceUp} width={w} />
        </View>
        {targetOutline(inst.iid)}
      </>,
      measureCard(inst.iid),
      // The card being dragged keeps its spot, as the blank space that moves to where it will land; any other
      // cards carried with it step out of the row, and their neighbours close up.
      isHeld(inst.iid) && inst.iid !== drag?.iid,
      place,
    );

  /**
   * A stack on the table: drawn like a small pile, its top card risen above the rest, with a count. It's
   * handled through its top card's view: dragging it takes the top card off (the next one down then shows),
   * and tapping opens the top card's menu. Once every card is being carried off it, it steps out of the row
   * like a single card does.
   */
  const renderStack = (g: CardInstance[], spot: Spot) => {
    const place = spotPlace(spot);
    if (g.length === 1) return renderCard(g[0], tableCardWidth, 'table', place);
    const top = groupTop(g);
    // As drawn: a card lifted off the stack stays on it until its lifted copy is showing.
    // Cards still flying here (see `moveCards`) join it as they land.
    const shown = [...g].reverse().find((c) => !carriedAway(c.iid) && !arriving(c.iid));
    const left = g.filter((c) => !carriedAway(c.iid) && !arriving(c.iid)).length;
    return draggable(
      top,
      'table',
      tableCardWidth,
      {
        // Tapping its count opens the menu on the whole stack (as dragging the count moves the whole stack).
        onPress: (wholeStack) => open({ kind: 'card', iid: shown?.iid ?? top.iid, whole: wholeStack }),
        stack: { cards: g.slice().reverse(), w: tableCardWidth, h: cellH },
      },
      <>
        <PileDepth deck={deck} width={tableCardWidth} count={left} lean={spotLean(spot)}>
          {shown ? (
            <View key={shown.iid} style={(landingOn(shown.iid) || turningOver(shown.iid)) && styles.hiddenCard}>
              <CardView deck={deck} card={cardsById.get(shown.cardId)} faceUp={shown.faceUp} width={tableCardWidth} />
            </View>
          ) : null}
        </PileDepth>
        {/*
          The count. While cards are about to be stacked here, the preview count stands in for it (drawn above
          the held card); just after they land, it pops, as the new count.
        */}
        {left > 1 && shown?.iid !== stackTarget ? (
          <Animated.View style={[styles.stackCount, top.iid === poppedStack && { transform: [{ scale: dropPop }] }]}>
            <Text style={styles.stackCountText}>{left}</Text>
          </Animated.View>
        ) : null}
        {targetOutline(shown?.iid)}
      </>,
      measureCard(top.iid),
      // Gone once every card is carried off it, but only once the lifted copy is showing, so it doesn't blink out.
      // Also while the whole stack is landing here: its stand-in brings the edges with it.
      g.every((c) => carriedAway(c.iid) || (!!landing?.pile && landingOn(c.iid))),
      place,
    );
  };

  /**
   * The edges of a whole stack landing on its own: they start as the held stack's (stepped down and right of
   * its top card) and settle into the pile's, leaning back to its spot, as the stand-in lands. The stand-in is
   * scaled as a whole, so offsets are in its unscaled units.
   */
  const landingEdges = (l: Landing) => {
    const endScale = tableCardWidth / l.width;
    const h = l.width / ratio;
    return Array.from({ length: LANDING_EDGES }, (_, i) => {
      // Bottom edge first; at the end each lies part of the way from the spot to the top card.
      const towardSpot = 1 - i / LANDING_EDGES;
      const held = Math.min(2, LANDING_EDGES - i) * 6;
      const move = (end: number) => landingAnim.lift.interpolate({ inputRange: [0, 1], outputRange: [end / endScale, held] });
      const radius = { borderRadius: Math.max(4, l.width * 0.06) };
      return (
        <Animated.View
          key={i}
          style={{
            position: 'absolute',
            width: l.width,
            height: h,
            transform: [{ translateX: move(-l.rise.x * towardSpot) }, { translateY: move(-l.rise.y * towardSpot) }],
          }}>
          {/* A pile's paper edge, under the held stack's edge, which fades away as it lands. */}
          <View style={[StyleSheet.absoluteFill, styles.pileEdge, radius]} />
          <Animated.View style={[StyleSheet.absoluteFill, styles.stackEdge, radius, { opacity: landingAnim.lift }]} />
        </Animated.View>
      );
    });
  };

  // ---- The hand while dragging, home-screen style ----
  // The card being dragged leaves a blank space where it was. Over the hand, that space moves to wherever the
  // card would land and the cards around it slide over to make room; a card from elsewhere opens a fresh
  // space there instead.

  type RowItem<T> = { kind: 'item'; item: T } | { kind: 'gap' };

  /** Puts `own` (the dragged card's blank) or a fresh gap at `at` in `items`, or `own` back at `home`. */
  const arrange = <T,>(items: T[], own: T | undefined, home: number, at: number | null): RowItem<T>[] => {
    const row: RowItem<T>[] = items.map((item) => ({ kind: 'item', item }));
    if (own !== undefined) row.splice(Math.min(at ?? home, row.length), 0, { kind: 'item', item: own });
    else if (at !== null) row.splice(Math.min(at, row.length), 0, { kind: 'gap' });
    return row;
  };

  const handRow = (): RowItem<CardInstance>[] => {
    if (!drag?.active) return table.hand.map((item) => ({ kind: 'item', item }));
    const own = drag.from === 'hand' ? table.hand.find((c) => c.iid === drag.iid) : undefined;
    const home = own ? table.hand.filter((c, i) => !isHeld(c.iid) && i < table.hand.indexOf(own)).length : 0;
    const at = insertAt?.zone === 'hand' && !stackTarget ? insertAt.index : null;
    const staying = table.hand.filter((c) => !isHeld(c.iid));
    // Other carried cards stay mounted at the end, stepped out of the row.
    const extras = table.hand.filter((c) => isHeld(c.iid) && c !== own).map((item) => ({ kind: 'item' as const, item }));
    return [...arrange(staying, own, home, at), ...extras];
  };

  // ---- The table's grid while dragging ----
  // Every card and stack keeps its spot. A single card dragged from the table leaves a blank that moves to the
  // spot it would land in (taking the top off a stack leaves the stack); an outline shows where cards will go.

  /** The spot carried cards would land in on the table, if that's where they're headed. */
  const dropSpot = drag?.active && insertAt?.zone === 'table' && !stackTarget ? insertAt.spot : null;
  /** The outlined spot: where carried cards will land, or where some are waiting to be put down (see 'place'). */
  const outlineSpot = dropSpot ?? (sheetOpen && sheet.kind === 'place' ? sheet.spot : null);
  /** Where each table group is drawn: in its spot, or for the dragged card's blank, where it would land. */
  const drawnSpot = (g: CardInstance[], i: number) =>
    dropSpot && g.length === 1 && g[0].iid === drag?.iid ? dropSpot : groupSpots[i];
  /** The grid's height: down to the row below the last card, so there's always a free row to drop into. */
  const gridRows = Math.max(0, ...groupSpots.map((s) => s.row + 1), (outlineSpot?.row ?? -1) + 1) + 1;
  const gridHeight = GRID_PAD * 2 + gridRows * rowStep - GRID_GAP;

  /** A blank space the size of a card in a row, where carried cards would land. */
  const gap = (w: number) => <View key="gap" style={{ width: w, height: w / ratio }} />;

  const sheetProps = (() => {
    switch (sheet.kind) {
      case 'card': {
        const found = T.findCard(table, sheet.iid);
        if (!found) return { actions: [] };
        const inst = table[found.zone][found.index];
        const card = cardsById.get(inst.cardId);
        const group = found.zone === 'table' ? tableGroups.find((g) => g.some((c) => c.iid === inst.iid)) : undefined;
        const inStack = !!group && group.length > 1;
        const whole = inStack && !!sheet.whole;
        const menu = cardMenu(inst.iid, found.zone, whole, () => setMenuZoom(inst.iid));
        return {
          title: inst.faceUp ? card?.name : 'Face-down card',
          header: (
            <View style={{ alignItems: 'center', marginBottom: 6, gap: 10 }}>
              {/* Shown as it lies, so tapping a face-down card doesn't reveal it. Tap a face-up one to see it full size. */}
              <Pressable
                disabled={!inst.faceUp}
                onPress={() => setMenuZoom(inst.iid)}
                accessibilityRole="button"
                accessibilityLabel="View full size">
                <CardView deck={deck} card={card} faceUp={inst.faceUp} width={Math.min(200, width * 0.5)} />
              </Pressable>
              {inStack ? (
                <View style={styles.scope}>
                  {[false, true].map((w) => (
                    <Pressable
                      key={String(w)}
                      onPress={() => {
                        setSheet({ kind: 'card', iid: inst.iid, whole: w });
                        haptics.tick();
                      }}
                      accessibilityRole="tab"
                      accessibilityState={{ selected: whole === w }}
                      style={[styles.scopeItem, whole === w && styles.scopeItemOn]}>
                      <Text style={[styles.scopeText, whole === w && { color: colors.accentText }]}>
                        {w ? `Whole stack (${group!.length})` : 'This card'}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              ) : null}
            </View>
          ),
          tiles: menu.tiles,
          actions: menu.actions,
          // Full size, over the menu (which stays open underneath).
          overlay:
            menuZoom === inst.iid && card ? (
              <CardZoom deck={deck} current={{ key: inst.iid, card }} area={screen} onClose={() => setMenuZoom(null)} />
            ) : null,
        };
      }
      case 'discard':
        return {
          title: `Discard pile · ${table.discard.length} cards`,
          actions: [
            ...(table.discard[0] ? [{ label: 'View top card full size', onPress: () => setZoomed(table.discard[0].iid) }] : []),
            ...(reveal
              ? [{ label: 'Put top card back on the deck', onPress: () => moveCards((t) => T.takeTopOfDiscard(t, 'deck')) }]
              : [
                  { label: 'Take top card into hand', onPress: () => moveCards((t) => T.takeTopOfDiscard(t, 'hand')) },
                  { label: 'Play top card to table', onPress: () => moveCards((t) => T.takeTopOfDiscard(t, 'table')) },
                ]),
            { label: 'Search discard pile', opensModal: true, onPress: () => setSearchZone('discard') },
            {
              label: 'Shuffle discard pile into deck',
              onPress: () => shuffleDeck(T.shuffleDiscardIntoDeck, 'Shuffled into deck'),
            },
          ],
        };
      case 'place': {
        const { iids, spot, faceUp } = sheet;
        const put = (fn: (t: TableState) => TableState) => () => {
          moveCards(fn, undefined, true);
        };
        return {
          title: `Put down ${iids.length} cards`,
          actions: [
            { label: 'As a stack', onPress: put((t) => T.placeStackOnTable(t, iids, spot, cols, faceUp)) },
            { label: 'Side by side', onPress: put((t) => T.placeOnTable(t, iids, spot, cols, faceUp)) },
          ],
        };
      }
      case 'table':
        return {
          title: deck.name,
          actions: [
            reveal
              ? { label: 'Switch to table mode', onPress: () => switchMode('table') }
              : { label: 'Switch to reveal mode', opensModal: true, onPress: () => switchMode('reveal') },
            ...(reveal
              ? []
              : [
                  {
                    label: 'Discard entire hand',
                    onPress: () => {
                      moveCards(T.discardHand, undefined, true);
                    },
                  },
                ]),
            { label: 'Shuffle discard pile into deck', onPress: () => shuffleDeck(T.shuffleDiscardIntoDeck, 'Shuffled into deck') },
            ...(table.trash.length
              ? [{ label: `Look in the trash (${table.trash.length})`, onPress: () => setSearchZone('trash' as const) }]
              : []),
            { label: 'Edit deck', onPress: () => router.push({ pathname: '/deck/[id]', params: { id: deck.id } }) },
            { label: 'Reset table', destructive: true, opensModal: true, onPress: confirmReset },
          ],
        };
      // A sheet kind this version no longer has (e.g. remembered across a reload): show nothing.
      default:
        return { actions: [] };
    }
  })();

  const deckTop = table.deck[0];
  const topDiscard = table.discard[0];
  // While the top card of a pile is lifted, show what is underneath it.
  const deckShowing = table.deck.filter((c) => !drawnAway(c.iid)).length;
  const discardShowing = table.discard.find((c) => !drawnAway(c.iid));
  const discardCount = table.discard.filter((c) => !drawnAway(c.iid)).length;
  const highlight = (zone: Zone) => drag?.active && hover === zone && styles.dropTarget;
  // The zoomed card, and for a card in the hand or on the table the face-up cards either side of it there, which
  // a sideways swipe moves to. Face-down cards are skipped, so swiping can't reveal one.
  const zoomView = (() => {
    const found = zoomed ? T.findCard(table, zoomed) : null;
    if (!found) return null;
    const inst = table[found.zone][found.index];
    /** A card on the table as the zoom shows it: keyed by its copy, so each keeps its own view while sliding. */
    const item = (c: CardInstance | undefined): ZoomItem | undefined => {
      const card = c && cardsById.get(c.cardId);
      return c && card ? { key: c.iid, card } : undefined;
    };
    const current = item(inst);
    if (!current) return null;
    if (found.zone !== 'hand' && found.zone !== 'table') return { current };
    // On the table only each stack's top card can be seen, so only those are stepped through.
    const visible = found.zone === 'table' ? tableGroups.map(groupTop) : table.hand;
    const row = visible.filter((c) => c.faceUp);
    const i = row.findIndex((c) => c.iid === inst.iid);
    return { current, prev: item(row[i - 1]), next: item(row[i + 1]) };
  })();

  // Once the dropped cards have been laid out in their new place, glide the stand-in to them, shrinking or
  // growing to their size (hand and table cards differ), then show the real cards. If the layout doesn't
  // change (put back exactly where it was) it glides there anyway after a moment.
  const landingRect = landing ? cardLayouts[landing.iids[0]] : undefined;
  const landingOrigin = landing ? laidOutAt(landing.zone) : null;
  useEffect(() => {
    if (!landing || landing.revealed || !landingRect || !landingOrigin) return;
    /** Glides the stand-in onto a card at this spot and size on the (flat) table. */
    const glideTo = (x: number, y: number, w: number, h: number) => {
      // The stand-in scales about its centre, so aim its centre at the card's centre (risen, on a stack).
      const toX = x + landing.rise.x + w / 2 - landing.width / 2;
      const toY = y + landing.rise.y + h / 2 - landing.width / ratio / 2;
      Animated.parallel([
        Animated.timing(landingAnim.pos, { toValue: { x: toX, y: toY }, duration: LANDING_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(landingAnim.scale, { toValue: w / landing.width, duration: LANDING_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        // Settling onto the cloth: by the end only the card's own resting shadow is left, as on the real card.
        Animated.timing(landingAnim.lift, { toValue: 0, duration: LANDING_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start(({ finished }) => {
        // Stopped part-way (the glide was re-aimed): the new glide finishes the job.
        if (!finished) return;
        // Hand over without a gap: show the real card first, and only take the stand-in away a couple of frames
        // later, once the real card is surely on screen right underneath it. Only this landing: another drop may
        // have started one of its own in the meantime.
        const mine = landing.iids;
        setLanding((l) => (l?.iids === mine ? { ...l, revealed: true } : l));
        requestAnimationFrame(() => requestAnimationFrame(() => setLanding((l) => (l?.iids === mine ? null : l))));
      });
    };
    const glide = () => {
      // Aim at where the real card actually is, measured on the table (scrolling and borders included), rather
      // than adding up layouts, which can come out a few points off and make it jump at the hand-over.
      const view = cardViews.get(landing.iids[0]);
      const stage = stageRef.current;
      const fallback = () =>
        glideTo(landingOrigin.x + landingRect.x, landingOrigin.y + landingRect.y, landingRect.w, landingRect.h);
      if (view && stage) view.measureLayout(stage, glideTo, fallback);
      else fallback();
    };
    const laidOut = landing.settled || landingRect !== landing.before;
    if (laidOut) {
      glide();
      return;
    }
    const timer = setTimeout(glide, 120);
    return () => clearTimeout(timer);
    // Only the card's layout and the landing itself matter; the rest is read fresh each time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [landing, landingRect]);

  /** The held stack's card size while it's being carried. */
  const liftedWidth = drag ? drag.width * LIFTED_SCALE : 0;
  /** The held stack as drawn: without cards still flying onto it, which join it (and its count) as they land. */
  const heldShown = drag ? drag.stack.filter((h) => !pickups.some((p) => p.card.iid === h.iid)) : [];
  /**
   * With a stack target: the corner of the stack where its count sits (bottom right of its spot), so the
   * preview count shows exactly where the stack's own count does.
   */
  const targetBadgeAt = (() => {
    const g = drag?.active && stackTarget ? tableGroups.find((grp) => grp.some((c) => c.iid === stackTarget)) : undefined;
    const r = g && groupRect(g);
    return r ? { left: r.x + r.w, top: r.y + r.h } : null;
  })();
  /** With a stack target: how many cards that stack will have once the held ones land on it. */
  const targetTotal = (() => {
    const g = drag?.active && stackTarget ? tableGroups.find((grp) => grp.some((c) => c.iid === stackTarget)) : undefined;
    return g && drag ? g.filter((c) => !isHeld(c.iid)).length + drag.stack.length : null;
  })();

  /** Where on the (flat) table the lifted stack was picked up. */
  const liftedFrom = drag?.active ? toTable(drag.startX, drag.startY) : null;

  /** Opens the search on the deck, or on the discard pile if the deck is empty. */
  const openSearch = () => setSearchZone(table.deck.length ? 'deck' : 'discard');

  const pileButtons = (
    <>
      <Button label="Draw" variant="primary" onPress={drawOne} disabled={!table.deck.length} />
      <Button label="Shuffle" onPress={() => shuffleDeck()} disabled={table.deck.length < 2} />
      <Button label="Search" onPress={openSearch} disabled={!table.deck.length && !table.discard.length} />
    </>
  );

  // Reveal mode's way to start over once every card has been turned up.
  const canReshuffle = reveal && table.deck.length === 0 && table.discard.length > 0;
  const reshuffle = () => shuffleDeck(T.shuffleDiscardIntoDeck, 'Shuffled into deck');

  const deckPile = (
    <>
      <View style={[styles.pileSlot, matSpot, highlight('deck')]}>
        <PileDepth deck={deck} width={pileWidth} count={deckShowing} lean={pileLean('deck')} height={deckHeight}>
          {deckTop ? (
            draggable(
              deckTop,
              'deck',
              pileWidth,
              { onPress: reveal ? revealNext : drawOne, onLongPress: () => setSearchZone('deck') },
              deckShowing > 0 ? (
                // Out of sight while the riffle plays over it, so the shuffle doesn't show a third half.
                <Animated.View style={shuffling !== null && { opacity: deckTopShown }}>
                  <CardView deck={deck} faceUp={false} width={pileWidth} />
                </Animated.View>
              ) : (
                <EmptySlot deck={deck} width={pileWidth} label="Deck empty" />
              ),
            )
          ) : canReshuffle ? (
            <Pressable onPress={reshuffle} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.7 }}>
              <EmptySlot deck={deck} width={pileWidth} label="Deck empty · Tap to shuffle the discard back in" />
            </Pressable>
          ) : (
            <EmptySlot deck={deck} width={pileWidth} label="Deck empty" />
          )}
          {shuffling !== null ? <Riffle key={shuffling} deck={deck} width={pileWidth} onDone={() => setShuffling(null)} /> : null}
        </PileDepth>
      </View>
      <Text style={styles.pileLabel}>Deck · {deckShowing}</Text>
    </>
  );

  const discardPile = (
    <>
      <View style={[styles.pileSlot, matSpot, highlight('discard')]}>
        <PileDepth deck={deck} width={pileWidth} count={discardCount} lean={pileLean('discard')}>
          {topDiscard ? (
            draggable(
              topDiscard,
              'discard',
              pileWidth,
              { onPress: () => open({ kind: 'discard' }) },
              discardShowing ? (
                <CardView
                  // Keyed by card so a newly revealed card mounts fresh and can flip in.
                  key={discardShowing.iid}
                  deck={deck}
                  card={cardsById.get(discardShowing.cardId)}
                  width={pileWidth}
                  flipIn={discardShowing.iid === revealed}
                  onReady={() => flightDone(discardShowing.iid)}
                />
              ) : (
                <EmptySlot deck={deck} width={pileWidth} label={reveal ? 'Revealed cards' : 'Discard'} />
              ),
            )
          ) : (
            <EmptySlot deck={deck} width={pileWidth} label={reveal ? 'Revealed cards' : 'Discard'} />
          )}
        </PileDepth>
      </View>
      <Text style={styles.pileLabel}>Discard · {discardCount}</Text>
    </>
  );

  return (
    <View
      ref={rootRef}
      style={styles.felt}
      {...rootTouches}
      onLayout={(e) => {
        const { width: w, height: h } = e.nativeEvent.layout;
        setRootSize({ w, h });
        measureRoot();
      }}>
      {/* The cloth, behind everything else on the tabletop. */}
      <TabletopSurface />

      {active ? (
        <Stack.Screen
          options={{
            title: deck.name,
            headerRight: () => (
              <View style={styles.headerButtons}>
                <Pressable
                  onPress={undo}
                  disabled={!canUndo}
                  hitSlop={12}
                  accessibilityRole="button"
                  accessibilityLabel="Undo"
                  accessibilityState={{ disabled: !canUndo }}
                  style={({ pressed }) => ({ opacity: !canUndo ? 0.3 : pressed ? 0.6 : 1 })}>
                  <SymbolView
                    name={{ ios: 'arrow.uturn.backward', android: 'undo', web: 'undo' }}
                    size={20}
                    weight="semibold"
                    tintColor={colors.accent}
                  />
                </Pressable>
                <Pressable onPress={() => open({ kind: 'table' })} hitSlop={12} accessibilityLabel="Table options">
                  <Text style={styles.headerButton}>•••</Text>
                </Pressable>
              </View>
            ),
          }}
        />
      ) : null}

      {/*
        The table itself, laid out flat and drawn leaning back on the tabletop. It exactly covers this view, so
        layouts measured inside it are in the same (flat) coordinates that `toTable` maps fingers into.
      */}
      {/*
        The clipping wrapper matters: iOS sorts 3D layers by depth, so the half of the table leaning away from
        the viewer would otherwise be hidden behind the cloth. Clipping flattens the tilted table into this
        wrapper first, so it's drawn whole, on top.
      */}
      <View style={[StyleSheet.absoluteFill, styles.stage]}>
      <View ref={stageRef} style={[StyleSheet.absoluteFill, tilt.angle ? { transform: tiltTransform(tilt) } : null]}>
      {missing > 0 ? (
        <Pressable style={styles.banner} onPress={() => {
            shuffleDeck((t) => T.addMissingCards(t, deck));
            flash('Added to deck');
          }}>
          <Text style={styles.bannerText}>
            {missing} new {missing === 1 ? 'card' : 'cards'} in this deck · Tap to shuffle in
          </Text>
        </Pressable>
      ) : null}

      {reveal ? (
        <View style={[styles.reveal, { paddingBottom: insets.bottom + 12 }]} onLayout={measure('reveal')}>
          {pileWidth > 0 ? (
            <>
              {/* Deck above discard on the left; a column of icon buttons on the right. */}
              <View style={styles.revealPiles} onLayout={measure('revealPiles')}>
                <View style={[styles.pile, shuffling !== null && styles.above]} onLayout={measure('revealDeck')}>
                  {deckPile}
                </View>
                <View style={styles.pile} onLayout={measure('revealDiscard')}>
                  {discardPile}
                </View>
              </View>
              <View style={styles.revealRail}>
                {canReshuffle ? (
                  <IconButton
                    icon={{ ios: 'arrow.uturn.backward', android: 'restart_alt', web: 'restart_alt' }}
                    label="Reshuffle the discard pile into the deck"
                    variant="primary"
                    onPress={reshuffle}
                  />
                ) : (
                  <IconButton
                    icon={{ ios: 'rectangle.portrait.on.rectangle.portrait.angled', android: 'flip', web: 'flip' }}
                    label="Reveal the next card"
                    variant="primary"
                    onPress={revealNext}
                    disabled={!table.deck.length}
                  />
                )}
                <IconButton
                  icon={{ ios: 'shuffle', android: 'shuffle', web: 'shuffle' }}
                  label="Shuffle the deck"
                  onPress={() => shuffleDeck()}
                  disabled={table.deck.length < 2}
                />
                <IconButton
                  icon={{ ios: 'magnifyingglass', android: 'search', web: 'search' }}
                  label="Search the deck and discard pile"
                  onPress={openSearch}
                  disabled={!table.deck.length && !table.discard.length}
                />
              </View>
            </>
          ) : null}
        </View>
      ) : (
        <>
          {/* Piles */}
          <View style={[styles.piles, styles.pilesOnCloth]} onLayout={measure('piles')}>
            <View style={[styles.pile, shuffling !== null && styles.above]} onLayout={measure('deckPile')}>
              {deckPile}
            </View>
            <View style={styles.pileButtons}>{pileButtons}</View>
            <View style={styles.pile} onLayout={measure('discardPile')}>
              {discardPile}
            </View>
          </View>

          {/* Play area */}
          <ScrollView
            ref={attachPlayView}
            onContentSizeChange={(_, h) => setContentSize((s) => ({ ...s, play: h }))}
            style={[styles.playArea, highlight('table')]}
            contentContainerStyle={[styles.playAreaContent, { minHeight: gridHeight }]}
            scrollEnabled={!drag?.active && !drag?.pinch}
            alwaysBounceVertical={false}
            onLayout={measure('play')}
            // Scrolling is off while cards are held, so the offset only needs updating when a scroll settles.
            onScrollEndDrag={(e) => trackScroll('play', e.nativeEvent.contentOffset.y)}
            onMomentumScrollEnd={(e) => trackScroll('play', e.nativeEvent.contentOffset.y)}>
            {table.table.length || outlineSpot ? null : <Text style={styles.hint}>Drag a card anywhere here to play it.</Text>}
            {gridReady ? tableGroups.map((g, i) => renderStack(g, drawnSpot(g, i))) : null}
            {outlineSpot ? (
              <View
                style={[
                  styles.dropSpot,
                  spotPlace(outlineSpot),
                  { width: tableCardWidth, height: cellH, borderRadius: Math.max(4, tableCardWidth * 0.06) },
                ]}
              />
            ) : null}
          </ScrollView>

          {/* Hand */}
          <View
            style={[styles.hand, styles.handOnRail, { paddingBottom: insets.bottom + 8 }, highlight('hand')]}
            onLayout={measure('hand')}>
            <WoodRail />
            <Text style={styles.handLabel}>Hand · {table.hand.length}</Text>
            <ScrollView
              ref={attachHandView}
              onContentSizeChange={(w) => setContentSize((s) => ({ ...s, hand: w }))}
              horizontal
              scrollEnabled={!drag?.active && !drag?.pinch}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.handCards}
              onLayout={measure('handScroll')}
              onScrollEndDrag={(e) => trackScroll('hand', e.nativeEvent.contentOffset.x)}
              onMomentumScrollEnd={(e) => trackScroll('hand', e.nativeEvent.contentOffset.x)}>
              {table.hand.length ? (
                handRow().map((r) => (r.kind === 'gap' ? gap(handWidth) : renderCard(r.item, handWidth, 'hand')))
              ) : (
                <EmptySlot deck={deck} width={handWidth} label="Tap or drag the deck to draw" />
              )}
            </ScrollView>
          </View>
        </>
      )}


      {landing ? (
        <Animated.View
          style={[styles.landing, { transform: [...landingAnim.pos.getTranslateTransform(), { scale: landingAnim.scale }] }]}>
          {/*
            The lifted shadow sits on its own layer under the card and fades out on the way down, so the hand-over
            to the real card (which only has its resting shadow) doesn't make the shadow jump.
          */}
          <Animated.View
            style={[
              styles.landingShadow,
              {
                width: landing.width,
                height: landing.width / ratio,
                borderRadius: Math.max(4, landing.width * 0.06),
                // Not for a card turning over as it lands: this slab would show round it as it narrows.
                opacity: landing.turns ? 0 : landingAnim.lift,
              },
              tabletopShadow.lifted,
            ]}
          />
          {landing.pile ? landingEdges(landing) : null}
          <CardView deck={deck} card={cardsById.get(landing.cardId)} faceUp={landing.faceUp} flipIn={landing.turns} width={landing.width} sharp />
        </Animated.View>
      ) : null}

      {/* Cards flying to their new places after a change (see `moveCards`). */}
      {flights.map((f) => (
        <CardFlight
          key={`${f.iid}:${f.batch}`}
          flight={f}
          deck={deck}
          card={cardsById.get(f.cardId)}
          fromCard={f.fromCardId ? cardsById.get(f.fromCardId) : undefined}
          size={Math.max(handWidth, pileWidth, tableCardWidth)}
          onLanded={() => {
            if (f.thud) haptics.drop();
            setFlights((all) => all.map((g) => (g.iid === f.iid && g.batch === f.batch ? { ...g, landed: true } : g)));
          }}
          onGone={() => setFlights((all) => all.filter((g) => !(g.iid === f.iid && g.batch === f.batch)))}
        />
      ))}

      {/* The held stack follows the finger above everything else: its top card, with the edges of the rest. */}
      {drag?.active && liftedFrom ? (
        <Animated.View
          style={[
            styles.lifted,
            tabletopShadow.lifted,
            // Invisible until its picture is on screen, so it never shows up blank.
            !drag.shown && styles.hiddenCard,
            {
              // Bigger, but still held at the same spot under the finger: the grab point grows with the card.
              left: liftedFrom.x - drag.offX * LIFTED_SCALE,
              top: liftedFrom.y - drag.offY * LIFTED_SCALE,
              // It grows about the grab point, so the spot under the finger stays put while it does.
              transformOrigin: [drag.offX * LIFTED_SCALE, drag.offY * LIFTED_SCALE, 0],
              transform: [...pan.getTranslateTransform(), { scale: liftGrow }],
            },
          ]}>
          {heldShown
            .slice(1, 3)
            .map((h, i) => (
              <View
                key={h.iid}
                style={[
                  styles.stackEdge,
                  {
                    width: liftedWidth,
                    height: liftedWidth / ratio,
                    borderRadius: Math.max(4, liftedWidth * 0.06),
                    left: (i + 1) * 6,
                    top: (i + 1) * 6,
                  },
                ]}
              />
            ))
            .reverse()}
          {/* Drawn at its lifted size (not scaled up from the small card), so the art stays sharp. */}
          <CardView
            deck={deck}
            card={cardsById.get(heldShown[0].cardId)}
            faceUp={heldFaceUp(drag, heldShown[0])}
            width={liftedWidth}
            sharp
            onReady={markShown}
          />
          {heldShown.length > 1 ? (
            <View style={styles.stackBadge}>
              <Text style={styles.stackBadgeText}>{heldShown.length}</Text>
            </View>
          ) : null}
        </Animated.View>
      ) : null}

      {/* Cards just picked up by a second finger, flying onto the held stack. */}
      {drag?.active && liftedFrom
        ? pickups.map((p) => (
            <PickupFlight
              key={p.card.iid}
              deck={deck}
              card={cardsById.get(p.card.cardId)}
              from={p.from}
              fromFaceUp={p.faceUp}
              faceUp={heldFaceUp(drag, p.card)}
              to={{ x: liftedFrom.x - drag.offX * LIFTED_SCALE, y: liftedFrom.y - drag.offY * LIFTED_SCALE }}
              pan={pan}
              width={liftedWidth}
              onLanded={() => setPickups((all) => all.filter((q) => q.card.iid !== p.card.iid))}
            />
          ))
        : null}

      {/*
        Over a stack target: how big the stack will be once the held cards land on it. It belongs to the stack,
        at its bottom-right corner, drawn above the held card so that can't cover it, and pops in from there.
      */}
      {targetTotal !== null && targetBadgeAt ? (
        <View style={[styles.stackingAnchor, targetBadgeAt]}>
          <Animated.View style={[styles.stackCount, { transform: [{ scale: badgePop }] }]}>
            <Text style={styles.stackCountText}>{targetTotal}</Text>
          </Animated.View>
        </View>
      ) : null}

      {/* Can't be pressed normally while a finger holds a card; the drag handler checks for a second finger here. */}
      {drag?.active && flipRect ? (
        <FadeIn style={[styles.flip, { left: flipRect.x, top: flipRect.y, width: flipRect.w, height: flipRect.h }]}>
          <Text style={styles.flipText}>FLIP</Text>
        </FadeIn>
      ) : null}

      {/* Drop cards here to trash them; it lights up while they're over it. */}
      {drag?.active && trashRect ? <TrashTarget rect={trashRect} hot={hover === 'trash'} /> : null}

      {flying ? (
        <Animated.View style={[styles.flying, { transform: [...flight.pos.getTranslateTransform(), { scale: flight.scale }] }]}>
          {/* No shadow while it flips: anything behind a turning card shows round its edges as it narrows. */}
          <CardView deck={deck} card={cardsById.get(flying.cardId)} faceUp={flying.faceUp} width={pileWidth} flat />
        </Animated.View>
      ) : null}

      </View>
      </View>

      {searchMounted ? (
        <SearchPanel
          zone={searchZone}
          leaving={searchLeaving}
          deck={deck}
          table={table}
          onReorder={(zone, picked, to) => apply((t) => T.reorderPile(t, zone, picked, to))}
          onTakeOut={takeOutOfSearch}
          cardMenu={cardMenu}
          onSwitch={setSearchZone}
          onClose={() => setSearchZone(null)}
          onClosed={() => setSearchMounted(false)}
        />
      ) : null}

      {zoomView ? (
        <CardZoom
          deck={deck}
          current={zoomView.current}
          area={rootSize}
          prev={zoomView.prev}
          next={zoomView.next}
          onStep={(dir) => {
            setZoomed(dir === 1 ? zoomView.next!.key : zoomView.prev!.key);
            haptics.tick();
          }}
          onClose={() => setZoomed(null)}
        />
      ) : null}

      <Toast toast={toast} />

      <ActionSheet
        visible={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setMenuZoom(null);
        }}
        {...sheetProps}
      />

    </View>
  );
}

/**
 * A card picked up mid-drag flying from where it lay onto the held stack: it grows from its own size to the
 * held size, turning to the held stack's way up if it lay the other way, and aims at the held stack as it
 * follows the finger (its resting corner `to`, moved by `pan`), so it lands on it even if the finger moves.
 */
function PickupFlight({
  deck,
  card,
  from,
  fromFaceUp,
  faceUp,
  to,
  pan,
  width,
  onLanded,
}: {
  deck: Deck;
  card: Card | undefined;
  from: { x: number; y: number; w: number };
  fromFaceUp: boolean;
  faceUp: boolean;
  to: { x: number; y: number };
  pan: Animated.ValueXY;
  width: number;
  onLanded: () => void;
}) {
  const [t] = useState(() => new Animated.Value(0));
  useEffect(() => {
    // Started once mounted: the native driver needs its view to exist first.
    Animated.timing(t, { toValue: 1, duration: PICKUP_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start(
      ({ finished }) => finished && onLanded(),
    );
    // Flies once; a card picked up again is a new flight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Part of the way from where it lay to the held stack, wherever that is now.
  const toward = (start: number, end: number, moved: Animated.Value) =>
    Animated.multiply(t, Animated.add(moved, end - start));
  const startScale = from.w / width;
  return (
    <Animated.View
      style={[
        styles.pickup,
        tabletopShadow.lifted,
        {
          left: from.x,
          top: from.y,
          // Grows from its top-left corner, which travels to the held stack's.
          transformOrigin: [0, 0, 0],
          transform: [
            { translateX: toward(from.x, to.x, pan.x) },
            { translateY: toward(from.y, to.y, pan.y) },
            { scale: t.interpolate({ inputRange: [0, 1], outputRange: [startScale, 1] }) },
          ],
        },
      ]}>
      <CardView deck={deck} card={card} faceUp={faceUp} flipIn={fromFaceUp !== faceUp} width={width} sharp />
    </Animated.View>
  );
}

/**
 * One card flying to its new place (see `moveCards` in Table). It waits where it was until its turn (and until
 * its new place has been measured), then flies there, resizing between the two places' card sizes and turning
 * over on the way if it lies the other way up there. It's drawn at `size`, the largest card size, so it stays
 * sharp, and scaled down to fit.
 */
function CardFlight({
  flight,
  deck,
  card,
  fromCard,
  size,
  onLanded,
  onGone,
}: {
  flight: Flight;
  deck: Deck;
  card: Card | undefined;
  /** A different card to show until it sets off (a stack turning over shows its old top card first). */
  fromCard?: Card;
  size: number;
  /** It's there: the real card can show underneath. */
  onLanded: () => void;
  /** The real card has surely been drawn by now: the copy can go. */
  onGone: () => void;
}) {
  const { from, to, delay } = flight;
  const [t] = useState(() => new Animated.Value(0));
  const [setOff, setSetOff] = useState(false);
  useEffect(() => {
    if (!to) return;
    const timer = setTimeout(() => {
      setSetOff(true);
      Animated.timing(t, { toValue: 1, duration: FLIGHT_MOVE_MS, easing: Easing.inOut(Easing.cubic), useNativeDriver: true }).start(
        ({ finished }) => finished && onLanded(),
      );
    }, delay);
    return () => clearTimeout(timer);
    // Flies once, as soon as it knows where to.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!to]);
  // Once landed it stays a moment over the real card, which may have just appeared there and take a frame or
  // two to draw its picture.
  useEffect(() => {
    if (!flight.landed) return;
    const timer = setTimeout(onGone, 150);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flight.landed]);
  const end = to ?? from;
  return (
    <Animated.View
      style={[
        styles.pickup,
        {
          left: from.x,
          top: from.y,
          transformOrigin: [0, 0, 0],
          transform: [
            { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [0, end.x - from.x] }) },
            { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [0, end.y - from.y] }) },
            { scale: t.interpolate({ inputRange: [0, 1], outputRange: [from.w / size, end.w / size] }) },
          ],
        },
      ]}>
      {/* Changing card and face together, it keeps the old card until it's edge-on, then shows the new one. */}
      <CardView deck={deck} card={setOff || !fromCard ? card : fromCard} faceUp={setOff ? flight.toFaceUp : flight.fromFaceUp} width={size} sharp />
    </Animated.View>
  );
}

/** A brief message over the table, fading in and out. */
function Toast({ toast }: { toast: { msg: string } | null }) {
  // The last message, kept while it fades away.
  const [shown, setShown] = useState(toast);
  if (toast && toast !== shown) setShown(toast);
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(opacity, { toValue: toast ? 1 : 0, duration: toast ? 140 : 220, useNativeDriver: true }).start(
      ({ finished }) => finished && !toast && setShown(null),
    );
  }, [toast, opacity]);
  if (!shown) return null;
  return (
    <Animated.View
      style={[
        styles.toast,
        { pointerEvents: 'none', opacity, transform: [{ translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] },
      ]}>
      <Text style={styles.toastText}>{shown.msg}</Text>
    </Animated.View>
  );
}

/** The trash can shown while dragging: it fades in, and turns red and swells while cards are over it. */
function TrashTarget({ rect, hot }: { rect: Rect; hot: boolean }) {
  const [appear] = useState(() => new Animated.Value(0));
  const [heat] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(appear, { toValue: 1, duration: 140, useNativeDriver: true }).start();
  }, [appear]);
  useEffect(() => {
    Animated.spring(heat, { toValue: hot ? 1 : 0, speed: 30, bounciness: 6, useNativeDriver: true }).start();
  }, [hot, heat]);
  return (
    <Animated.View
      style={[
        styles.trash,
        {
          left: rect.x,
          top: rect.y,
          width: rect.w,
          height: rect.h,
          opacity: appear,
          transform: [{ scale: heat.interpolate({ inputRange: [0, 1], outputRange: [1, 1.15] }) }],
        },
      ]}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.trashHot, { opacity: heat }]} />
      <SymbolView name={{ ios: 'trash', android: 'delete', web: 'delete' }} size={24} tintColor="#fff" />
    </Animated.View>
  );
}

/** Fades its contents in when it appears, e.g. the FLIP button as a card is picked up. */
function FadeIn({ style, children }: { style: StyleProp<ViewStyle>; children: ReactNode }) {
  const [opacity] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(opacity, { toValue: 1, duration: 140, useNativeDriver: true }).start();
  }, [opacity]);
  return <Animated.View style={[style, { opacity }]}>{children}</Animated.View>;
}

/** The piles the search can look through. */
type SearchPile = 'deck' | 'discard' | 'trash';

const SEARCHABLE: { zone: SearchPile; label: string }[] = [
  { zone: 'deck', label: 'Deck' },
  { zone: 'discard', label: 'Discard' },
  { zone: 'trash', label: 'Trash' },
];

/** A finger on the screen, as read from a touch event (which isn't kept). */
interface Finger {
  identifier: string;
  pageX: number;
  pageY: number;
}

/** Where a finger holds a card, and how wide the card is drawn there. */
interface Grip {
  offX: number;
  offY: number;
  width: number;
}

/** How long the search takes to slide up over the table, and away again. */
const SEARCH_IN_MS = 240;
const SEARCH_OUT_MS = 180;

/**
 * Every card in the deck or discard pile, top card first, with a switch between them. It slides up over the
 * table (a layer of it, not a separate window, so a drag can carry on out of it onto the table).
 *
 * - Tap a card for its options.
 * - Hold a card to pick it up and drag it to another place in the pile; tap more with a second finger to
 *   carry several.
 * - While holding cards, tap Close with another finger to take them out: the search gets out of the way and
 *   they carry on as a normal drag over the table, to drop anywhere (see `onTakeOut`).
 */
function SearchPanel({
  zone,
  leaving,
  deck,
  table,
  onReorder,
  onTakeOut,
  cardMenu,
  onSwitch,
  onClose,
  onClosed,
}: {
  /** The pile being searched, or null when the search is closed. */
  zone: SearchPile | null;
  /** Cards have been taken out and are being carried over the table: fade away, but stay until they're dropped. */
  leaving: boolean;
  deck: Deck;
  table: TableState;
  onReorder: (zone: SearchPile, picked: number[], to: number) => void;
  /**
   * Held cards (top first) taken out of the search, with the finger still on them, held at `grip`: where on the
   * first card the finger is, and how wide it's drawn.
   */
  onTakeOut: (zone: SearchPile, iids: string[], finger: Finger, grip: Grip) => void;
  cardMenu: (iid: string, from: Zone, wholeStack?: boolean, onFullSize?: () => void) => { tiles: SheetTile[]; actions: SheetAction[] };
  onSwitch: (zone: SearchPile) => void;
  onClose: () => void;
  /** It has finished sliding away. */
  onClosed: () => void;
}) {
  const { width, height: screenHeight } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  /** The selected card shown full size over its menu. */
  const [zoomedHere, setZoomedHere] = useState<string | null>(null);
  // The pile last shown, kept while the search slides away.
  const [shownZone, setShownZone] = useState(zone);
  if (zone && zone !== shownZone) setShownZone(zone);
  // Below the screen until measured, so it never peeks in at the wrong place on its first frame.
  const [height, setHeight] = useState(screenHeight);
  // 0 is closed, 1 open: how far it has slid up. Fading (when cards are taken out) is separate.
  const [open] = useState(() => new Animated.Value(0));
  const [fade] = useState(() => new Animated.Value(1));
  const visible = zone !== null;
  /** Cards held in the grid, if any: tapping Close then takes them out rather than leaving them. */
  const [holding, setHolding] = useState<GridHold | null>(null);
  const closeRef = useRef<View>(null);

  // A second finger lifting off Close while the first holds cards: take them out, with the first finger still
  // on them. (Watched here, above both, since the two fingers are on different parts of the search.)
  const touchEnd = (e: GestureResponderEvent) => {
    const held = holding;
    if (!held || !pile) return;
    const tap = e.nativeEvent.changedTouches.find((t) => t.identifier !== held.touchId);
    const holder = e.nativeEvent.touches.find((t) => t.identifier === held.touchId);
    if (!tap || !holder) return;
    // Read now: the event isn't kept.
    const at = { x: tap.pageX, y: tap.pageY };
    const finger = { identifier: holder.identifier, pageX: holder.pageX, pageY: holder.pageY };
    closeRef.current?.measureInWindow((x, y, w, h) => {
      if (at.x < x || at.x > x + w || at.y < y || at.y > y + h) return;
      held.letGo();
      setHolding(null);
      onTakeOut(pile, held.picked.map((i) => table[pile][i].iid), finger, { offX: held.offX, offY: held.offY, width: cardWidth * 1.08 });
    });
  };

  useEffect(() => {
    if (visible) {
      fade.setValue(1);
      Animated.timing(open, { toValue: 1, duration: SEARCH_IN_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
    } else {
      Animated.timing(open, { toValue: 0, duration: SEARCH_OUT_MS, easing: Easing.in(Easing.quad), useNativeDriver: true }).start(
        ({ finished }) => finished && onClosed(),
      );
    }
    // Slides on opening and closing only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);
  useEffect(() => {
    if (leaving) Animated.timing(fade, { toValue: 0, duration: 150, useNativeDriver: true }).start();
  }, [leaving, fade]);

  const pile = shownZone;
  const cards = pile ? table[pile] : [];
  const cardsById = new Map(deck.cards.map((c) => [c.id, c]));
  const columns = 4;
  const cardWidth = (width - 16 * 2 - 8 * (columns - 1)) / columns;
  const selectedCard = selected ? cards.find((c) => c.iid === selected) : undefined;

  return (
    <Animated.View
      onLayout={(e) => setHeight(e.nativeEvent.layout.height)}
      onTouchEnd={touchEnd}
      style={[
        StyleSheet.absoluteFill,
        styles.searchScreen,
        // Out of the way once cards are taken out, though still there: the finger carrying them started here.
        { pointerEvents: leaving || !visible ? 'none' : 'auto', opacity: fade },
        { transform: [{ translateY: open.interpolate({ inputRange: [0, 1], outputRange: [height, 0] }) }] },
      ]}>
      <View style={[styles.searchHeader, { paddingTop: 10 }]}>
        <View style={styles.searchTabs}>
          {SEARCHABLE.map((s) => (
            <Pressable
              key={s.zone}
              onPress={() => onSwitch(s.zone)}
              accessibilityRole="tab"
              accessibilityState={{ selected: pile === s.zone }}
              style={[styles.searchTab, pile === s.zone && styles.searchTabActive]}>
              <Text style={[styles.searchTabText, pile === s.zone && { color: colors.accentText }]}>
                {s.label} · {table[s.zone].length}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      {pile && cards.length ? (
        <ReorderableGrid
          // A fresh grid for each pile, so a drag in one never carries over to the other.
          key={pile}
          items={cards}
          keyOf={(c) => c.iid}
          columns={columns}
          itemWidth={cardWidth}
          gap={8}
          padding={16}
          renderItem={(item) => (
            <View>
              <CardView deck={deck} card={cardsById.get(item.cardId)} width={cardWidth} />
              <Text style={styles.searchIndex}>{cards.indexOf(item) + 1}</Text>
            </View>
          )}
          renderLifted={(item) => <CardView deck={deck} card={cardsById.get(item.cardId)} width={cardWidth} sharp />}
          onPress={(item) => {
            setSelected(item.iid);
            setSheetOpen(true);
          }}
          onMove={(picked, to) => onReorder(pile, picked, to)}
          onHold={setHolding}
        />
      ) : (
        <Text style={styles.hint}>No cards here.</Text>
      )}
      <View ref={closeRef} style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 12 }}>
        {/* A tap while holding cards is handled above (it takes them out), so here it just closes. */}
        <Button label="Close" onPress={() => !holding && onClose()} />
      </View>

      <ActionSheet
        visible={sheetOpen}
        onClose={() => {
          setSheetOpen(false);
          setZoomedHere(null);
        }}
        title={selectedCard ? cardsById.get(selectedCard.cardId)?.name : undefined}
        header={
          selectedCard ? (
            <View style={{ alignItems: 'center', marginBottom: 6 }}>
              <CardView deck={deck} card={cardsById.get(selectedCard.cardId)} width={Math.min(240, width * 0.6)} />
            </View>
          ) : null
        }
        {...(selectedCard && pile
          ? cardMenu(selectedCard.iid, pile, false, () => setZoomedHere(selectedCard.iid))
          : { actions: [] })}
        overlay={
          zoomedHere && selectedCard?.iid === zoomedHere && cardsById.get(selectedCard.cardId) ? (
            <CardZoom
              deck={deck}
              current={{ key: zoomedHere, card: cardsById.get(selectedCard.cardId)! }}
              area={{ w: width, h: screenHeight }}
              onClose={() => setZoomedHere(null)}
            />
          ) : null
        }
      />
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  felt: { flex: 1, backgroundColor: colors.felt },
  center: { alignItems: 'center', justifyContent: 'center' },
  muted: { color: colors.textMuted },
  headerButton: { color: colors.accent, fontSize: 17, fontWeight: '600' },
  headerButtons: { flexDirection: 'row', alignItems: 'center', gap: 22 },
  banner: { backgroundColor: colors.accent, paddingVertical: 8, paddingHorizontal: 12 },
  bannerText: { color: colors.accentText, textAlign: 'center', fontWeight: '600' },
  piles: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    padding: 16,
    backgroundColor: colors.feltDark,
  },
  pile: { alignItems: 'center', gap: 6 },
  // The deck while it's being shuffled: its halves swing out over the buttons and the other pile.
  above: { zIndex: 2 },
  pileSlot: { borderRadius: 10, borderWidth: 2, borderColor: 'transparent', padding: 2 },
  pileLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600' },
  pileButtons: { flex: 1, gap: 8, paddingHorizontal: 12, justifyContent: 'center' },
  reveal: { flex: 1, flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12 },
  revealPiles: { flex: 1, alignItems: 'center', justifyContent: 'space-evenly' },
  revealRail: { width: REVEAL_RAIL, alignItems: 'flex-end', justifyContent: 'center', gap: 18 },
  playArea: { flex: 1, borderWidth: 2, borderColor: 'transparent' },
  // The cards are placed in the grid by hand (see `spotPlace`).
  playAreaContent: { flexGrow: 1 },
  // Where carried cards will land on the table.
  dropSpot: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.45)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    pointerEvents: 'none',
  },
  dropTarget: { borderColor: colors.accent, borderWidth: 2, backgroundColor: 'rgba(224,179,84,0.12)' },
  hint: { color: 'rgba(255,255,255,0.5)', textAlign: 'center', width: '100%', marginTop: 24 },
  hand: { backgroundColor: 'rgba(0,0,0,0.35)', paddingTop: 8, borderWidth: 2, borderColor: 'transparent' },
  handLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600', paddingHorizontal: 16, marginBottom: 6 },
  handCards: { paddingHorizontal: 16, gap: 8 },
  lifted: {
    position: 'absolute',
    pointerEvents: 'none',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  flip: {
    position: 'absolute',
    pointerEvents: 'none',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: FLIP_SIZE.h / 2,
    backgroundColor: colors.accent,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 14,
  },
  collapsed: { position: 'absolute', opacity: 0 },
  hiddenCard: { opacity: 0 },
  // A zero-size point at the stack's bottom-right corner; the badge hangs off it, up and to the left, and
  // grows out of that corner.
  stackingAnchor: { position: 'absolute', width: 0, height: 0, pointerEvents: 'none' },
  stackTargetOutline: {
    position: 'absolute',
    left: -3,
    top: -3,
    right: -3,
    bottom: -3,
    borderWidth: 3,
    borderColor: colors.accent,
    pointerEvents: 'none',
  },
  stackCount: {
    position: 'absolute',
    right: -6,
    bottom: -6,
    // Pops grow out of the stack's corner.
    transformOrigin: ['100%', '100%', 0],
    // Big enough to grab: dragging it moves the whole stack.
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  stackCountText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  landing: { position: 'absolute', left: 0, top: 0, pointerEvents: 'none' },
  pickup: { position: 'absolute', pointerEvents: 'none' },
  landingShadow: { position: 'absolute', left: 0, top: 0, backgroundColor: colors.surfaceRaised },
  // Matches a pile's edges (PileDepth), for a landing stack's stand-in.
  pileEdge: { backgroundColor: '#d8d3c8', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.45)' },
  stage: { overflow: 'hidden' },
  // The piles sit straight on the cloth, and the hand on the wooden rail.
  pilesOnCloth: { backgroundColor: 'transparent' },
  handOnRail: { backgroundColor: 'transparent', overflow: 'hidden' },
  // The revealed card in flight, drawn without a shadow.
  flying: { position: 'absolute', left: 0, top: 0, pointerEvents: 'none' },
  stackEdge: {
    position: 'absolute',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  stackBadge: {
    position: 'absolute',
    top: -10,
    right: -10,
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 6,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackBadgeText: { color: colors.accentText, fontWeight: '800', fontSize: 14 },
  flipText: { color: colors.accentText, fontSize: 20, fontWeight: '800', letterSpacing: 2 },
  trash: {
    position: 'absolute',
    pointerEvents: 'none',
    borderRadius: TRASH_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
  },
  trashHot: { borderRadius: TRASH_SIZE / 2, backgroundColor: colors.danger },
  toast: {
    position: 'absolute',
    top: '40%',
    alignSelf: 'center',
    backgroundColor: 'rgba(0,0,0,0.75)',
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 20,
  },
  toastText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  searchScreen: { flex: 1, backgroundColor: colors.bg },
  searchHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16 },
  searchTabs: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 10, padding: 3, flex: 1, marginRight: 16 },
  searchTab: { flex: 1, paddingVertical: 9, borderRadius: 8, alignItems: 'center' },
  searchTabActive: { backgroundColor: colors.accent },
  searchTabText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  // A card menu's switch between acting on the card and on its whole stack.
  scope: { flexDirection: 'row', alignSelf: 'stretch', backgroundColor: colors.surfaceRaised, borderRadius: 10, padding: 3 },
  scopeItem: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  scopeItemOn: { backgroundColor: colors.accent },
  scopeText: { color: colors.text, fontSize: 14, fontWeight: '600' },
  searchIndex: { color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 2 },
});
