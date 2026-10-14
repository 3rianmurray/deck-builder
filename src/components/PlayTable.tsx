import * as Haptics from 'expo-haptics';
import { router, Stack } from 'expo-router';
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { Dispatch, ReactNode, SetStateAction } from 'react';
import {
  Alert,
  Animated,
  Easing,
  FlatList,
  LayoutAnimation,
  Modal,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent, NativeTouchEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ActionSheet, type SheetAction } from './ActionSheet';
import { Button } from './Button';
import { IconButton } from './IconButton';
import { matSpot, TableLookContext, TabletopSurface, tabletopShadow, WoodRail } from './Tabletop';
import { CardZoom, type ZoomItem } from './CardZoom';
import { CardView, EmptySlot, PileDepth, pileRise, pileThickness, prefersReducedMotion } from './CardView';
import { useDecks } from '../lib/DecksContext';
import * as T from '../lib/table';
import { fitTilt, tiltTransform, unproject } from '../lib/tilt';
import { cardRatio } from '../lib/types';
import type { CardInstance, Deck, PlayMode, TableLook, TableState, Zone } from '../lib/types';
import { colors } from '../theme';

type Sheet =
  | { kind: 'card'; iid: string }
  | { kind: 'discard' }
  | { kind: 'table' };

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
/** How long a revealed card takes to travel from the deck to the discard pile. */
const FLIGHT_MS = 450;
/** Where a pile's top card sits inside its slot (the slot's highlight border plus padding). */
const PILE_INSET = 4;
/** Height taken in reveal mode by everything but the two cards: their labels, gaps and padding. */
const REVEAL_CHROME = 100;
/** Width of reveal mode's column of icon buttons, including the gap beside it. */
const REVEAL_RAIL = 72;
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
  /** The width the glide starts at: the held stack's. */
  width: number;
  /** The first card's layout when it was dropped, to tell when it has been laid out in its new place. */
  before?: Rect;
  /** The glide has finished and the real cards are showing; the stand-in goes a moment later. */
  revealed?: boolean;
  /** How far up and left of its spot the card lands: on top of a stack it sits risen above the pile. */
  rise: number;
  /** The card's view is already in its final place, so the glide can start straight away. */
  settled?: boolean;
}

/** A position between the cards in the hand or on the table, counting the cards there that aren't being carried. */
interface InsertAt {
  zone: 'hand' | 'table';
  index: number;
}

interface HeldCard {
  iid: string;
  cardId: string;
  from: Zone;
}

interface PressOptions {
  onPress?: () => void;
  onLongPress?: () => void;
  verticalOnly?: boolean;
}

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
  const look = decks.settings.tableLook;
  return (
    // Cards and piles read the look from here, to match their shadows to it.
    <TableLookContext.Provider value={look}>
      <Table
        deck={deck}
        table={table}
        setTable={setTable}
        setMode={(mode) => decks.setPlayMode(deck.id, mode)}
        look={look}
        setLook={decks.setTableLook}
        active={active}
        onTouchingCard={onTouchingCard}
      />
    </TableLookContext.Provider>
  );
}

function Table({
  deck,
  table,
  setTable,
  setMode,
  look,
  setLook,
  active,
  onTouchingCard,
}: PageProps & {
  deck: Deck;
  table: TableState;
  setTable: Dispatch<SetStateAction<TableState | undefined>>;
  setMode: (mode: PlayMode) => void;
  look: TableLook;
  setLook: (look: TableLook) => void;
}) {
  const mode: PlayMode = deck.playMode ?? 'table';
  const reveal = mode === 'reveal';
  const tabletop = look === 'tabletop';
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [sheet, setSheet] = useState<Sheet>({ kind: 'table' });
  const [sheetOpen, setSheetOpen] = useState(false);
  const [searchZone, setSearchZone] = useState<Zone | null>(null);
  const [toast, setToast] = useState<{ msg: string } | null>(null);

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
  const [flying, setFlying] = useState<{ iid: string; cardId: string; faceUp: boolean; landed?: boolean } | null>(null);
  const [flight] = useState(() => ({ pos: new Animated.ValueXY(), scale: new Animated.Value(1) }));
  /** The flying card is gone once the real top card of the discard pile has been drawn under it. */
  const flightDone = (iid: string) => setFlying((f) => (f?.landed && f.iid === iid ? null : f));
  /** The card (by instance, so its neighbours can be found) blown up to nearly full screen, if any. */
  const [zoomed, setZoomed] = useState<string | null>(null);
  const [rootSize, setRootSize] = useState({ w: 0, h: 0 });

  // The tabletop's camera tilt. Everything on the table is laid out flat and drawn tilted, so screen positions
  // (fingers) are converted back onto the flat table before comparing them with any layout.
  const tilt = fitTilt(rootSize, tabletop ? TILT_ANGLE : 0, TILT_PERSPECTIVE);
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
    setTable((t) => (t ? fn(t) : t));
    if (msg) flash(msg);
  };

  const open = (s: Sheet) => {
    setSheet(s);
    setSheetOpen(true);
  };

  const confirmReset = () =>
    Alert.alert('Reset the table?', 'Every card goes back into the deck, face down.', [
      { text: 'Shuffled', onPress: () => apply(T.resetTable, 'Shuffled') },
      { text: 'In deck order', onPress: () => apply(() => T.orderedTable(deck), 'Back in deck order') },
      { text: 'Cancel', style: 'cancel' },
    ]);

  const moveActions = (iid: string, from: Zone): SheetAction[] => {
    const to = (zone: Zone, label: string, position?: T.Position): SheetAction => ({
      label,
      onPress: () => apply((t) => T.moveCard(t, iid, zone, position)),
    });
    const actions: SheetAction[] = [];
    if (!reveal) {
      if (from !== 'hand') actions.push(to('hand', 'Put in hand'));
      if (from !== 'table') actions.push(to('table', 'Play to table'));
      if (from === 'table' || from === 'hand') actions.push({ label: 'Flip over', onPress: () => apply((t) => T.flip(t, iid)) });
    }
    if (from !== 'discard') actions.push(to('discard', 'Discard'));
    actions.push(to('deck', from === 'deck' ? 'Move to top of deck' : 'Put on top of deck', 'top'));
    actions.push(to('deck', from === 'deck' ? 'Move to bottom of deck' : 'Put on bottom of deck', 'bottom'));
    return actions;
  };

  /** Turns the top card of the deck face up onto the discard pile. */
  const revealNext = () => {
    const top = table.deck[0];
    if (!top || flying) return;
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
    const lift = pileRise(pileWidth, table.deck.length);
    const land = pileRise(pileWidth, table.discard.length + 1);
    flight.pos.setValue({ x: from.x + PILE_INSET - lift, y: from.y + PILE_INSET - lift });
    flight.scale.setValue(1);
    setFlying({ iid: top.iid, cardId: top.cardId, faceUp: false });
    setTimeout(() => setFlying((f) => f && { ...f, faceUp: true }), FLIGHT_MS * 0.2);
    const half = { duration: FLIGHT_MS / 2, useNativeDriver: true };
    Animated.parallel([
      Animated.timing(flight.pos, {
        toValue: { x: to.x + PILE_INSET - land, y: to.y + PILE_INSET - land },
        duration: FLIGHT_MS,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
      // Rises a little mid-flight, then settles onto the pile.
      Animated.sequence([
        Animated.timing(flight.scale, { toValue: 1.12, easing: Easing.out(Easing.quad), ...half }),
        Animated.timing(flight.scale, { toValue: 1, easing: Easing.in(Easing.quad), ...half }),
      ]),
    ]).start(() => {
      // Put the real card on the pile under the flying one; the flying one goes once that's drawn (or after a
      // moment, if its picture is slow to report).
      move();
      setFlying((f) => f && { ...f, landed: true });
      setTimeout(() => flightDone(top.iid), 150);
    });
  };

  const switchMode = (next: PlayMode) => {
    setMode(next);
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
  // In reveal mode the piles decide which way up a card lies, so there is nothing to flip.
  const flipRect: Rect | undefined = !reveal && playRect ? {
    x: playRect.x + (playRect.w - FLIP_SIZE.w) / 2,
    y: playRect.y + playRect.h - FLIP_SIZE.h - 16,
    ...FLIP_SIZE,
  } : undefined;

  const zoneAt = (pageX: number, pageY: number): Zone | null => {
    const p = toTable(pageX, pageY);
    return p ? (zoneRects.find(([, r, pad]) => r && inside(r, p.x, p.y, pad))?.[0] ?? null) : null;
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
  const isAway = (iid: string) => isHeld(iid) || flying?.iid === iid;
  /** As `isAway`, for drawing: a just-lifted card stays on its pile until its lifted copy is showing. */
  const drawnAway = (iid: string) => carriedAway(iid) || (flying?.iid === iid && !flying.landed);
  /** The top card of a pile that isn't already in the held stack: what tapping that pile would pick up. */
  const nextFree = (zone: Zone) => table[zone].find((c) => !isAway(c.iid));

  // The play table in groups: each stack together (bottom first), every other card alone. A group is drawn as
  // one card, in the view of its top card (its last), which is the view that's measured; while cards are being
  // carried off it, the next one down shows.
  const tableGroups = T.stackGroups(table.table);
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
    if (card) animateLayout();
    if (card) setDrag((d) => (d && !d.stack.some((c) => c.iid === card.iid) ? { ...d, stack: [card, ...d.stack] } : d));
  };

  const endDrag = () => {
    // Cards dropped (or put back) slide into their new places.
    if (drag?.active) animateLayout();
    setDrag(null);
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

  const drop = (d: Drag, zone: Zone | null, at: InsertAt | null, onto: string | null) => {
    const ids = d.stack.map((h) => h.iid);

    // Glide in from where the held stack is now (its top-left corner, as drawn) to wherever the cards end up,
    // even if that's exactly where they came from: otherwise they'd jump back into place. The stand-in starts
    // exactly as the held card was drawn, at the lifted size, and shrinks as it lands, so it stays sharp.
    // `rise` is how far above its spot the card ends up (on top of a stack).
    // `settled`: the card's view is already where it will end up (its own blank space, back in its own row), so
    // there's no new layout to wait for before gliding.
    const glideIn = (to: 'hand' | 'table', rise = 0, settled = false) => {
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
        faceUp: d.faceUp,
        width: d.width * LIFTED_SCALE,
        before: cardLayouts[ids[0]],
        rise,
        settled,
      });
    };
    /** Whether the dragged card left a blank space in this row (a single card, not the top of a stack). */
    const leftBlankIn = (z: Zone) =>
      d.from === z && (z === 'hand' || tableGroups.some((g) => g.length === 1 && g[0].iid === d.iid));

    // Let go somewhere that isn't a place for cards: a single card from the hand or table glides back into
    // its blank space.
    if (!zone) {
      if (d.stack.length === 1 && (d.from === 'hand' || d.from === 'table') && leftBlankIn(d.from)) {
        glideIn(d.from, 0, true);
      }
      return;
    }

    // Dropped right on a table card or stack: the cards go on top of it, making (or growing) a stack.
    if (zone === 'table' && onto) {
      const group = tableGroups.find((g) => g.some((c) => c.iid === onto));
      const staying = group ? group.filter((c) => !isHeld(c.iid)).length : 1;
      glideIn('table', pileRise(tableCardWidth, staying + ids.length));
      apply((t) => T.stackOnto(t, ids, onto, d.faceUp));
      // The held stack's top card becomes the stack's top; its count pops again as the new count.
      setPoppedStack(ids[0]);
      return;
    }

    // In the hand or on the table the cards go where the finger is, between the cards there.
    if ((zone === 'hand' || zone === 'table') && at?.zone === zone) {
      // A single card dropped back into its own row lands in its blank space, which is already in place.
      glideIn(zone, 0, d.stack.length === 1 && leftBlankIn(zone));
      // A single card put back exactly where it came from stays put, just turned over if it was flipped. Not a
      // card taken off a stack, though: as the stack's top it sits at the stack's end, so dropping it just after
      // the stack looks like "the same place", but it's meant to come off the stack and sit beside it.
      const was = table[zone].findIndex((c) => c.iid === d.iid);
      const wasStacked = !!table[zone][was]?.stack;
      if (d.stack.length === 1 && zone === d.from && at.index === was && !wasStacked) {
        if (d.faceUp !== d.startFaceUp) apply((t) => T.flip(t, d.iid));
        return;
      }
      apply((t) => T.insertCards(t, ids, zone, at.index, d.faceUp));
      return;
    }
    // A single card put back on its own pile stays where it is, just turned over if it was flipped.
    if (d.stack.length === 1 && zone === d.from) {
      if (d.faceUp !== d.startFaceUp) apply((t) => T.flip(t, d.iid));
      return;
    }
    // Piles keep their rules: the deck is always face down and the discard pile always face up.
    const faceUp = zone === 'deck' ? false : zone === 'discard' ? true : d.faceUp;
    if (zone === 'discard' && !d.faceUp) setRevealed(d.stack[0].iid);
    apply((t) => T.moveCards(t, ids, zone, faceUp));
  };

  /** Where a card in the hand or on the table sits on the (flat) table, counting how far its row is scrolled. */
  const laidOutAt = (zone: 'hand' | 'table') =>
    zone === 'table'
      ? playRect && { x: playRect.x, y: playRect.y - scroll.play }
      : handRect && layout.handScroll && { x: handRect.x + layout.handScroll.x - scroll.hand, y: handRect.y + layout.handScroll.y };

  /**
   * Where dropped cards would go in the hand or on the table: after every card that comes before the finger.
   * In the hand that's every card to its left; on the table it reads like a page, so also every card in a row
   * above it. Cards being carried don't count, since they're leaving.
   */
  const insertionAt = (zone: 'hand' | 'table', pageX: number, pageY: number): number | null => {
    const o = laidOutAt(zone);
    const p = toTable(pageX, pageY);
    if (!o || !p) return null;
    if (zone === 'hand') {
      return table.hand.filter((c) => {
        const r = !isHeld(c.iid) && cardLayouts[c.iid];
        return r && o.x + r.x + r.w / 2 < p.x;
      }).length;
    }
    // On the table each stack is one spot, so count whole stacks (less any cards being carried off them).
    let index = 0;
    for (const g of tableGroups) {
      const r = groupRect(g);
      const left = g.filter((c) => !isHeld(c.iid)).length;
      if (!r || left === 0) continue;
      const before = r.y + r.h <= p.y || (p.y >= r.y && p.y < r.y + r.h && r.x + r.w / 2 < p.x);
      if (before) index += left;
    }
    return index;
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
    const g = tableGroups.find((grp) => grp.some((c) => c.iid === onto));
    const r = g && groupRect(g);
    if (!drag || !liftedFrom || !g || !r) return null;
    const total = g.filter((c) => !isHeld(c.iid)).length + drag.stack.length;
    const rise = pileRise(tableCardWidth, total);
    const scale = r.w / liftedWidth;
    const x = r.x - rise;
    const y = r.y - rise;
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
    Haptics.selectionAsync();
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
    Haptics.selectionAsync();
  };

  const followFinger = (finger: NativeTouchEvent) => {
    if (!drag) return;
    const delta = tableDelta(drag.startX, drag.startY, finger);
    lastPan.set(delta);
    // While settled on a stack target (or springing back from one) the held stack doesn't follow the finger.
    if (!snap.get().on && !snap.get().returning) pan.setValue(delta);
    const zone = zoneAt(finger.pageX, finger.pageY);
    if (zone !== hover) setHover(zone);
    // Over the middle of a table card it's a stack; anywhere else in the hand or on the table, a gap.
    const onto = zone === 'table' ? stackTargetAt(finger.pageX, finger.pageY) : null;
    const index = !onto && (zone === 'hand' || zone === 'table') ? insertionAt(zone, finger.pageX, finger.pageY) : null;
    const next = zone && index !== null ? { zone: zone as 'hand' | 'table', index } : null;
    const moved = next?.zone !== insertAt?.zone || next?.index !== insertAt?.index;
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
          zoomable: inst.faceUp && from !== 'deck',
          active: false,
          abandoned: false,
          orphaned: false,
          startFaceUp: inst.faceUp,
          faceUp: inst.faceUp,
          stack: [{ iid: inst.iid, cardId: inst.cardId, from }],
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
        (longPress ? opts.onLongPress : opts.onPress)?.();
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
      style={[{ pointerEvents: 'box-only' }, collapsed && styles.collapsed]}>
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

  const renderCard = (inst: CardInstance, w: number, from: Zone) =>
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
        <View style={(carriedAway(inst.iid) || landingOn(inst.iid)) && styles.hiddenCard}>
          <CardView deck={deck} card={cardsById.get(inst.cardId)} faceUp={inst.faceUp} width={w} />
        </View>
        {targetOutline(inst.iid)}
      </>,
      measureCard(inst.iid),
      // The card being dragged keeps its spot, as the blank space that moves to where it will land; any other
      // cards carried with it step out of the row, and their neighbours close up.
      isHeld(inst.iid) && inst.iid !== drag?.iid,
    );

  /**
   * A stack on the table: drawn like a small pile, its top card risen above the rest, with a count. It's
   * handled through its top card's view: dragging it takes the top card off (the next one down then shows),
   * and tapping opens the top card's menu. Once every card is being carried off it, it steps out of the row
   * like a single card does.
   */
  const renderStack = (g: CardInstance[]) => {
    if (g.length === 1) return renderCard(g[0], tableCardWidth, 'table');
    const top = groupTop(g);
    // As drawn: a card lifted off the stack stays on it until its lifted copy is showing.
    const shown = [...g].reverse().find((c) => !carriedAway(c.iid));
    const left = g.filter((c) => !carriedAway(c.iid)).length;
    return draggable(
      top,
      'table',
      tableCardWidth,
      { onPress: () => open({ kind: 'card', iid: shown?.iid ?? top.iid }) },
      <>
        <PileDepth deck={deck} width={tableCardWidth} count={left}>
          {shown ? (
            <View key={shown.iid} style={landingOn(shown.iid) && styles.hiddenCard}>
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
      g.every((c) => isHeld(c.iid)),
    );
  };

  // ---- Rows while dragging, home-screen style ----
  // The card being dragged leaves a blank space where it was. Over its own row, that space moves to wherever
  // the card would land and the cards around it slide over to make room; over the other row, a fresh space
  // opens there instead, and the one it left stays put until it's dropped.

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

  const tableRow = (): RowItem<CardInstance[]>[] => {
    if (!drag?.active) return tableGroups.map((item) => ({ kind: 'item', item }));
    // Only a single card dragged from the table leaves a blank; taking the top off a stack leaves the stack.
    const own = drag.from === 'table' ? tableGroups.find((g) => g.length === 1 && g[0].iid === drag.iid) : undefined;
    const staying = tableGroups.filter((g) => g !== own && g.some((c) => !isHeld(c.iid)));
    const extras = tableGroups.filter((g) => g !== own && !g.some((c) => !isHeld(c.iid))).map((item) => ({ kind: 'item' as const, item }));
    // Insertion points count cards; turn one into a position among the (stacked) spots.
    const spotFor = (cards: number) => {
      let n = 0;
      for (let i = 0; i < staying.length; i++) {
        if (n >= cards) return i;
        n += staying[i].filter((c) => !isHeld(c.iid)).length;
      }
      return staying.length;
    };
    const ownIndex = own ? table.table.findIndex((c) => c.iid === own[0].iid) : -1;
    const home = own ? spotFor(table.table.filter((c, i) => !isHeld(c.iid) && i < ownIndex).length) : 0;
    const at = insertAt?.zone === 'table' && !stackTarget ? spotFor(insertAt.index) : null;
    return [...arrange(staying, own, home, at), ...extras];
  };

  /** A blank space the size of a card in a row, where carried cards would land. */
  const gap = (w: number) => <View key="gap" style={{ width: w, height: w / ratio }} />;

  const sheetProps = (() => {
    switch (sheet.kind) {
      case 'card': {
        const found = T.findCard(table, sheet.iid);
        if (!found) return { actions: [] };
        const inst = table[found.zone][found.index];
        const card = cardsById.get(inst.cardId);
        // Show the card as it lies, so tapping a face-down card doesn't reveal it.
        return {
          title: inst.faceUp ? card?.name : 'Face-down card',
          header: (
            <View style={{ alignItems: 'center', marginBottom: 6 }}>
              <CardView deck={deck} card={card} faceUp={inst.faceUp} width={Math.min(240, width * 0.6)} />
            </View>
          ),
          actions: [
            ...(inst.faceUp ? [{ label: 'View full size', onPress: () => setZoomed(inst.iid) }] : []),
            ...moveActions(inst.iid, found.zone),
          ],
        };
      }
      case 'discard':
        return {
          title: `Discard pile · ${table.discard.length} cards`,
          actions: [
            ...(table.discard[0] ? [{ label: 'View top card full size', onPress: () => setZoomed(table.discard[0].iid) }] : []),
            ...(reveal
              ? [{ label: 'Put top card back on the deck', onPress: () => apply((t) => T.takeTopOfDiscard(t, 'deck')) }]
              : [
                  { label: 'Take top card into hand', onPress: () => apply((t) => T.takeTopOfDiscard(t, 'hand')) },
                  { label: 'Play top card to table', onPress: () => apply((t) => T.takeTopOfDiscard(t, 'table')) },
                ]),
            { label: 'Search discard pile', opensModal: true, onPress: () => setSearchZone('discard') },
            {
              label: 'Shuffle discard pile into deck',
              onPress: () => apply(T.shuffleDiscardIntoDeck, 'Shuffled into deck'),
            },
          ],
        };
      case 'table':
        return {
          title: deck.name,
          actions: [
            reveal
              ? { label: 'Switch to table mode', onPress: () => switchMode('table') }
              : { label: 'Switch to reveal mode', opensModal: true, onPress: () => switchMode('reveal') },
            ...(reveal ? [] : [{ label: 'Discard entire hand', onPress: () => apply(T.discardHand) }]),
            { label: 'Shuffle discard pile into deck', onPress: () => apply(T.shuffleDiscardIntoDeck, 'Shuffled into deck') },
            {
              label: tabletop ? 'Table style: Tabletop · switch to Classic' : 'Table style: Classic · switch to Tabletop',
              onPress: () => setLook(tabletop ? 'classic' : 'tabletop'),
            },
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
      const toX = x - landing.rise + w / 2 - landing.width / 2;
      const toY = y - landing.rise + h / 2 - landing.width / ratio / 2;
      Animated.parallel([
        Animated.timing(landingAnim.pos, { toValue: { x: toX, y: toY }, duration: LANDING_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(landingAnim.scale, { toValue: w / landing.width, duration: LANDING_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        // Settling onto the cloth: by the end only the card's own resting shadow is left, as on the real card.
        Animated.timing(landingAnim.lift, { toValue: 0, duration: LANDING_MS, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start(() => {
        // Hand over without a gap: show the real card first, and only take the stand-in away a couple of frames
        // later, once the real card is surely on screen right underneath it.
        setLanding((l) => l && { ...l, revealed: true });
        requestAnimationFrame(() => requestAnimationFrame(() => setLanding(null)));
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
      <Button label="Draw" variant="primary" onPress={() => apply((t) => T.draw(t, 1))} disabled={!table.deck.length} />
      <Button label="Shuffle" onPress={() => apply((t) => T.shuffleZone(t, 'deck'), 'Shuffled')} disabled={table.deck.length < 2} />
      <Button label="Search" onPress={openSearch} disabled={!table.deck.length && !table.discard.length} />
    </>
  );

  // Reveal mode's way to start over once every card has been turned up.
  const canReshuffle = reveal && table.deck.length === 0 && table.discard.length > 0;
  const reshuffle = () => apply(T.shuffleDiscardIntoDeck, 'Shuffled into deck');

  const deckPile = (
    <>
      <View style={[styles.pileSlot, tabletop && matSpot, highlight('deck')]}>
        <PileDepth deck={deck} width={pileWidth} count={deckShowing}>
          {deckTop ? (
            draggable(
              deckTop,
              'deck',
              pileWidth,
              { onPress: reveal ? revealNext : () => apply((t) => T.draw(t, 1)), onLongPress: () => setSearchZone('deck') },
              deckShowing > 0 ? <CardView deck={deck} faceUp={false} width={pileWidth} /> : <EmptySlot deck={deck} width={pileWidth} label="Deck empty" />,
            )
          ) : canReshuffle ? (
            <Pressable onPress={reshuffle} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.7 }}>
              <EmptySlot deck={deck} width={pileWidth} label="Deck empty · Tap to shuffle the discard back in" />
            </Pressable>
          ) : (
            <EmptySlot deck={deck} width={pileWidth} label="Deck empty" />
          )}
        </PileDepth>
      </View>
      <Text style={styles.pileLabel}>Deck · {deckShowing}</Text>
    </>
  );

  const discardPile = (
    <>
      <View style={[styles.pileSlot, tabletop && matSpot, highlight('discard')]}>
        <PileDepth deck={deck} width={pileWidth} count={discardCount}>
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
      {tabletop ? <TabletopSurface /> : null}

      {active ? (
        <Stack.Screen
          options={{
            title: deck.name,
            headerRight: () => (
              <Pressable onPress={() => open({ kind: 'table' })} hitSlop={12} accessibilityLabel="Table options">
                <Text style={styles.headerButton}>•••</Text>
              </Pressable>
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
        <Pressable style={styles.banner} onPress={() => apply((t) => T.addMissingCards(t, deck), 'Added to deck')}>
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
                <View style={styles.pile} onLayout={measure('revealDeck')}>
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
                  onPress={() => apply((t) => T.shuffleZone(t, 'deck'), 'Shuffled')}
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
          <View style={[styles.piles, tabletop && styles.pilesOnCloth]} onLayout={measure('piles')}>
            <View style={styles.pile} onLayout={measure('deckPile')}>
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
            contentContainerStyle={styles.playAreaContent}
            scrollEnabled={!drag?.active && !drag?.pinch}
            alwaysBounceVertical={false}
            onLayout={measure('play')}
            // Scrolling is off while cards are held, so the offset only needs updating when a scroll settles.
            onScrollEndDrag={(e) => trackScroll('play', e.nativeEvent.contentOffset.y)}
            onMomentumScrollEnd={(e) => trackScroll('play', e.nativeEvent.contentOffset.y)}>
            {table.table.length ? (
              tableRow().map((r) => (r.kind === 'gap' ? gap(tableCardWidth) : renderStack(r.item)))
            ) : (
              <Text style={styles.hint}>Drag a card here to play it.</Text>
            )}
          </ScrollView>

          {/* Hand */}
          <View
            style={[styles.hand, tabletop && styles.handOnRail, { paddingBottom: insets.bottom + 8 }, highlight('hand')]}
            onLayout={measure('hand')}>
            {tabletop ? <WoodRail /> : null}
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
                opacity: landingAnim.lift,
              },
              tabletop ? tabletopShadow.lifted : styles.liftedShadowClassic,
            ]}
          />
          <CardView deck={deck} card={cardsById.get(landing.cardId)} faceUp={landing.faceUp} width={landing.width} sharp />
        </Animated.View>
      ) : null}

      {/* The held stack follows the finger above everything else: its top card, with the edges of the rest. */}
      {drag?.active && liftedFrom ? (
        <Animated.View
          style={[
            styles.lifted,
            tabletop && tabletopShadow.lifted,
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
          {drag.stack
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
            card={cardsById.get(drag.stack[0].cardId)}
            faceUp={drag.faceUp}
            width={liftedWidth}
            sharp
            onReady={markShown}
          />
          {drag.stack.length > 1 ? (
            <View style={styles.stackBadge}>
              <Text style={styles.stackBadgeText}>{drag.stack.length}</Text>
            </View>
          ) : null}
        </Animated.View>
      ) : null}

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
        <View style={[styles.flip, { left: flipRect.x, top: flipRect.y, width: flipRect.w, height: flipRect.h }]}>
          <Text style={styles.flipText}>FLIP</Text>
        </View>
      ) : null}

      {flying ? (
        <Animated.View style={[styles.flying, { transform: [...flight.pos.getTranslateTransform(), { scale: flight.scale }] }]}>
          {/* No shadow while it flips: anything behind a turning card shows round its edges as it narrows. */}
          <CardView deck={deck} card={cardsById.get(flying.cardId)} faceUp={flying.faceUp} width={pileWidth} flat />
        </Animated.View>
      ) : null}

      </View>
      </View>

      {zoomView ? (
        <CardZoom
          deck={deck}
          current={zoomView.current}
          area={rootSize}
          prev={zoomView.prev}
          next={zoomView.next}
          onStep={(dir) => setZoomed(dir === 1 ? zoomView.next!.key : zoomView.prev!.key)}
          onClose={() => setZoomed(null)}
        />
      ) : null}

      {toast ? (
        <View style={[styles.toast, { pointerEvents: 'none' }]}>
          <Text style={styles.toastText}>{toast.msg}</Text>
        </View>
      ) : null}

      <ActionSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} {...sheetProps} />

      <SearchModal
        zone={searchZone}
        deck={deck}
        table={table}
        apply={apply}
        moveActions={moveActions}
        onSwitch={setSearchZone}
        onClose={() => setSearchZone(null)}
      />
    </View>
  );
}

const SEARCHABLE: { zone: Zone; label: string }[] = [
  { zone: 'deck', label: 'Deck' },
  { zone: 'discard', label: 'Discard' },
];

/** Full-screen browser for every card in the deck or discard pile, top card first, with a switch between them. */
function SearchModal({
  zone,
  deck,
  table,
  apply,
  moveActions,
  onSwitch,
  onClose,
}: {
  zone: Zone | null;
  deck: Deck;
  table: TableState;
  apply: (fn: (t: TableState) => TableState, msg?: string) => void;
  moveActions: (iid: string, from: Zone) => SheetAction[];
  onSwitch: (zone: Zone) => void;
  onClose: () => void;
}) {
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [selected, setSelected] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const cards = zone ? table[zone] : [];
  const cardsById = new Map(deck.cards.map((c) => [c.id, c]));
  const columns = 4;
  const cardWidth = (width - 16 * 2 - 8 * (columns - 1)) / columns;
  const selectedCard = selected ? cards.find((c) => c.iid === selected) : undefined;

  return (
    <Modal visible={zone !== null} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <View style={[styles.searchScreen, { paddingTop: insets.top + 8 }]}>
        <View style={styles.searchHeader}>
          <View style={styles.searchTabs}>
            {SEARCHABLE.map((s) => (
              <Pressable
                key={s.zone}
                onPress={() => onSwitch(s.zone)}
                accessibilityRole="tab"
                accessibilityState={{ selected: zone === s.zone }}
                style={[styles.searchTab, zone === s.zone && styles.searchTabActive]}>
                <Text style={[styles.searchTabText, zone === s.zone && { color: colors.accentText }]}>
                  {s.label} · {table[s.zone].length}
                </Text>
              </Pressable>
            ))}
          </View>
          <Pressable onPress={onClose} hitSlop={12}>
            <Text style={styles.headerButton}>Done</Text>
          </Pressable>
        </View>
        <Text style={styles.searchHint}>Top card first. Tap a card to move it.</Text>
        <FlatList
          data={cards}
          keyExtractor={(c) => c.iid}
          numColumns={columns}
          columnWrapperStyle={{ gap: 8 }}
          contentContainerStyle={{ padding: 16, gap: 8 }}
          ListEmptyComponent={<Text style={styles.hint}>No cards here.</Text>}
          renderItem={({ item, index }) => (
            <View>
              <CardView
                deck={deck}
                card={cardsById.get(item.cardId)}
                width={cardWidth}
                onPress={() => {
                  setSelected(item.iid);
                  setSheetOpen(true);
                }}
              />
              <Text style={styles.searchIndex}>{index + 1}</Text>
            </View>
          )}
        />
        {zone === 'deck' ? (
          <View style={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 12 }}>
            <Button
              label="Shuffle & close"
              variant="primary"
              onPress={() => {
                apply((t) => T.shuffleZone(t, 'deck'), 'Shuffled');
                onClose();
              }}
            />
          </View>
        ) : null}
      </View>

      {/* Rendered inside the search modal so iOS can present it on top. */}
      <ActionSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={selectedCard ? cardsById.get(selectedCard.cardId)?.name : undefined}
        header={
          selectedCard ? (
            <View style={{ alignItems: 'center', marginBottom: 6 }}>
              <CardView deck={deck} card={cardsById.get(selectedCard.cardId)} width={Math.min(240, width * 0.6)} />
            </View>
          ) : null
        }
        actions={selectedCard && zone ? moveActions(selectedCard.iid, zone) : []}
      />
    </Modal>
  );
}

const styles = StyleSheet.create({
  felt: { flex: 1, backgroundColor: colors.felt },
  center: { alignItems: 'center', justifyContent: 'center' },
  muted: { color: colors.textMuted },
  headerButton: { color: colors.accent, fontSize: 17, fontWeight: '600' },
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
  pileSlot: { borderRadius: 10, borderWidth: 2, borderColor: 'transparent', padding: 2 },
  pileLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: '600' },
  pileButtons: { flex: 1, gap: 8, paddingHorizontal: 12, justifyContent: 'center' },
  reveal: { flex: 1, flexDirection: 'row', paddingHorizontal: 16, paddingTop: 12 },
  revealPiles: { flex: 1, alignItems: 'center', justifyContent: 'space-evenly' },
  revealRail: { width: REVEAL_RAIL, alignItems: 'flex-end', justifyContent: 'center', gap: 18 },
  playArea: { flex: 1, borderWidth: 2, borderColor: 'transparent' },
  playAreaContent: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, padding: 14, flexGrow: 1 },
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
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 5,
    backgroundColor: 'rgba(0,0,0,0.75)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'none',
  },
  stackCountText: { color: colors.text, fontSize: 12, fontWeight: '700' },
  landing: { position: 'absolute', left: 0, top: 0, pointerEvents: 'none' },
  landingShadow: { position: 'absolute', left: 0, top: 0, backgroundColor: colors.surfaceRaised },
  // The classic look's lifted shadow (as on the held stack), for the landing card to fade out.
  liftedShadowClassic: {
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
  stage: { overflow: 'hidden' },
  // Tabletop look: the piles sit straight on the cloth, and the hand on the wooden rail.
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
  searchHint: { color: colors.textMuted, paddingHorizontal: 16, marginTop: 4 },
  searchIndex: { color: colors.textMuted, fontSize: 11, textAlign: 'center', marginTop: 2 },
});
