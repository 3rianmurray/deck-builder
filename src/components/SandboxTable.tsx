import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { memo, useEffect, useMemo, useState } from 'react';
import { Animated as RNAnimated, Easing, Image, Platform, Pressable, ScrollView, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing as ReEasing, LinearTransition, useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDecks } from '../lib/DecksContext';
import { askName } from '../lib/names';
import * as haptics from '../lib/haptics';
import { newId } from '../lib/id';
import {
  addCards,
  addDeck,
  cameraAngle,
  cameraSquare,
  cameraZoom,
  cardsOf,
  fingerAngle,
  flipInHand,
  flipStack,
  HAND_COUNT,
  moveCamera,
  placeStack,
  prune,
  putInHand,
  putOnTable,
  raise,
  shuffleStack,
  snapAngle,
  snapCamera,
  snapToGrid,
  stacksInShape,
  moveStacks,
  gatherStacks,
  stackAt,
  stackTargetAt,
  startCamera,
  tableBounds,
  fitCamera,
  TABLE_H,
  TABLE_W,
  GRID_STEP,
  GRID_STACK_REACH,
  take,
  UNITS_PER_MM,
  takeAll,
  dealToHand,
  toScreen,
  toTable,
  turnStack,
  fanStack,
  removeStacks,
  rotateStacks,
  setSolo,
  setStack,
  settleOnto,
} from '../lib/sandbox';
import type { Camera, CardSize, SandboxCard, SandboxStack, SandboxTable, Source } from '../lib/sandbox';
import { updateSandbox, useSandbox } from '../lib/sandboxStore';
import { cardRatio, cardSizeMm, PRESET_SIZES_MM } from '../lib/types';
import type { Deck } from '../lib/types';
import { colors } from '../theme';
import { ActionSheet } from './ActionSheet';
import type { SheetTile } from './ActionSheet';
import { CardFocus } from './CardFocus';
import { AddCardsModal } from './AddCardsModal';
import { DealPanel } from './DealPanel';
import { Riffle } from './Riffle';
import { StackSearch } from './StackSearch';
import { CardView } from './CardView';
import { CardZoom } from './CardZoom';
import type { TableControls } from './TableTopBar';
import { WoodRail } from './Tabletop';
import { Text } from './Text';

/** Steps of undo kept. */
const UNDO_STEPS = 30;
/** A second tap on the same card within this long is a double tap (flipping it); a single tap's menu waits this long. */
const DOUBLE_TAP_MS = 260;
/** A tap on empty table, then another held down within this long and this near: a lasso. */
const LASSO_TAP_MS = 400;
const LASSO_TAP_REACH = 40;
/** How far the finger moves (on screen) before the lasso takes another point. */
const LASSO_STEP = 6;
/** A touch on empty table lifted within this long (and without moving) is a tap. */
const TAP_MS = 300;
/** How far round a stack's count badge (in screen points) a touch takes the whole stack. */
/** How long a press on a stack must be held, still, for the whole stack to come up (a quick drag takes its top card). */
const HOLD_STACK_MS = 350;
/** How long a stack brought onto the table takes to fly in (and the camera to glide over to it). */
const ARRIVE_MS = 480;
/** Hand cards sliding to new places (one gone, one coming in, the gap moving). */
const HAND_SLIDE = LinearTransition.duration(200);
/** A finger moving less than this before lifting is a tap. */
const TAP_SLOP = 8;
/** An extra finger down and up within this long (and not moving) is a tap, picking up another card. */
const EXTRA_TAP_MS = 350;
/** Roughly the hand tray's height, for placing the camera at the start (the tray sizes itself to its cards). */
const HAND_H = 160;
/** Cloth colors a table can have (beside the classic felt, its default), by key: name and color. */
const CLOTHS: Record<string, { name: string; color: string }> = {
  blue: { name: 'Blue', color: '#1d3a5c' },
  green: { name: 'Green', color: '#1f4d33' },
  red: { name: 'Red', color: '#6b1e24' },
  purple: { name: 'Purple', color: '#43295f' },
  charcoal: { name: 'Charcoal', color: '#2a2d33' },
  tan: { name: 'Tan', color: '#8a6d47' },
};
/** How far down the screen the top bar's buttons reach, below the safe area (see TableTopBar). */
const TOP_BAR_H = 56;
/** Room left round the cards when the view is fitted to them. */
const FIT_MARGIN = 16;
/** The hand's row, as table mode's: space above the groove, round the cards in it, between them, and at its ends. */
const HAND_TOP_PAD = 6;
const HAND_ROW_PAD = 9;
const HAND_GAP = 8;
const HAND_PAD = 14;
/** Dragging a carried card this near either end of the hand scrolls it along, this far each move. */
const HAND_EDGE = 44;
const HAND_EDGE_STEP = 8;
/** How far the hand tabs stand up above the tray, and how much of the tray shows when it's folded away. */
const HAND_TAB_H = 24;
const FOLDED_SHOWS = 38;
/** The flip button shown while carrying cards (bottom left): its size, and its space from the screen's edge and the tray. */
const FLIP_SIZE = 64;
const FLIP_MARGIN = 16;
/** As in table mode: a press must move this far, and be held this long, before it can lift a hand card out. */
const DRAG_SLOP = 8;
const LIFT_DELAY_MS = 90;
/** A finger, relative to the table's touch area. */
type Finger = { id: number; x: number; y: number };
/** The tools drawer on the left edge: the panel's width, the tab it's pulled out by, and the panel's height. */
const TOOLS_W = 230;
const TOOLS_TAB_W = 26;
const TOOLS_TAB_H = 72;
const TOOLS_H = 156;
/** How far below the top of the screen's safe area the tools drawer sits (clear of the top bar). */
const TOOLS_FROM_TOP = 64;

const FLIP_ICON = { ios: 'arrow.trianglehead.2.clockwise.rotate.90', android: 'flip', web: 'flip' } as const;

/** What a menu is open on. */
type Menu =
  | { kind: 'stack'; id: string }
  | { kind: 'hand'; hand: number; iid: string }
  | { kind: 'table' }
  | { kind: 'addDeck' }
  | { kind: 'color' };

/** A card being carried by a finger. */
interface Held {
  /** Where each was taken from (the first picked up, then any tapped with another finger). */
  sources: Source[];
  cards: SandboxCard[];
}

/**
 * A sandbox table: a big table seen from above, the camera slid with one finger and zoomed and turned with two;
 * decks brought onto it from the player's list; cards dragged anywhere, turned to any angle with a second
 * finger (settling onto the table's 45° steps when close), stacked, flipped, and taken into any of four hands.
 */
export function SandboxBoard({ id, onControls }: { id: string; onControls: (c: TableControls | null) => void }) {
  const stored = useSandbox(id);
  const { decks, getDeck } = useDecks();
  const insets = useSafeAreaInsets();
  const { width: screenW } = useWindowDimensions();
  const [history, setHistory] = useState<SandboxTable[]>([]);
  /** Changes undone, latest last, to make again (gone once anything else changes). */
  const [future, setFuture] = useState<SandboxTable[]>([]);
  const [handIndex, setHandIndex] = useState(0);
  const [folded, setFolded] = useState(false);
  /** Stacks picked out with the lasso: outlined in gold, and dragged together. */
  const [selected, setSelected] = useState<string[]>([]);
  /** The lasso being drawn, as screen points (for drawing it). */
  const [lassoPath, setLassoPath] = useState<{ x: number; y: number }[] | null>(null);
  /** The selected stacks being dragged together: moved on the animation thread, like the camera, until let go. */
  const [groupMoving, setGroupMoving] = useState(false);
  /** The dragged group is over the hand: gathered into one pile under the finger, at hand size, for going in. */
  const [groupInHand, setGroupInHand] = useState<string | null>(null);
  /** Cards flying between the spread-out group and its pile over the hand (in: gathering; out: spreading out). */
  const [pileFlights, setPileFlights] = useState<PileFlight[]>([]);
  const groupDX = useSharedValue(0);
  const groupDY = useSharedValue(0);
  /** A dragged group's twist (degrees), about where it was grabbed (a table point): it turns round the finger. */
  const groupTurn = useSharedValue(0);
  const groupPX = useSharedValue(0);
  const groupPY = useSharedValue(0);
  // Turned about the grab point p, then moved by d: a point x goes to R(x − p) + p + d. The layer turns about its
  // top-left corner (the table's origin; see its style): that's R·x then a single move of p + d − R·p. (One move
  // and one turn: the same transform written as move, turn, move back has its two moves merged into one.)
  const groupStyle = useAnimatedStyle(() => {
    const r = (groupTurn.value * Math.PI) / 180;
    const px = groupPX.value;
    const py = groupPY.value;
    return {
      transform: [
        { translateX: px + groupDX.value - (px * Math.cos(r) - py * Math.sin(r)) },
        { translateY: py + groupDY.value - (px * Math.sin(r) + py * Math.cos(r)) },
        { rotate: `${groupTurn.value}deg` },
      ],
    };
  });
  /** Cards flying into a stack just gathered (each the top of a stack that was picked out). */
  const [flyers, setFlyers] = useState<Flyer[]>([]);
  /** Where carried cards would go into the hand, while they're over it: a gap opens there. */
  const [handGap, setHandGap] = useState<number | null>(null);
  /** How far the hand's row is scrolled, as its scroll view reports it (to find the card under a finger). */
  const [handScroll] = useState(() => {
    const box = { x: 0 };
    return { get: () => box.x, set: (x: number) => Object.assign(box, { x }) };
  });
  /** The hand's scroll view: table mode's, to scroll it as carried cards are dragged near its ends. */
  const [handList] = useState(() => {
    const box: { view: ScrollView | null } = { view: null };
    return {
      attach: (view: ScrollView | null) => {
        Object.assign(box, { view });
      },
      get: () => box.view,
    };
  });
  // The tray's slide as it folds and opens, with a little spring, as in table mode.
  const foldY = useSharedValue(0);
  const trayStyle = useAnimatedStyle(() => ({ transform: [{ translateY: foldY.value }] }));
  const [held, setHeld] = useState<Held | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  /** Dealing from this stack: its menu shows how many to deal and to whom, instead of its options. */
  const [dealingFrom, setDealingFrom] = useState<string | null>(null);
  /** Looking through this stack: its menu shows its cards, to take one into the hand. */
  const [searching, setSearching] = useState<string | null>(null);
  /** Choosing cards from a deck to bring onto the table. */
  const [addingCards, setAddingCards] = useState(false);
  /** A stack just brought onto the table, flying in to where the camera's taking it on screen. */
  const [arriving, setArriving] = useState<{ stackId: string; key: string; to: { x: number; y: number }; scale: number; angle: number } | null>(null);
  /** A stack being riffle shuffled (as in a deck's play screen): which, a fresh key each time, and whether it's started. */
  const [riffling, setRiffling] = useState<{ stackId: string; key: number; started: boolean } | null>(null);
  const [zoomed, setZoomed] = useState<SandboxCard | null>(null);
  const [view, setView] = useState<{ w: number; h: number } | null>(null);

  // Cards of decks since deleted (or cards since removed from them) quietly leave the table.
  const table = useMemo(() => (stored ? prune(stored, decks) : undefined), [stored, decks]);

  const decksById = useMemo(() => new Map(decks.map((d) => [d.id, d])), [decks]);
  const cardOf = (c: SandboxCard) => decksById.get(c.deckId)?.cards.find((k) => k.id === c.cardId);
  /** A card's size on the table: its deck's real size (a mini card is smaller; a landscape one, a portrait turned). */
  const size: CardSize = (deckId) => {
    const deck = decksById.get(deckId);
    const mm = deck ? cardSizeMm(deck) : PRESET_SIZES_MM.standard;
    return { w: mm.w * UNITS_PER_MM, h: mm.h * UNITS_PER_MM };
  };

  // ---- The camera: on the animation thread, so moving it never redraws the table. ----
  const camA = useSharedValue(1);
  const camB = useSharedValue(0);
  const camX = useSharedValue(0);
  const camY = useSharedValue(0);
  const readCamera = (): Camera => ({ a: camA.get(), b: camB.get(), tx: camX.get(), ty: camY.get() });
  const writeCamera = (c: Camera) => {
    camA.set(c.a);
    camB.set(c.b);
    camX.set(c.tx);
    camY.set(c.ty);
  };
  const worldStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: camX.value },
      { translateY: camY.value },
      { rotate: `${Math.atan2(camB.value, camA.value)}rad` },
      { scale: Math.hypot(camA.value, camB.value) },
    ],
  }));

  // ---- The card being carried: where it's drawn on screen (its middle), its turn and its size. ----
  const heldX = useSharedValue(0);
  const heldY = useSharedValue(0);
  const heldAngle = useSharedValue(0);
  const heldScale = useSharedValue(1);
  /** What a card flying between the group and its pile follows as it flies: the camera, the group, the finger. */
  const pileLive = { camA, camB, camX, camY, groupDX, groupDY, fingerX: heldX, fingerY: heldY };
  // Drawn just where, and as big as, it will lie when let go.
  const heldStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: heldX.value },
      { translateY: heldY.value },
      { rotate: `${heldAngle.value}deg` },
      { scale: heldScale.value },
    ],
  }));

  // The camera starts where it was left, or looking at the middle of the table, once its space is known.
  const [placed] = useState(() => {
    const box = { done: false };
    return { done: () => box.done, mark: () => Object.assign(box, { done: true }) };
  });
  const layOut = (e: LayoutChangeEvent) => {
    const space = { w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height };
    setView(space);
    if (placed.done() || !table) return;
    writeCamera(table.camera ?? startCamera({ w: space.w, h: space.h - HAND_H }, table.focus));
    placed.mark();
  };

  // ---- Changes ----
  /** A change to the table, which can be undone. */
  const commit = (next: SandboxTable) => {
    if (!table || next === table) return;
    setHistory((h) => [...h.slice(-(UNDO_STEPS - 1)), table]);
    setFuture([]);
    updateSandbox(next);
  };
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev || !table) return;
    setHistory(history.slice(0, -1));
    setFuture((f) => [...f, table]);
    updateSandbox({ ...prev, camera: table.camera, name: table.name, handNames: table.handNames });
    haptics.tick();
  };
  const redo = () => {
    const next = future[future.length - 1];
    if (!next || !table) return;
    setFuture(future.slice(0, -1));
    setHistory((h) => [...h.slice(-(UNDO_STEPS - 1)), table]);
    updateSandbox({ ...next, camera: table.camera, name: table.name, handNames: table.handNames });
    haptics.tick();
  };
  const saveCamera = () => table && updateSandbox({ ...table, camera: readCamera() });

  // ---- The grid: invisible lines at a fixed spacing; cards put down with snapping on sit on their crossings. ----
  const gridOn = !!table?.snapToGrid;
  // The tools drawer on the left edge: pulled out to show the tools, tucked away again to hide them.
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsX = useSharedValue(-TOOLS_W);
  const toolsStyle = useAnimatedStyle(() => ({ transform: [{ translateX: toolsX.value }] }));
  const showTools = (open: boolean) => {
    setToolsOpen(open);
    toolsX.set(withSpring(open ? 0 : -TOOLS_W, { damping: 18, stiffness: 180, mass: 0.9 }));
    haptics.tick();
  };

  // ---- The hand tray, as in table mode: the hand's cards side by side in a row that scrolls sideways. ----
  const area = view ?? { w: screenW, h: 0 };
  const hand = table?.hands[handIndex] ?? [];
  /** Cards being carried (out of sight where they were). */
  const heldIds = new Set(held?.cards.map((c) => c.iid));
  /** The hand's cards as table mode's: about a quarter of the screen wide; the tray as tall as they need. */
  // The tray keeps one height whatever's in it. Every portrait card stands that tall (a mini as tall as a standard
  // card; widths follow each deck's shape), and a landscape card is its portrait card turned: as wide as that
  // height, and shorter. The height is table mode's for a standard card.
  const handW = Math.min(110, screenW * 0.24);
  const handCardH = (handW * PRESET_SIZES_MM.standard.h) / PRESET_SIZES_MM.standard.w;
  const handWidthOf = (c: SandboxCard) => {
    const deck = decksById.get(c.deckId);
    const ratio = deck ? cardRatio(deck) : PRESET_SIZES_MM.standard.w / PRESET_SIZES_MM.standard.h;
    return ratio > 1 ? handCardH : handCardH * ratio;
  };
  const handH = Math.round(HAND_TOP_PAD + HAND_ROW_PAD * 2 + handCardH + 4);
  // The tray reaches the bottom of the screen; folded, it slides down until just the tops of its cards show.
  const trayH = handH + insets.bottom;
  const trayOpenTop = area.h - trayH;
  const handTop = folded ? area.h - FOLDED_SHOWS : trayOpenTop;
  /** The row as laid out: the hand without any cards being carried, and a gap where carried ones would go in. */
  const handRow = hand.filter((c) => !heldIds.has(c.iid));
  // Where each card sits along the row (cards differ in width), with the gap taking the carried card's width.
  /** The grabbed stack of a group gathered over the hand (its top card leads the pile). */
  const groupLeadStack = groupInHand ? table?.stacks.find((s) => s.id === groupInHand) : undefined;
  const groupLeadTop = groupLeadStack ? groupLeadStack.cards[groupLeadStack.cards.length - 1] : undefined;
  const gapWidth = held ? handWidthOf(held.cards[held.cards.length - 1]) : groupLeadTop ? handWidthOf(groupLeadTop) : handW;
  const rowWidths = handRow.map(handWidthOf);
  const rowXs = rowWidths.reduce<number[]>((xs, w, k) => {
    const before = k ? xs[k - 1] + rowWidths[k - 1] + HAND_GAP : HAND_PAD;
    return [...xs, before + (handGap === k ? gapWidth + HAND_GAP : 0)];
  }, []);
  const rowX = (k: number) => rowXs[k];
  const rowWidth =
    HAND_PAD * 2 + rowWidths.reduce((sum, w) => sum + w + HAND_GAP, 0) + (handGap !== null ? gapWidth + HAND_GAP : 0) - HAND_GAP;
  const maxHandScroll = Math.max(0, rowWidth - area.w);
  /** Where the row's cards sit, down from the tray's top. */
  const rowTop = HAND_TOP_PAD + HAND_ROW_PAD;
  /** The hand card under a point on screen (its place in the hand), or −1. */
  const handCardAt = (x: number, y: number) => {
    // Folded away, its cards peek out but can't be picked up.
    if (folded || y < trayOpenTop + rowTop || y > trayOpenTop + rowTop + handCardH) return -1;
    const at = x + handScroll.get();
    const k = handRow.findIndex((_, i) => at >= rowX(i) && at <= rowX(i) + rowWidths[i]);
    return k < 0 ? -1 : hand.indexOf(handRow[k]);
  };
  /** Folds the tray away (just the tops of its cards showing) or opens it, sliding with a little spring. */
  const foldTray = (fold: boolean) => {
    setFolded(fold);
    foldY.set(withSpring(fold ? trayH - FOLDED_SHOWS : 0, { damping: 16, stiffness: 170, mass: 0.9 }));
    haptics.tick();
  };
  /** Shows another hand (opening the tray, if it was folded). */
  const chooseHand = (i: number) => {
    setHandIndex(i);
    handScroll.set(0);
    handList.get()?.scrollTo({ x: 0, animated: false });
    if (folded) foldTray(false);
    else haptics.tick();
  };
  /** The tools drawer: near the top, just below the top bar. */
  const toolsTop = insets.top + TOOLS_FROM_TOP;
  /** The flip button, in the bottom-left corner above the tray, while cards are carried. */
  const flipButton = { x: FLIP_MARGIN, y: handTop - HAND_TAB_H - FLIP_MARGIN - FLIP_SIZE, size: FLIP_SIZE };
  /** A double tap: the card (or the whole stack) turned over where it lies. */
  const flipFromTap = (src: Source) => {
    if (!table) return;
    if (src.kind === 'hand') commit(flipInHand(table, src.hand, src.iid));
    // Turned over to face the way the stack it lies on does, it joins it.
    else commit(settleOnto(flipStack(table, src.stackId), src.stackId));
    haptics.tick();
  };
  /** Opens (or moves, or closes) the gap in the hand's row, the cards sliding over to make room. */
  const changeGap = (g: number | null) => {
    if (g === handGap) return;
    setHandGap(g);
  };
  /** While a group is dragged: a button above the flip one gathers it into one stack. */
  const stackButton = { x: flipButton.x, y: flipButton.y - FLIP_SIZE - 12, size: FLIP_SIZE };
  /** The selection, as it stands (stacks since gone, or gathered, drop out of it). */
  const chosen = selected.filter((id) => table?.stacks.some((s) => s.id === id));
  /** The group let go: each stack moved as far as the finger went (and snapped to the grid, if it's on). */
  const dropGroup = (by: { x: number; y: number }) => {
    setGroupMoving(false);
    setGroupInHand(null);
    setFlyers([]);
    setPileFlights([]);
    const turn = gestureState.get().groupAngle;
    // Nothing left to move (e.g. trashed mid-drag), or not moved at all.
    if (!table || !chosen.length || (!by.x && !by.y && !turn)) return;
    const place = gridOn ? (p: { x: number; y: number; angle: number }) => snapToGrid(p) : undefined;
    commit(turn ? rotateStacks(table, chosen, gestureState.get().groupFrom, turn, by, place) : moveStacks(table, chosen, by, place));
    haptics.drop();
  };
  /**
   * The group crossing into the hand (`into`) or back out over the table: each of its cards flies between where it
   * lies in the group (on screen: at table size, at its angle) and the pile under the finger (hand size, upright).
   */
  const flyPile = (into: boolean, finger: { x: number; y: number }) => {
    if (!table) return;
    // Both ends move with the finger as they fly (see PileFlyer), so only where each lies in the group is fixed.
    void finger;
    const flights = table.stacks
      .filter((s) => chosen.includes(s.id))
      .map((s): PileFlight => {
        const top = s.cards[s.cards.length - 1];
        return { key: newId(), card: top, at: { x: s.x, y: s.y, angle: s.angle }, handScale: handScaleOf(top), into };
      });
    setPileFlights(flights);
    haptics.lift();
  };
  /** The size a group gathered over the hand is drawn at: its grabbed stack's top card at hand size. */
  const groupHandScale = (lead: string) => {
    const s = table?.stacks.find((st) => st.id === lead);
    return s ? handScaleOf(s.cards[s.cards.length - 1]) : cameraZoom(readCamera());
  };
  /**
   * The group let go over the hand: all its cards go in, where the gap is, the grabbed stack's first (each
   * stack's top card first), then the others'. They leave the table, and the selection with them.
   */
  const groupToHand = (at: number) => {
    setGroupMoving(false);
    setGroupInHand(null);
    setFlyers([]);
    setPileFlights([]);
    if (!table) return;
    const lead = gestureState.get().groupLead;
    const leader = table.stacks.find((s) => s.id === lead);
    const others = table.stacks.filter((s) => chosen.includes(s.id) && s.id !== lead);
    const cards = [...(leader ? [...leader.cards].reverse() : []), ...others.flatMap((s) => [...s.cards].reverse())];
    const rest = { ...table, stacks: table.stacks.filter((s) => !chosen.includes(s.id)) };
    commit(putInHand(rest, cards, handIndex, at));
    setSelected([]);
    haptics.drop();
  };
  /** The flip button, for the selection: each of its stacks turned over where it lies (one alone joins the stack it lies on, if it now faces the same way). */
  const flipGroup = () => {
    if (!table) return;
    const flipped = chosen.reduce((t, id) => flipStack(t, id), table);
    commit(chosen.length === 1 && !groupMoving ? settleOnto(flipped, chosen[0]) : flipped);
    haptics.tick();
  };
  /** The trash button, for the selection: all of it off the table (undo brings it back). */
  const trashSelection = () => {
    if (!table || !chosen.length) return;
    commit(removeStacks(table, chosen));
    setSelected([]);
    haptics.drop();
  };
  /** With cards picked out (and nothing carried): the trash button, above the gather one (or in its place). */
  const trashButton = { x: flipButton.x, y: chosen.length > 1 ? stackButton.y - FLIP_SIZE - 12 : stackButton.y, size: FLIP_SIZE };
  /** Which of the selection's buttons is at a point on screen, if any (while nothing's carried). */
  const selectionButtonAt = (x: number, y: number): 'flip' | 'gather' | 'trash' | null => {
    const on = (b: { x: number; y: number; size: number }) => Math.hypot(x - (b.x + b.size / 2), y - (b.y + b.size / 2)) <= b.size / 2 + 8;
    if (!chosen.length || held || groupMoving) return null;
    if (on(flipButton)) return 'flip';
    if (chosen.length > 1 && on(stackButton)) return 'gather';
    if (on(trashButton)) return 'trash';
    return null;
  };
  /**
   * The stack button, while a group is dragged: all of it gathered into one stack where the grabbed one lies, every
   * card facing the way the grabbed one does. It stays picked out (and in hand), as the one new stack.
   */
  const gatherGroup = (lead: string) => {
    if (!table || chosen.length < 2) return undefined;
    const id = newId();
    const leader = table.stacks.find((s) => s.id === lead);
    if (!leader) return undefined;
    const face = leader.cards[leader.cards.length - 1].faceUp;
    // The others fly to it: each from where it lay (relative to it, as they all move together), turning to its
    // angle, and over to its face if need be.
    setFlyers(
      table.stacks
        .filter((s) => chosen.includes(s.id) && s.id !== lead)
        .map((s) => ({
          key: newId(),
          card: s.cards[s.cards.length - 1],
          at: { x: leader.x, y: leader.y, angle: leader.angle },
          from: { dx: s.x - leader.x, dy: s.y - leader.y, angle: s.angle },
          face,
        })),
    );
    commit(gatherStacks(table, chosen, lead, id));
    setSelected([id]);
    gestureState.get().groupLead = id;
    haptics.lift();
    return id;
  };
  /** How much a card's table size is scaled to show it at its size in the hand. */
  const handScaleOf = (c: SandboxCard) => handWidthOf(c) / size(c.deckId).w;
  /** Where in the row (of cards not carried) cards dropped with their middle at a point on screen would go. */
  const handInsertAt = (x: number) => {
    // Before the first card whose middle (as the row is without the gap) lies past the point.
    const at = x + handScroll.get();
    let edge = HAND_PAD;
    for (let k = 0; k < rowWidths.length; k++) {
      if (edge + rowWidths[k] / 2 > at) return k;
      edge += rowWidths[k] + HAND_GAP;
    }
    return rowWidths.length;
  };

  // ---- Touches: one handler for the table and the hand, so cards can be carried between them. ----
  // Everything it needs that changes from render to render, read when it's needed.
  const [latest] = useState(() => {
    const box = {} as {
      table: SandboxTable | undefined;
      size: CardSize;
      handTop: number;
      hand: SandboxCard[];
      handIndex: number;
      handCardAt: (x: number, y: number) => number;
      maxHandScroll: number;
      gridOn: boolean;
      setGroupInHand: (lead: string | null) => void;
      flyPile: (into: boolean, finger: { x: number; y: number }) => void;
      groupToHand: (at: number) => void;
      groupHandScale: (lead: string) => number;
      handScaleOf: (c: SandboxCard) => number;
      selected: string[];
      setSelected: (ids: string[]) => void;
      setLassoPath: (p: { x: number; y: number }[] | null) => void;
      setGroupMoving: (moving: boolean) => void;
      stackButton: { x: number; y: number; size: number };
      trashButton: { x: number; y: number; size: number };
      dropGroup: (by: { x: number; y: number }) => void;
      flipGroup: () => void;
      trashSelection: () => void;
      selectionButtonAt: (x: number, y: number) => 'flip' | 'gather' | 'trash' | null;
      gatherGroup: (lead: string) => string | undefined;
      flipFromTap: (src: Source) => void;
      cameraLocked: boolean;
      toolsOpen: boolean;
      showTools: (open: boolean) => void;
      setHandGap: (g: number | null) => void;
      handInsertAt: (x: number) => number;
      flipButton: { x: number; y: number; size: number };
      commit: (t: SandboxTable) => void;
      saveCamera: () => void;
      setHeld: (h: Held | null) => void;
      setTarget: (id: string | null) => void;
      setMenu: (m: Menu) => void;
    };
    return { set: (next: typeof box) => Object.assign(box, next), get: () => box };
  });
  latest.set({ table, size, handTop, hand, handIndex, handCardAt, handInsertAt, maxHandScroll, gridOn, setGroupInHand, flyPile, groupToHand, groupHandScale, handScaleOf, selected: chosen, setSelected, setLassoPath, setGroupMoving, stackButton, trashButton, dropGroup, flipGroup, trashSelection, selectionButtonAt, gatherGroup, flipFromTap, cameraLocked: !!table?.lockCamera, toolsOpen, showTools, setHandGap: changeGap, flipButton, commit, saveCamera, setHeld, setTarget, setMenu });

  // The gesture in progress (never drawn from, so kept outside React state).
  const [gestureState] = useState(() => {
    type Pt = { x: number; y: number };
    const s = {
      mode: 'none' as 'none' | 'camera' | 'press' | 'carry' | 'handPress' | 'lasso' | 'group' | 'button',
      /** Waiting to see if a press on a stack is held (the whole stack comes) rather than dragged (its top card). */
      holdTimer: null as null | ReturnType<typeof setTimeout>,
      /** The press is on a selected stack: a drag moves the whole group. */
      groupPress: false,
      /** Where the group's drag started on the table, and the stack it was grabbed by. */
      groupFrom: { x: 0, y: 0 },
      groupLead: '',
      /** The group's finger is over the hand (the group shows gathered there). */
      groupOverHand: false,
      /** The group's twist so far (degrees), and the second finger twisting it now, if one is. */
      groupTwist: null as null | { id: number; from: number; base: number },
      groupAngle: 0,
      /** The first finger landed on empty table, and when: a quick tap there clears the selection, and a second
       *  tap held down soon after starts a lasso. */
      onEmpty: false,
      firstDownAt: 0,
      emptyTap: null as null | { x: number; y: number; at: number },
      /** The lasso's shape so far, on the table and on screen, and the selection it adds to. */
      lassoBase: [] as string[],
      /** A tap on empty table clears the selection a moment later, unless it's the first tap of a lasso. */
      clearTimer: null as null | ReturnType<typeof setTimeout>,
      lasso: [] as Pt[],
      lassoScreen: [] as Pt[],
      /** The last tap on a card (to tell a double tap), and the wait before its menu opens. */
      lastTap: null as null | { key: string; at: number },
      tapTimer: null as null | ReturnType<typeof setTimeout>,
      /** When a hand card was pressed (it can't be lifted out for a moment, as in table mode). */
      pressedAt: 0,
      /** The table's own finger handling, for hand cards' touches to feed into once a card is lifted out. */
      api: null as null | { down: (f: Finger[]) => void; move: (f: Finger[]) => void; up: (f: Finger[]) => void; cancel: () => void },
      /** Each finger's start and latest position, by id. */
      fingers: new Map<number, { start: Pt; now: Pt }>(),
      /** The finger that pressed (or carries). */
      first: -1,
      /** The camera as fingers last changed count, and where they were then. */
      camStart: { a: 1, b: 0, tx: 0, ty: 0 } as Camera,
      camFrom: [] as Pt[],
      /** Whether the camera last sat on a quarter turn (for a tick each time it snaps onto one). */
      camSquare: true,
      /** What was pressed: a stack (or its badge), or a hand card. */
      pressed: null as Source | null,
      /** Everything carried: where each came from, and the cards (the pile's bottom first). */
      sources: [] as Source[],
      cards: [] as SandboxCard[],
      /** When each extra finger came down, to tell a tap (picking up another card) from a twist. */
      downAt: new Map<number, number>(),
      /** Fingers pressing the flip button (they don't twist or pick up), and whether what's carried is turned over. */
      buttonFingers: new Set<number>(),
      turnedOver: false,
      /** The carried card's middle relative to the carrying finger, and its turn, both on screen. */
      offset: { x: 0, y: 0 },
      screenAngle: 0,
      /** The second finger twisting it: the line between the fingers' angle when it started, and the card's. */
      twist: null as null | { id: number; from: number; angle: number; offset: Pt },
      snapped: false,
      /** The size the carried card is drawn at now (screen points per table unit), to spring to a new one. */
      scaleShown: 0,
    };
    return { get: () => s };
  });

  /** Where the carried card's middle is on screen, and its turn. */
  const carriedPose = () => {
    const touch = gestureState.get();
    const f = touch.fingers.get(touch.first);
    if (!f) return null;
    let { offset } = touch;
    let angle = touch.screenAngle;
    const tw = touch.twist && touch.fingers.get(touch.twist.id);
    if (touch.twist && tw) {
      const delta = fingerAngle(f.now, tw.now) - touch.twist.from;
      angle = touch.twist.angle + delta;
      // Turning about the carrying finger: the card's middle swings round it.
      const r = (delta * Math.PI) / 180;
      const o = touch.twist.offset;
      offset = { x: o.x * Math.cos(r) - o.y * Math.sin(r), y: o.x * Math.sin(r) + o.y * Math.cos(r) };
    }
    // On the table's terms: snapped to its 45° steps when close.
    const camTurn = cameraAngle(readCamera());
    const tableAngle = snapAngle(angle - camTurn);
    return { x: f.now.x + offset.x, y: f.now.y + offset.y, tableAngle, screenAngle: tableAngle + camTurn };
  };

  const showCarried = () => {
    const touch = gestureState.get();
    const p = carriedPose();
    if (!p) return;
    heldX.set(p.x);
    heldY.set(p.y);
    // Over the hand it's a hand card's size; over the table, its size there. It springs between the two.
    {
      const L0 = latest.get();
      const top0 = touch.cards[touch.cards.length - 1];
      const want = top0 && p.y >= L0.handTop ? L0.handScaleOf(top0) : cameraZoom(readCamera());
      if (want !== touch.scaleShown) {
        heldScale.set(touch.scaleShown ? withSpring(want, { damping: 18, stiffness: 240, mass: 0.6 }) : want);
        touch.scaleShown = want;
      }
    }
    heldAngle.set(p.screenAngle);
    // A tick as it settles onto a 45° step.
    const snapped = Math.abs(p.tableAngle - Math.round(p.tableAngle / 45) * 45) < 1e-6;
    if (snapped && !touch.snapped && touch.twist) haptics.tick();
    touch.snapped = snapped;
    const L = latest.get();
    if (!L.table) return;
    const w = toTable(readCamera(), p.x, p.y);
    const except = touch.sources.find((src) => src.kind === 'stack')?.stackId;
    // Only onto a stack facing the same way as what's carried.
    const face = touch.cards[touch.cards.length - 1]?.faceUp;
    // Cards that never stack go onto nothing.
    const solo = touch.cards.some((c) => c.solo);
    // Looked for on the table as it'll be once they're taken: a card can't go back onto where it alone lay.
    const over = p.y < L.handTop && !solo ? stackTargetAt(takeAll(L.table, touch.sources), w.x, w.y, L.size, except, L.gridOn ? GRID_STACK_REACH : undefined, face) : null;
    L.setTarget(over?.id ?? null);
    // Over the hand: a gap opens where they'd go in, and near either end the row scrolls along.
    if (p.y >= L.handTop) {
      const edge = p.x < HAND_EDGE ? -1 : p.x > area.w - HAND_EDGE ? 1 : 0;
      if (edge) {
        const x = Math.min(L.maxHandScroll, Math.max(0, handScroll.get() + edge * HAND_EDGE_STEP));
        handScroll.set(x);
        handList.get()?.scrollTo({ x, animated: false });
      }
      L.setHandGap(L.handInsertAt(p.x));
    } else {
      L.setHandGap(null);
    }
  };

  /** Starts carrying what was pressed, from where the finger is now. */
  const pickUp = () => {
    const touch = gestureState.get();
    const L = latest.get();
    const src = touch.pressed;
    const f = touch.fingers.get(touch.first);
    if (!L.table || !src || !f) return;
    const cards = cardsOf(L.table, src);
    if (!cards.length) return;
    // A stack's top card, as that very card (so more can be taken from the same stack after it).
    const exact: Source = src.kind === 'top' ? { kind: 'card', stackId: src.stackId, iid: cards[0].iid } : src;
    const cam = readCamera();
    if (src.kind === 'hand') {
      // From the hand: upright on screen, under the finger (at its hand size while it's still over the hand).
      touch.offset = { x: 0, y: 0 };
      touch.screenAngle = 0;
    } else {
      const stack = L.table.stacks.find((s) => s.id === src.stackId)!;
      const mid = toScreen(cam, stack.x, stack.y);
      touch.offset = { x: mid.x - f.now.x, y: mid.y - f.now.y };
      touch.screenAngle = stack.angle + cameraAngle(cam);
    }
    touch.scaleShown = 0;
    touch.mode = 'carry';
    touch.snapped = false;
    touch.turnedOver = false;
    touch.buttonFingers.clear();
    touch.sources = [exact];
    touch.cards = cards;
    showCarried();
    L.setHeld({ sources: touch.sources, cards });
    haptics.lift();
  };

  /** Turns over what's carried, like turning a real pile over: its order reverses, and every card flips. */
  const turnOver = () => {
    const touch = gestureState.get();
    const L = latest.get();
    touch.cards = [...touch.cards].reverse().map((c) => ({ ...c, faceUp: !c.faceUp }));
    touch.turnedOver = !touch.turnedOver;
    L.setHeld({ sources: touch.sources, cards: touch.cards });
    haptics.tick();
  };

  /**
   * Another finger tapped while cards are carried: the card under it joins them, on top (the next one down, if
   * that stack's top is already carried). As in the other modes.
   */
  const pickUpMore = (x: number, y: number) => {
    const touch = gestureState.get();
    const L = latest.get();
    if (!L.table) return;
    const carried = new Set(touch.cards.map((c) => c.iid));
    let add: { src: Source; card: SandboxCard } | null = null;
    if (y >= L.handTop) {
      const i = L.handCardAt(x, y);
      const c = i >= 0 ? L.hand[i] : null;
      if (c && !carried.has(c.iid)) add = { src: { kind: 'hand', hand: L.handIndex, iid: c.iid }, card: c };
    } else {
      const w = toTable(readCamera(), x, y);
      const hit = stackAt(L.table, w.x, w.y, L.size);
      const c = hit && [...hit.stack.cards].reverse().find((k) => !carried.has(k.iid));
      if (hit && c) add = { src: { kind: 'card', stackId: hit.stack.id, iid: c.iid }, card: c };
    }
    if (!add) return;
    // Only cards facing the same way as what's carried: a pile never mixes the two. Nor is a card that never
    // stacks ever part of a pile.
    const facing = touch.cards[touch.cards.length - 1]?.faceUp;
    if ((facing !== undefined && add.card.faceUp !== facing) || add.card.solo || touch.cards.some((c) => c.solo)) {
      haptics.warn();
      return;
    }
    touch.sources = [...touch.sources, add.src];
    touch.cards = [...touch.cards, add.card];
    L.setHeld({ sources: touch.sources, cards: touch.cards });
    haptics.lift();
  };

  /** Puts the carried cards down where the finger let go: into the hand, onto a stack, or on the table. */
  const putDown = () => {
    const touch = gestureState.get();
    const L = latest.get();
    const { sources, cards, turnedOver } = touch;
    touch.sources = [];
    touch.cards = [];
    const p = carriedPose();
    L.setHeld(null);
    L.setTarget(null);
    L.setHandGap(null);
    if (!L.table || !sources.length || !p || !cards.length) return;
    haptics.drop();
    if (p.y >= L.handTop) {
      // The gap's place in the row (which leaves out the carried cards) is their place in the hand once taken.
      const without = takeAll(L.table, sources);
      const at = Math.min(L.handInsertAt(p.x), without.hands[L.handIndex].length);
      L.commit(putInHand(without, cards, L.handIndex, at));
      return;
    }
    const w = toTable(readCamera(), p.x, p.y);
    const whole = sources.find((src) => src.kind === 'stack');
    // Only onto a stack facing the same way.
    const face = cards[cards.length - 1].faceUp;
    const onto = cards.some((c) => c.solo)
      ? null
      : // On the table as it'll be once they're taken: where a card alone lay is nowhere to go back onto (it would
        // land, unsnapped, as if joining it). The rest of a stack it came off still counts.
        stackTargetAt(takeAll(L.table, sources), w.x, w.y, L.size, whole?.kind === 'stack' ? whole.stackId : undefined, L.gridOn ? GRID_STACK_REACH : undefined, face);
    // With snapping on, its middle on the nearest grid crossing.
    const free = { x: w.x, y: w.y, angle: p.tableAngle };
    const at = L.gridOn && !onto ? snapToGrid(free) : free;
    // A whole stack just moved (and turned), on its own, keeps being itself.
    if (whole?.kind === 'stack' && sources.length === 1 && !onto && !turnedOver) {
      return L.commit(raise(placeStack(L.table, whole.stackId, at), whole.stackId));
    }
    L.commit(putOnTable(takeAll(L.table, sources), cards, at, newId(), onto));
  };

  // Where the hand tabs and the open tray are on screen: touches starting there are left to them (the tabs are
  // buttons; the tray has table mode's scroll view and card handling). Read by the gesture, on the UI thread.
  const tabBand = useSharedValue({ top: 0, bottom: 0, tray: 0, toolsRight: 0, toolsTop: 0, toolsBottom: 0 });
  useEffect(() => {
    const tabTop = toolsTop + (TOOLS_H - TOOLS_TAB_H) / 2;
    tabBand.set({
      top: handTop - HAND_TAB_H,
      bottom: handTop,
      tray: folded ? Number.MAX_VALUE : handTop,
      // The tools drawer: just its tab while it's tucked away, the whole panel when it's out.
      toolsRight: toolsOpen ? TOOLS_W + TOOLS_TAB_W : TOOLS_TAB_W,
      toolsTop: toolsOpen ? toolsTop : tabTop,
      toolsBottom: toolsOpen ? toolsTop + TOOLS_H : tabTop + TOOLS_TAB_H,
    });
  }, [handTop, folded, toolsOpen, toolsTop, tabBand]);
  /** A touch that landed in the open tray, watched (but not yet claimed) to see if it lifts a card out. */
  const trayTouch = useSharedValue({ id: -1, x: 0, y: 0, t: 0, watching: false });

  const [gesture] = useState(() => {
    const touch = gestureState.get();
    type Touch = { id: number; x: number; y: number };
    // What the table does with fingers, on the JS thread (where its state is). The gesture itself, on the UI
    // thread, just claims the touches (or leaves them to the hand tabs) and passes them on.
    /** The selected stacks start moving together, grabbed by the pressed one. */
    const startGroup = () => {
      const L = latest.get();
      const f = touch.fingers.get(touch.first);
      if (!f || touch.pressed?.kind === 'hand' || !touch.pressed) return;
      touch.mode = 'group';
      touch.groupFrom = toTable(readCamera(), f.start.x, f.start.y);
      touch.groupLead = touch.pressed.stackId;
      touch.groupOverHand = false;
      touch.groupTwist = null;
      touch.groupAngle = 0;
      groupDX.set(0);
      groupDY.set(0);
      groupTurn.set(0);
      groupPX.set(touch.groupFrom.x);
      groupPY.set(touch.groupFrom.y);
      L.setGroupMoving(true);
      haptics.lift();
    };
    const clearHold = () => {
      if (touch.holdTimer) clearTimeout(touch.holdTimer);
      touch.holdTimer = null;
    };
    const down = (changed: Touch[]) => {
      const L = latest.get();
      // A touch on the table tucks the tools away.
      if (L.toolsOpen && touch.mode === 'none') L.showTools(false);
      for (const t of changed) touch.fingers.set(t.id, { start: { x: t.x, y: t.y }, now: { x: t.x, y: t.y } });
      const pts = [...touch.fingers.values()].map((f) => f.now);
      if (touch.mode === 'none') {
        const t = changed[0];
        touch.first = t.id;
        touch.twist = null;
        // On a hand card (its touches come from the card itself, as in table mode): a tap opens its menu, an
        // upward drag lifts it out. Or a card on the table: a tap opens its menu, a drag carries it.
        if (t.y >= L.handTop) {
          const i = L.handCardAt(t.x, t.y);
          if (i >= 0 && L.selected.length) L.setSelected([]);
          touch.pressed = i >= 0 ? { kind: 'hand', hand: L.handIndex, iid: L.hand[i].iid } : null;
          touch.mode = i >= 0 ? 'handPress' : 'none';
          touch.pressedAt = Date.now();
          return;
        }
        const w = toTable(readCamera(), t.x, t.y);
        // The selection's buttons (flip, gather, take off the table), showing while cards are picked out.
        if (L.selected.length) {
          const b = L.selectionButtonAt(t.x, t.y);
          if (b) {
            touch.mode = 'button';
            if (b === 'flip') L.flipGroup();
            else if (b === 'gather') L.gatherGroup(L.selected[L.selected.length - 1]);
            else L.trashSelection();
            return;
          }
        }
        const hit = L.table ? stackAt(L.table, w.x, w.y, L.size) : null;
        touch.onEmpty = false;
        if (hit) {
          // A selected stack: dragging it moves the whole group. Any other card lets the selection go.
          touch.groupPress = L.selected.includes(hit.stack.id);
          if (!touch.groupPress && L.selected.length) L.setSelected([]);
          // A quick drag takes its top card; held a moment first, the whole stack comes (unless it's locked).
          touch.pressed = { kind: 'top', stackId: hit.stack.id };
          touch.mode = 'press';
          if (!touch.groupPress) {
            const pressedStack = hit.stack.id;
            touch.holdTimer = setTimeout(() => {
              touch.holdTimer = null;
              if (touch.mode !== 'press' || touch.pressed?.kind !== 'top' || touch.pressed.stackId !== pressedStack) return;
              const now = latest.get();
              if (now.table?.stacks.find((s) => s.id === pressedStack)?.locked) {
                haptics.warn();
                return;
              }
              touch.pressed = { kind: 'stack', stackId: pressedStack };
              touch.lastTap = null;
              pickUp();
            }, HOLD_STACK_MS);
          }
          return;
        }
        // Empty table. The second tap of a double tap, held down: a lasso, drawn round the cards to pick out.
        const now = Date.now();
        const e = touch.emptyTap;
        touch.emptyTap = null;
        if (e && now - e.at < LASSO_TAP_MS && Math.hypot(t.x - e.x, t.y - e.y) < LASSO_TAP_REACH) {
          // The tap before it was the first of the double tap, not one to clear the selection: the lasso adds to it.
          if (touch.clearTimer) clearTimeout(touch.clearTimer);
          touch.clearTimer = null;
          touch.mode = 'lasso';
          touch.lasso = [w];
          touch.lassoScreen = [{ x: t.x, y: t.y }];
          touch.lassoBase = L.selected;
          L.setLassoPath(touch.lassoScreen);
          haptics.lift();
          return;
        }
        touch.onEmpty = true;
        touch.firstDownAt = now;
      }
      // Other fingers while a lasso is drawn: ignored.
      if (touch.mode === 'lasso') return;
      // Other fingers while the group is pressed or dragged: the group's buttons (flip, and gather into a stack).
      if (touch.mode === 'group' || (touch.mode === 'press' && touch.groupPress)) {
        if (touch.mode === 'press') {
          clearHold();
          startGroup();
        }
        const on = (c: Touch, b: { x: number; y: number; size: number }) =>
          Math.hypot(c.x - (b.x + b.size / 2), c.y - (b.y + b.size / 2)) <= b.size / 2 + 12;
        for (const c of changed) {
          if (c.id === touch.first) continue;
          if (on(c, L.flipButton)) L.flipGroup();
          else if (on(c, L.stackButton)) L.gatherGroup(touch.groupLead);
          else if (on(c, L.trashButton)) L.trashSelection();
          else if (!touch.groupTwist) {
            // Anywhere else, a second finger twists the group round the first.
            const first = touch.fingers.get(touch.first);
            if (first) touch.groupTwist = { id: c.id, from: fingerAngle(first.now, { x: c.x, y: c.y }), base: touch.groupAngle };
          }
        }
        return;
      }
      // Other fingers while the hand is pressed or scrolled: ignored.
      if (touch.mode === 'handPress') return;
      if (touch.mode === 'press' || touch.mode === 'carry') {
        // A second finger while a card is held: it twists the card.
        if (touch.mode === 'press') {
          clearHold();
          pickUp();
        }
        for (const c of changed) if (c.id !== touch.first) touch.downAt.set(c.id, Date.now());
        // A finger on the flip button turns over what's carried (and does nothing else).
        const b = L.flipButton;
        for (const c of changed) {
          if (c.id === touch.first || Math.hypot(c.x - (b.x + b.size / 2), c.y - (b.y + b.size / 2)) > b.size / 2 + 12) continue;
          touch.buttonFingers.add(c.id);
          turnOver();
        }
        const second = changed.find((c) => c.id !== touch.first && !touch.buttonFingers.has(c.id));
        const firstNow = touch.fingers.get(touch.first)?.now;
        if (second && firstNow && !touch.twist) {
          const p = carriedPose();
          touch.twist = {
            id: second.id,
            from: fingerAngle(firstNow, { x: second.x, y: second.y }),
            angle: p ? p.screenAngle : touch.screenAngle,
            offset: p ? { x: p.x - firstNow.x, y: p.y - firstNow.y } : touch.offset,
          };
        }
        return;
      }
      // With the camera locked, empty table does nothing.
      if (L.cameraLocked) return;
      // Empty table: the camera, slid by one finger, zoomed and turned by two. Restarted from here whenever
      // a finger comes or goes, so nothing jumps.
      touch.mode = 'camera';
      touch.camStart = readCamera();
      touch.camFrom = pts.slice(0, 2);
    };
    const move = (all: Touch[]) => {
      for (const t of all) {
        const f = touch.fingers.get(t.id);
        if (f) f.now = { x: t.x, y: t.y };
      }
      if (touch.mode === 'press') {
        const f = touch.fingers.get(touch.first);
        if (f && Math.hypot(f.now.x - f.start.x, f.now.y - f.start.y) > TAP_SLOP) {
          clearHold();
          if (touch.groupPress) startGroup();
          else pickUp();
        }
        return;
      }
      if (touch.mode === 'lasso') {
        // The lasso follows the finger; the stacks it goes round light up as it does.
        const f = touch.fingers.get(touch.first);
        const L = latest.get();
        if (!f || !L.table) return;
        const last = touch.lassoScreen[touch.lassoScreen.length - 1];
        if (last && Math.hypot(f.now.x - last.x, f.now.y - last.y) < LASSO_STEP) return;
        touch.lasso = [...touch.lasso, toTable(readCamera(), f.now.x, f.now.y)];
        touch.lassoScreen = [...touch.lassoScreen, f.now];
        L.setLassoPath(touch.lassoScreen);
        const caught = stacksInShape(L.table, touch.lasso, L.size);
        const picked = [...touch.lassoBase, ...caught.filter((id) => !touch.lassoBase.includes(id))];
        if (picked.join() !== L.selected.join()) {
          if (picked.length > L.selected.length) haptics.tick();
          L.setSelected(picked);
        }
        return;
      }
      if (touch.mode === 'group') {
        // The whole group follows the finger, across the table.
        const f = touch.fingers.get(touch.first);
        if (!f) return;
        const w = toTable(readCamera(), f.now.x, f.now.y);
        groupDX.set(w.x - touch.groupFrom.x);
        groupDY.set(w.y - touch.groupFrom.y);
        // Twisted by a second finger: turned round the first, settling onto the table's 45° steps when close.
        const tw = touch.groupTwist && touch.fingers.get(touch.groupTwist.id);
        if (touch.groupTwist && tw) {
          const turn = snapAngle(touch.groupTwist.base + fingerAngle(f.now, tw.now) - touch.groupTwist.from);
          const square = Math.abs(turn - Math.round(turn / 45) * 45) < 1e-6;
          if (square && turn !== touch.groupAngle) haptics.tick();
          touch.groupAngle = turn;
          groupTurn.set(turn);
        }
        // Over the hand, it gathers into one pile under the finger, at hand size, and the hand makes room; back
        // over the table, it spreads out again as it was.
        const L = latest.get();
        const over = f.now.y >= L.handTop;
        // Where the pile is (or cards flying out of it set off from), all the way, so flying cards keep up.
        heldX.set(f.now.x);
        heldY.set(f.now.y);
        if (over !== touch.groupOverHand) {
          touch.groupOverHand = over;
          L.setGroupInHand(over ? touch.groupLead : null);
          L.flyPile(over, f.now);
        }
        if (over) {
          heldAngle.set(0);
          heldScale.set(L.groupHandScale(touch.groupLead));
          L.setHandGap(L.handInsertAt(f.now.x));
        } else {
          L.setHandGap(null);
        }
        return;
      }
      if (touch.mode === 'carry') return showCarried();
      if (touch.mode === 'handPress') {
        // As in table mode: past a little slop and a moment's hold, a mostly upward drag lifts the card out;
        // anything else is the hand's scroll view's.
        const f = touch.fingers.get(touch.first);
        if (!f) return;
        const dx = f.now.x - f.start.x;
        const dy = f.now.y - f.start.y;
        if (Math.hypot(dx, dy) < DRAG_SLOP || Date.now() - touch.pressedAt < LIFT_DELAY_MS) return;
        if (touch.pressed && Math.abs(dy) > Math.abs(dx)) return pickUp();
        touch.mode = 'none';
        return;
      }
      if (touch.mode === 'camera') {
        const now = [...touch.fingers.values()].slice(0, 2).map((f) => f.now);
        if (now.length !== touch.camFrom.length) {
          touch.camStart = readCamera();
          touch.camFrom = now;
          return;
        }
        let cam = moveCamera(touch.camStart, touch.camFrom, now);
        // Turned with two fingers, it settles onto quarter turns when close (with a tick as it does).
        if (now.length === 2) {
          cam = snapCamera(cam, { x: (now[0].x + now[1].x) / 2, y: (now[0].y + now[1].y) / 2 });
          const square = cameraSquare(cam);
          if (square && !touch.camSquare) haptics.tick();
          touch.camSquare = square;
        }
        writeCamera(cam);
      }
    };
    const up = (changed: Touch[]) => {
      const L = latest.get();
      const lifted = changed.map((t) => t.id);
      if (touch.mode === 'lasso' && lifted.includes(touch.first)) {
        // What it went round stays picked out.
        L.setLassoPath(null);
        if (L.selected.length) haptics.drop();
        touch.mode = 'none';
      } else if (touch.mode === 'group') {
        if (touch.groupTwist && lifted.includes(touch.groupTwist.id)) touch.groupTwist = null;
        if (lifted.includes(touch.first)) {
          const f = touch.fingers.get(touch.first);
          L.setHandGap(null);
          if (touch.groupOverHand && f) L.groupToHand(L.handInsertAt(f.now.x));
          else L.dropGroup({ x: groupDX.get(), y: groupDY.get() });
          touch.groupOverHand = false;
          touch.mode = 'none';
        }
      } else if ((touch.mode === 'press' || touch.mode === 'handPress') && lifted.includes(touch.first)) {
        // A tap on a card on the table picks it out (its buttons show); a tap on one already picked out opens its
        // options (and lets the selection go). A hand card's tap opens its options. Each a moment later, in case
        // it's the first of two: a second tap on the same card in that moment flips it instead.
        clearHold();
        const src = touch.pressed;
        const wasSelected = touch.groupPress && touch.mode === 'press';
        if (src) {
          const key = src.kind === 'hand' ? `h:${src.iid}` : `s:${src.stackId}`;
          const now = Date.now();
          if (touch.lastTap && touch.lastTap.key === key && now - touch.lastTap.at < DOUBLE_TAP_MS) {
            if (touch.tapTimer) clearTimeout(touch.tapTimer);
            touch.tapTimer = null;
            touch.lastTap = null;
            L.flipFromTap(src);
          } else {
            if (touch.tapTimer) clearTimeout(touch.tapTimer);
            touch.lastTap = { key, at: now };
            touch.tapTimer = setTimeout(() => {
              touch.tapTimer = null;
              touch.lastTap = null;
              const now = latest.get();
              if (src.kind === 'hand') now.setMenu({ kind: 'hand', hand: src.hand, iid: src.iid });
              else if (wasSelected) {
                now.setSelected([]);
                now.setMenu({ kind: 'stack', id: src.stackId });
              } else {
                now.setSelected([src.stackId]);
                haptics.tick();
              }
            }, DOUBLE_TAP_MS);
          }
        }
        touch.mode = 'none';
      } else if (touch.mode === 'carry') {
        if (lifted.includes(touch.first)) {
          putDown();
          touch.mode = 'none';
        } else {
          for (const id of lifted) {
            const f = touch.fingers.get(id);
            const tapped = !!f && Math.hypot(f.now.x - f.start.x, f.now.y - f.start.y) < TAP_SLOP && Date.now() - (touch.downAt.get(id) ?? 0) < EXTRA_TAP_MS;
            if (touch.twist?.id === id) {
              // A tap isn't a turn: the card stays as it was. A twist keeps its new turn, carried on by the first.
              const p = carriedPose();
              const first = touch.fingers.get(touch.first);
              if (tapped) {
                touch.screenAngle = touch.twist.angle;
                touch.offset = touch.twist.offset;
              } else if (p && first) {
                touch.screenAngle = p.screenAngle;
                touch.offset = { x: p.x - first.now.x, y: p.y - first.now.y };
              }
              touch.twist = null;
            }
            if (tapped && f && !touch.buttonFingers.has(id)) pickUpMore(f.start.x, f.start.y);
            touch.buttonFingers.delete(id);
            touch.downAt.delete(id);
          }
          showCarried();
        }
      }
      // A quick tap on empty table: the selection's let go, and it may be the first tap of a lasso's double tap.
      if (touch.onEmpty && lifted.includes(touch.first)) {
        const f = touch.fingers.get(touch.first);
        if (f && Math.hypot(f.now.x - f.start.x, f.now.y - f.start.y) < TAP_SLOP && Date.now() - touch.firstDownAt < TAP_MS) {
          if (L.selected.length) {
            if (touch.clearTimer) clearTimeout(touch.clearTimer);
            touch.clearTimer = setTimeout(() => {
              touch.clearTimer = null;
              latest.get().setSelected([]);
            }, LASSO_TAP_MS);
          }
          touch.emptyTap = { x: f.start.x, y: f.start.y, at: Date.now() };
        }
        touch.onEmpty = false;
      }
      for (const id of lifted) touch.fingers.delete(id);
      if (touch.mode === 'camera') {
        touch.camStart = readCamera();
        touch.camFrom = [...touch.fingers.values()].slice(0, 2).map((f) => f.now);
        if (!touch.fingers.size) {
          L.saveCamera();
          touch.mode = 'none';
        }
      }
      if (!touch.fingers.size) touch.mode = 'none';
    };
    const cancel = () => {
      const L = latest.get();
      clearHold();
      if (touch.mode === 'carry') {
        L.setHeld(null);
        L.setTarget(null);
      }
      if (touch.mode === 'lasso') L.setLassoPath(null);
      if (touch.mode === 'group') {
        // Back where it was, untwisted.
        touch.groupAngle = 0;
        L.dropGroup({ x: 0, y: 0 });
      }
      touch.sources = [];
      touch.cards = [];
      touch.downAt.clear();
      touch.buttonFingers.clear();
      touch.fingers.clear();
      touch.onEmpty = false;
      L.setHandGap(null);
      touch.mode = 'none';
    };
    touch.api = { down, move, up, cancel };
    /** A hand card lifted out (the gesture has seen a mostly upward drag from where the finger landed). */
    const liftFromHand = (start: Touch, all: Touch[]) => {
      down([start]);
      // Its moment's hold has been had already.
      touch.pressedAt = 0;
      move(all);
    };
    /** A tap in the tray: on a card, its menu (or, a second tap, a flip). */
    const tapInHand = (at: Touch) => {
      down([at]);
      up([at]);
    };
    const points = (ts: Touch[]) => {
      'worklet';
      return ts.map((t) => ({ id: t.id, x: t.x, y: t.y }));
    };
    return Gesture.Manual()
      .onTouchesDown((e, manager) => {
        // A first finger on the hand tabs: theirs (they're buttons), not the table's.
        const t0 = e.changedTouches[0];
        const band = tabBand.value;
        const firstFinger = e.allTouches.length === e.changedTouches.length;
        const onTools = !!t0 && t0.x < band.toolsRight && t0.y >= band.toolsTop && t0.y < band.toolsBottom;
        if (firstFinger && t0 && ((t0.y >= band.top && t0.y < band.bottom) || onTools)) {
          manager.fail();
          return;
        }
        // A first finger in the open tray is watched but not claimed, so the hand's scroll view (table mode's) can
        // still scroll. As in table mode, past a little slop and a moment's hold, a mostly upward drag from a card
        // lifts it out: then the touch is claimed, and every finger is tracked here, as for the table. A sideways
        // one is left to the scroll view; a tap opens the card's menu.
        if (firstFinger) {
          if (t0 && t0.y >= band.tray) {
            trayTouch.set({ id: t0.id, x: t0.x, y: t0.y, t: Date.now(), watching: true });
            return;
          }
          trayTouch.set({ id: -1, x: 0, y: 0, t: 0, watching: false });
        }
        // Other fingers while a tray touch is only watched: ignored.
        if (trayTouch.get().watching) return;
        manager.activate();
        scheduleOnRN(down, points(e.changedTouches));
      })
      .onTouchesMove((e, manager) => {
        const tt = trayTouch.get();
        if (tt.watching) {
          const f = e.allTouches.find((a) => a.id === tt.id);
          if (!f) return;
          const dx = f.x - tt.x;
          const dy = f.y - tt.y;
          if (Math.hypot(dx, dy) < DRAG_SLOP || Date.now() - tt.t < LIFT_DELAY_MS) return;
          trayTouch.set({ ...tt, watching: false });
          if (Math.abs(dy) > Math.abs(dx)) {
            manager.activate();
            scheduleOnRN(liftFromHand, { id: tt.id, x: tt.x, y: tt.y }, points(e.allTouches));
          } else {
            manager.fail();
          }
          return;
        }
        scheduleOnRN(move, points(e.allTouches));
      })
      .onTouchesUp((e, manager) => {
        const tt = trayTouch.get();
        const allUp = e.allTouches.length <= e.changedTouches.length;
        if (tt.watching) {
          const f = e.changedTouches.find((a) => a.id === tt.id);
          if (f) {
            if (Math.hypot(f.x - tt.x, f.y - tt.y) < DRAG_SLOP) scheduleOnRN(tapInHand, { id: tt.id, x: tt.x, y: tt.y });
            trayTouch.set({ id: -1, x: 0, y: 0, t: 0, watching: false });
            manager.end();
          }
          return;
        }
        scheduleOnRN(up, points(e.changedTouches));
        if (allUp) manager.end();
      })
      .onTouchesCancelled((_, manager) => {
        if (!trayTouch.get().watching) scheduleOnRN(cancel);
        trayTouch.set({ id: -1, x: 0, y: 0, t: 0, watching: false });
        manager.end();
      });
  });
  // ---- Menus ----
  const viewMiddle = () => {
    const c = readCamera();
    return toTable(c, area.w / 2, handTop / 2);
  };
  /** Puts cards on the table in the middle of the view, upright as seen (snapped to the table's 45° steps). */
  const playToView = (t: SandboxTable, cards: SandboxCard[]) => {
    const m = viewMiddle();
    const at = { x: m.x, y: m.y, angle: snapAngle(-cameraAngle(readCamera()), 45, 45) };
    return putOnTable(t, cards, gridOn ? snapToGrid(at) : at, newId());
  };

  /**
   * A new stack (the last in `next`) comes onto the table where it can't get lost: above everything already on it,
   * centered across it (below it, if there's no room above). It flies in from the top of the screen as the camera
   * glides over to center on it (unlocked, if it was locked), and it arrives picked out.
   */
  const arrive = (next: SandboxTable) => {
    if (!table || next === table) return;
    const added = next.stacks[next.stacks.length - 1];
    if (!added) return;
    const { h } = size(added.cards[added.cards.length - 1].deckId);
    const all = tableBounds(table, size);
    let at = all ? { x: all.x + all.w / 2, y: all.y - GRID_STEP - h / 2 } : viewMiddle();
    if (all && at.y < h / 2) at = { x: at.x, y: all.y + all.h + GRID_STEP + h / 2 };
    if (gridOn) at = snapToGrid({ ...at, angle: 0 });
    at = { x: Math.min(TABLE_W, Math.max(0, at.x)), y: Math.min(TABLE_H, Math.max(0, at.y)) };
    const placed = { ...next, stacks: next.stacks.map((s) => (s.id === added.id ? { ...s, x: at.x, y: at.y } : s)) };
    commit(next.lockCamera ? { ...placed, lockCamera: false } : placed);
    setSelected([added.id]);
    // The camera glides to put it in the middle of what's in view (between the top bar and the hand), as it is
    // (zoom and turn kept); so on screen, it lands there.
    const cam = readCamera();
    const to = { x: area.w / 2, y: (insets.top + TOP_BAR_H + handTop) / 2 };
    const glide = { duration: ARRIVE_MS, easing: ReEasing.inOut(ReEasing.cubic) };
    camX.set(withTiming(to.x - (cam.a * at.x - cam.b * at.y), glide));
    camY.set(withTiming(to.y - (cam.b * at.x + cam.a * at.y), glide));
    setTimeout(() => latest.get().saveCamera(), ARRIVE_MS + 50);
    setArriving({ stackId: added.id, key: newId(), to, scale: cameraZoom(cam), angle: cameraAngle(cam) });
    haptics.lift();
  };
  const addDeckToTable = (deck: Deck) => {
    if (!table) return;
    arrive(addDeck(table, deck, viewMiddle(), newId));
  };
  /** Some of a deck's cards, chosen one by one: in one face-down stack. */
  const addCardsToTable = (deck: Deck, cardIds: string[]) => {
    if (!table) return;
    arrive(addCards(table, deck, cardIds, viewMiddle(), newId));
  };

  const rename = askName;

  /** A card brought up close, for its menu: about half the screen across (less, for a tall screen's sake). */
  const bigCard = (c: SandboxCard) => {
    const deck = decksById.get(c.deckId);
    if (!deck) return null;
    const w = Math.min(screenW * 0.55, area.h * 0.36 * cardRatio(deck));
    return <CardView deck={deck} card={cardOf(c)} faceUp={c.faceUp} width={w} sharp />;
  };
  const menuStack = menu?.kind === 'stack' ? table?.stacks.find((s) => s.id === menu.id) : undefined;
  const menuHandCard = menu?.kind === 'hand' ? table?.hands[menu.hand].find((c) => c.iid === menu.iid) : undefined;
  const sheet = (() => {
    if (!table || !menu) return null;
    if (menu.kind === 'stack' && menuStack) {
      const top = menuStack.cards[menuStack.cards.length - 1];
      const n = menuStack.cards.length;
      const tiles: SheetTile[] = [
        { label: 'Flip over', icon: FLIP_ICON, onPress: () => commit(settleOnto(flipStack(table, menuStack.id), menuStack.id)) },
        { label: 'Turn left', icon: { ios: 'rotate.left', android: 'rotate_left', web: 'rotate_left' }, onPress: () => commit(turnStack(table, menuStack.id, -90)) },
        { label: 'Turn right', icon: { ios: 'rotate.right', android: 'rotate_right', web: 'rotate_right' }, onPress: () => commit(turnStack(table, menuStack.id)) },
        // Into the open hand: the top card, or any card, looked for.
        {
          label: 'Draw',
          icon: { ios: 'arrow.down.to.line', android: 'download', web: 'download' },
          onPress: () => {
            commit(dealToHand(table, menuStack.id, 1, handIndex));
            haptics.drop();
          },
        },
        ...(n > 1
          ? [{ label: 'Search', icon: { ios: 'magnifyingglass', android: 'search', web: 'search' } as const, keepsOpen: true, onPress: () => setSearching(menuStack.id) }]
          : []),
        // Dealing: how many off the top, and to whom (see DealPanel).
        {
          label: 'Deal',
          icon: { ios: 'hand.raised', android: 'back_hand', web: 'back_hand' },
          keepsOpen: true,
          onPress: () => setDealingFrom(menuStack.id),
        },
        ...(n > 1
          ? [
              {
                label: 'Shuffle',
                icon: { ios: 'shuffle', android: 'shuffle', web: 'shuffle' } as const,
                onPress: () => {
                  commit(shuffleStack(table, menuStack.id));
                  setRiffling((r) => ({ stackId: menuStack.id, key: (r?.key ?? 0) + 1, started: false }));
                },
              },
            ]
          : []),
        // Spread out, every card showing, as close as the grid allows.
        ...(n > 1
          ? [
              {
                label: 'Fan down',
                icon: { ios: 'rectangle.split.1x2', android: 'view_agenda', web: 'view_agenda' } as const,
                onPress: () => commit(fanStack(table, menuStack.id, 'down', newId)),
              },
              {
                label: 'Fan across',
                icon: { ios: 'rectangle.split.3x1', android: 'view_column', web: 'view_column' } as const,
                onPress: () => commit(fanStack(table, menuStack.id, 'across', newId)),
              },
            ]
          : []),
        {
          label: menuStack.locked ? 'Unlock' : 'Lock in place',
          icon: menuStack.locked ? ({ ios: 'lock.open', android: 'lock_open', web: 'lock_open' } as const) : ({ ios: 'lock', android: 'lock', web: 'lock' } as const),
          onPress: () => commit(setStack(table, menuStack.id, { locked: !menuStack.locked })),
        },
        // A single card can be kept from stacking: nothing goes onto it, and it goes onto nothing.
        ...(n === 1
          ? [
              {
                label: top.solo ? 'Let it stack' : 'Never stack',
                icon: top.solo ? ({ ios: 'square.stack', android: 'layers', web: 'layers' } as const) : ({ ios: 'nosign', android: 'block', web: 'block' } as const),
                onPress: () => commit(setSolo(table, menuStack.id, !top.solo)),
              },
            ]
          : []),
        ...(top.faceUp
          ? [{ label: 'Full size', icon: { ios: 'arrow.up.left.and.arrow.down.right', android: 'open_in_full', web: 'open_in_full' } as const, keepsOpen: true, onPress: () => setZoomed(top) }]
          : []),
        {
          label: 'Off table',
          icon: { ios: 'trash', android: 'delete', web: 'delete' },
          destructive: true,
          onPress: () => commit(take(table, { kind: 'stack', stackId: menuStack.id })),
        },
      ];
      return {
        title: n > 1 ? `Stack of ${n}` : top.faceUp ? (cardOf(top)?.name ?? 'Card') : 'Face-down card',
        header: bigCard(top),
        tiles,
        actions: [],
      };
    }
    if (menu.kind === 'hand' && menuHandCard) {
      const src: Source = { kind: 'hand', hand: menu.hand, iid: menu.iid };
      const tiles: SheetTile[] = [
        { label: 'Flip over', icon: FLIP_ICON, onPress: () => commit(flipInHand(table, menu.hand, menu.iid)) },
        {
          label: 'Play',
          icon: { ios: 'rectangle.portrait.on.rectangle.portrait', android: 'style', web: 'style' },
          onPress: () => commit(playToView(take(table, src), [menuHandCard])),
        },
        ...(menuHandCard.faceUp
          ? [{ label: 'Full size', icon: { ios: 'arrow.up.left.and.arrow.down.right', android: 'open_in_full', web: 'open_in_full' } as const, keepsOpen: true, onPress: () => setZoomed(menuHandCard) }]
          : []),
        { label: 'Off table', icon: { ios: 'trash', android: 'delete', web: 'delete' }, destructive: true, onPress: () => commit(take(table, src)) },
      ];
      return {
        title: menuHandCard.faceUp ? (cardOf(menuHandCard)?.name ?? 'Card') : 'Face-down card',
        header: bigCard(menuHandCard),
        tiles,
        actions: [],
      };
    }
    if (menu.kind === 'table') {
      return {
        title: table.name,
        tiles: [],
        actions: [
          { label: 'Add a deck…', onPress: () => setTimeout(() => setMenu({ kind: 'addDeck' }), 250) },
          // Its own screen, which iOS can only show once this menu has gone.
          { label: 'Add cards…', opensModal: true, onPress: () => setAddingCards(true) },
          { label: 'Table color…', onPress: () => setTimeout(() => setMenu({ kind: 'color' }), 250) },
          {
            label: 'Reset the view',
            onPress: () => {
              if (!view) return;
              // Every card in sight: below the top bar's buttons, above the hand, upright.
              const bounds = tableBounds(table, size);
              const top = insets.top + TOP_BAR_H;
              const space = { x: FIT_MARGIN, y: top + FIT_MARGIN, w: view.w - FIT_MARGIN * 2, h: view.h - HAND_H - top - FIT_MARGIN * 2 };
              writeCamera(bounds ? fitCamera(bounds, space) : startCamera({ w: view.w, h: view.h - HAND_H }, table.focus));
              saveCamera();
            },
          },
          ...(Platform.OS === 'ios'
            ? [{ label: 'Rename table', opensModal: true, onPress: () => rename('Rename table', table.name, (name) => updateSandbox({ ...table, name })) }]
            : []),
          {
            label: 'Clear the table',
            destructive: true,
            onPress: () => commit({ ...table, stacks: [], hands: table.hands.map(() => []) }),
          },
        ],
      };
    }
    if (menu.kind === 'color') {
      const pick = (background: string | undefined) => {
        const { background: _old, ...rest } = table;
        updateSandbox(background ? { ...rest, background } : rest);
        haptics.tick();
      };
      return {
        title: 'Table color',
        tiles: [],
        actions: [
          { label: `Classic felt${table.background ? '' : '  ✓'}`, onPress: () => pick(undefined) },
          ...Object.entries(CLOTHS).map(([key, c]) => ({ label: `${c.name}${table.background === key ? '  ✓' : ''}`, onPress: () => pick(key) })),
        ],
      };
    }
    if (menu.kind === 'addDeck') {
      const playable = decks.filter((d) => d.cards.length);
      return {
        title: playable.length ? 'Add a deck to the table' : 'No decks with cards yet',
        tiles: [],
        actions: playable.map((d) => ({ label: d.name, onPress: () => addDeckToTable(d) })),
      };
    }
    return null;
  })();

  // ---- The top bar ----
  // Its undo always runs this render's undo.
  const [latestUndo] = useState(() => {
    const box = { fn: () => {} };
    return { set: (fn: () => void) => Object.assign(box, { fn }), get: () => box.fn };
  });
  latestUndo.set(undo);
  const [latestRedo] = useState(() => {
    const box = { fn: () => {} };
    return { set: (fn: () => void) => Object.assign(box, { fn }), get: () => box.fn };
  });
  latestRedo.set(redo);
  const carrying = !!held;
  useEffect(() => {
    if (!table) return onControls(null);
    onControls({
      title: table.name,
      canUndo: history.length > 0,
      busy: carrying,
      undo: () => latestUndo.get()(),
      redo: () => latestRedo.get()(),
      canRedo: future.length > 0,
      openMenu: () => setMenu({ kind: 'table' }),
    });
  }, [history.length, future.length, carrying, onControls, table, latestUndo, latestRedo]);

  if (!table) {
    return (
      <View style={styles.missing}>
        <Text style={styles.missingText}>This table no longer exists.</Text>
        <Pressable onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.link}>Go back</Text>
        </Pressable>
      </View>
    );
  }

  const chosenIds = new Set(chosen);
  const cloth = table.background ? CLOTHS[table.background] : undefined;
  const arrivingStack = arriving ? table.stacks.find((s) => s.id === arriving.stackId) : undefined;
  const arrivingTop = arrivingStack?.cards[arrivingStack.cards.length - 1];
  const riffleStack = riffling ? table.stacks.find((s) => s.id === riffling.stackId) : undefined;
  const riffleDeck = riffleStack ? decksById.get(riffleStack.cards[riffleStack.cards.length - 1].deckId) : undefined;
  const heldTop = held ? held.cards[held.cards.length - 1] : null;
  const heldDeck = heldTop ? getDeck(heldTop.deckId) : undefined;
  const heldSize = heldTop ? size(heldTop.deckId) : null;
  const zoomDeck = zoomed ? getDeck(zoomed.deckId) : undefined;
  const zoomCard = zoomed ? cardOf(zoomed) : undefined;

  return (
    <View style={styles.root}>
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill} onLayout={layOut}>
          {/* The table, seen through the camera. */}
          <Animated.View style={[styles.world, worldStyle]} pointerEvents="none">
            <View style={styles.tableEdge} />
            {/* The cloth's color, if one's been chosen: under a lighter weave. */}
            {cloth ? <View style={[styles.cloth, { backgroundColor: cloth.color }]} /> : null}
            <Image source={require('../../assets/textures/felt.png')} resizeMode="repeat" style={[styles.felt, cloth && styles.feltOverCloth]} />
            {gridOn ? <GridLines /> : null}
            {table.stacks.map((s) =>
              groupMoving && chosenIds.has(s.id) && !s.locked ? null : (
                <StackView
                  key={s.id}
                  stack={s}
                  deck={decksById.get(s.cards[s.cards.length - 1].deckId)}
                  decks={decksById}
                  size={size(s.cards[s.cards.length - 1].deckId)}
                  // While carried, its carried cards are out of sight (the rest still show); while riffled, all of it.
                  hidden={
                    (riffling?.started && riffling.stackId === s.id) || arriving?.stackId === s.id
                      ? s.cards.map((c) => c.iid).join(',')
                      : held
                        ? s.cards.filter((c) => heldIds.has(c.iid)).map((c) => c.iid).join(',')
                        : ''
                  }
                  target={target === s.id}
                  selected={chosenIds.has(s.id)}
                />
              ),
            )}
            {/* A stack being shuffled: the riffle, played where it lies, turned as it is. */}
            {riffling && riffleStack && riffleDeck ? (
              <View
                style={[
                  styles.stack,
                  {
                    left: riffleStack.x - size(riffleDeck.id).w / 2,
                    top: riffleStack.y - size(riffleDeck.id).h / 2,
                    width: size(riffleDeck.id).w,
                    height: size(riffleDeck.id).h,
                    transform: [{ rotate: `${riffleStack.angle}deg` }],
                  },
                ]}>
                <Riffle
                  key={riffling.key}
                  deck={riffleDeck}
                  width={size(riffleDeck.id).w}
                  onStart={() => setRiffling((r) => (r ? { ...r, started: true } : r))}
                  onDone={() => setRiffling(null)}
                />
              </View>
            ) : null}
            {/* The picked-out group, while it's dragged: drawn together, sliding with the finger. */}
            {groupMoving ? (
              <Animated.View
                style={[styles.groupLayer, groupStyle, (groupInHand !== null || pileFlights.some((f) => !f.into)) && styles.hidden]}>
                {table.stacks
                  .filter((s) => chosenIds.has(s.id) && !s.locked)
                  .map((s) => (
                    <StackView
                      key={s.id}
                      stack={s}
                      deck={decksById.get(s.cards[s.cards.length - 1].deckId)}
                      decks={decksById}
                      size={size(s.cards[s.cards.length - 1].deckId)}
                      hidden=""
                      target={false}
                      selected
                    />
                  ))}
                {flyers.map((f) => {
                  const deck = decksById.get(f.card.deckId);
                  return deck ? (
                    <GatherFlyer
                      key={f.key}
                      flyer={f}
                      deck={deck}
                      size={size(f.card.deckId)}
                      onLanded={() => setFlyers((all) => all.filter((x) => x.key !== f.key))}
                    />
                  ) : null;
                })}
              </Animated.View>
            ) : null}
            {/* Cards flying into a stack gathered without dragging (with the buttons). */}
            {!groupMoving && flyers.length ? (
              <View style={styles.groupLayer}>
                {flyers.map((f) => {
                  const deck = decksById.get(f.card.deckId);
                  return deck ? (
                    <GatherFlyer
                      key={f.key}
                      flyer={f}
                      deck={deck}
                      size={size(f.card.deckId)}
                      onLanded={() => setFlyers((all) => all.filter((x) => x.key !== f.key))}
                    />
                  ) : null;
                })}
              </View>
            ) : null}
          </Animated.View>

          {/*
            The hand tray along the bottom, as in table mode: wood, edge to edge and down to the bottom of the
            screen, with its tabs standing on its top edge. One tab per hand; only the chosen hand shows, so the
            phone can be passed round. Tapping the chosen tab folds the tray away (and back); holding a tab
            renames it.
          */}
          <Animated.View style={[styles.trayWrap, { top: trayOpenTop - HAND_TAB_H, height: trayH + HAND_TAB_H }, trayStyle]}>
            <View style={styles.tabs}>
              {Array.from({ length: HAND_COUNT }, (_, i) => {
                const on = i === handIndex;
                return (
                  <Pressable
                    key={i}
                    onPress={() => (on ? foldTray(!folded) : chooseHand(i))}
                    onLongPress={() =>
                      rename('Rename hand', table.handNames[i], (name) =>
                        updateSandbox({ ...table, handNames: table.handNames.map((n, j) => (j === i ? name : n)) }),
                      )
                    }
                    disabled={carrying}
                    hitSlop={{ top: 8, bottom: 4 }}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${table.handNames[i]}, ${table.hands[i].length} cards`}
                    accessibilityHint={on ? (folded ? 'Opens the hand' : 'Folds the hand away') : 'Shows this hand. Hold to rename it.'}
                    style={({ pressed }) => [styles.tab, on && styles.tabOn, pressed && styles.tabPressed]}>
                    <Text style={[styles.tabText, on && styles.tabTextOn]} numberOfLines={1}>
                      {table.handNames[i]} · {table.hands[i].length}
                    </Text>
                    {on ? (
                      <SymbolView
                        name={folded ? { ios: 'chevron.up', android: 'expand_less', web: 'expand_less' } : { ios: 'chevron.down', android: 'expand_more', web: 'expand_more' }}
                        size={10}
                        weight="bold"
                        tintColor={colors.accent}
                      />
                    ) : null}
                  </Pressable>
                );
              })}
            </View>
            <View style={{ height: trayH }} pointerEvents="box-none">
              <WoodRail />
              <View style={[styles.groove, { top: HAND_TOP_PAD, height: handCardH + HAND_ROW_PAD * 2 }]} />
              {hand.length === 0 && handGap === null ? (
                <Text style={[styles.trayEmpty, { top: rowTop + handCardH / 2 - 10 }]}>Drag cards here to put them in {table.handNames[handIndex]}</Text>
              ) : null}
              {/*
                The row: table mode's scroll view, card for card, so it scrolls, stretches and bounces just the same.
                Folded away, its cards peek out but can't be touched.
              */}
              <ScrollView
                ref={(view) => handList.attach(view)}
                horizontal
                alwaysBounceHorizontal
                showsHorizontalScrollIndicator={false}
                scrollEnabled={!held && !folded}
                scrollEventThrottle={16}
                onScroll={(e) => handScroll.set(e.nativeEvent.contentOffset.x)}
                style={[styles.handList, { top: HAND_TOP_PAD, height: handCardH + HAND_ROW_PAD * 2, pointerEvents: folded ? 'none' : 'auto' }]}
                contentContainerStyle={styles.handCards}>
                {/*
                  Every card of the hand in its own place, always, all of it mounted: those being carried stay there,
                  unseen and taking no room. The finger carrying one is attached to the very view it landed on (the
                  card's picture); if that went, iOS would let the drag go the moment any other finger lifted. The
                  gap goes in among the rest, where carried cards would go in. Cards slide to their new places.
                */}
                {hand.flatMap((c) => {
                  const carried = heldIds.has(c.iid);
                  const gapHere = !carried && handGap === handRow.indexOf(c);
                  const deck = decksById.get(c.deckId);
                  if (!deck) return [];
                  const view = (
                    <Animated.View
                      key={c.iid}
                      layout={HAND_SLIDE}
                      style={carried ? styles.carried : { width: handWidthOf(c), pointerEvents: 'box-only' }}>
                      <CardView deck={deck} card={cardOf(c)} faceUp={c.faceUp} width={handWidthOf(c)} />
                    </Animated.View>
                  );
                  return gapHere ? [<Animated.View key="gap" layout={HAND_SLIDE} style={{ width: gapWidth, height: handCardH }} />, view] : [view];
                })}
                {handGap !== null && handGap >= handRow.length ? (
                  <Animated.View key="gap" layout={HAND_SLIDE} style={{ width: gapWidth, height: handCardH }} />
                ) : null}
              </ScrollView>
            </View>
          </Animated.View>

          {/* The tools drawer, on the left edge: its tab pulls it out, and tucks it away again. */}
          <Animated.View style={[styles.tools, { top: toolsTop }, toolsStyle]} pointerEvents="box-none">
            <View style={styles.toolsPanel}>
              <Text style={styles.toolsTitle}>Tools</Text>
              <View style={styles.toolRow}>
                <SymbolView name={{ ios: 'square.grid.3x3', android: 'grid_on', web: 'grid_on' }} size={18} tintColor={colors.text} />
                <Text style={styles.toolText}>Snap to grid</Text>
                <Switch
                  value={gridOn}
                  onValueChange={(on) => {
                    updateSandbox({ ...table, snapToGrid: on });
                    haptics.tick();
                  }}
                  trackColor={{ true: colors.accent, false: undefined }}
                  accessibilityLabel="Snap to grid"
                  accessibilityHint="Cards put down line up in an invisible grid. Cards already on the table stay put."
                />
              </View>
              <View style={styles.toolRow}>
                <SymbolView name={{ ios: 'lock', android: 'lock', web: 'lock' }} size={18} tintColor={colors.text} />
                <Text style={styles.toolText}>Lock camera</Text>
                <Switch
                  value={!!table.lockCamera}
                  onValueChange={(on) => {
                    updateSandbox({ ...table, lockCamera: on });
                    haptics.tick();
                  }}
                  trackColor={{ true: colors.accent, false: undefined }}
                  accessibilityLabel="Lock camera"
                  accessibilityHint="The view stays put: sliding, zooming and turning the table do nothing. Cards still move."
                />
              </View>
            </View>
            <Pressable
              onPress={() => showTools(!toolsOpen)}
              hitSlop={{ right: 10, top: 6, bottom: 6 }}
              accessibilityRole="button"
              accessibilityLabel={toolsOpen ? 'Hide tools' : 'Show tools'}
              style={({ pressed }) => [styles.toolsTab, pressed && styles.tabPressed]}>
              <SymbolView
                name={toolsOpen ? { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' } : { ios: 'wrench.and.screwdriver', android: 'build', web: 'build' }}
                size={14}
                weight="semibold"
                tintColor={colors.accent}
              />
            </Pressable>
          </Animated.View>

          {/*
            The flip button: while cards (or a group) are carried, tapped with another finger to turn them over; and
            whenever cards are picked out, to turn them over where they lie.
          */}
          {held || groupMoving || chosen.length ? (
            <View
              pointerEvents="none"
              style={[styles.flipButton, { left: flipButton.x, top: flipButton.y, width: FLIP_SIZE, height: FLIP_SIZE, borderRadius: FLIP_SIZE / 2 }]}>
              <SymbolView name={FLIP_ICON} size={28} weight="semibold" tintColor={colors.accentText} />
            </View>
          ) : null}

          {/* With two or more picked out: above the flip button, one to gather them all into a stack. */}
          {!held && chosen.length > 1 ? (
            <View
              pointerEvents="none"
              style={[styles.flipButton, { left: stackButton.x, top: stackButton.y, width: FLIP_SIZE, height: FLIP_SIZE, borderRadius: FLIP_SIZE / 2 }]}>
              <SymbolView name={{ ios: 'square.stack.3d.down.right', android: 'layers', web: 'layers' }} size={26} weight="semibold" tintColor={colors.accentText} />
            </View>
          ) : null}

          {/* With cards picked out (dragged or not): one to take them off the table. */}
          {!held && chosen.length ? (
            <View
              pointerEvents="none"
              style={[styles.flipButton, styles.trashButton, { left: trashButton.x, top: trashButton.y, width: FLIP_SIZE, height: FLIP_SIZE, borderRadius: FLIP_SIZE / 2 }]}>
              <SymbolView name={{ ios: 'trash', android: 'delete', web: 'delete' }} size={24} weight="semibold" tintColor="#fff" />
            </View>
          ) : null}

          {/* A stack just brought onto the table, flying in from the top of the screen. */}
          {arriving && arrivingTop && decksById.get(arrivingTop.deckId) ? (
            <ArrivalFlyer
              key={arriving.key}
              deck={decksById.get(arrivingTop.deckId)!}
              card={arrivingTop}
              size={size(arrivingTop.deckId)}
              from={{ x: area.w / 2, y: insets.top + TOP_BAR_H / 2 }}
              to={arriving.to}
              scale={arriving.scale}
              angle={arriving.angle}
              onLanded={() => {
                setArriving(null);
                haptics.drop();
              }}
            />
          ) : null}

          {/* The lasso, as it's drawn. */}
          {lassoPath && lassoPath.length > 1 ? <LassoLine points={lassoPath} /> : null}

          {/* A dragged group over the hand: gathered into one pile under the finger, at hand size, ready to go in. */}
          {groupMoving && groupLeadTop && decksById.get(groupLeadTop.deckId) && !pileFlights.some((f) => f.into) ? (
            <Animated.View
              pointerEvents="none"
              style={[
                styles.held,
                {
                  width: size(groupLeadTop.deckId).w,
                  height: size(groupLeadTop.deckId).h,
                  left: -size(groupLeadTop.deckId).w / 2,
                  top: -size(groupLeadTop.deckId).h / 2,
                },
                heldStyle,
              ]}>
              <CardView
                deck={decksById.get(groupLeadTop.deckId)!}
                card={cardOf(groupLeadTop)}
                faceUp={groupLeadTop.faceUp}
                width={size(groupLeadTop.deckId).w}
                sharp
              />
              <View style={styles.badge}>
                <Text style={styles.badgeText}>{chosen.reduce((n, id) => n + (table.stacks.find((s) => s.id === id)?.cards.length ?? 0), 0)}</Text>
              </View>
            </Animated.View>
          ) : null}

          {/* Cards flying between the spread-out group and its pile over the hand. */}
          {pileFlights.map((f) => {
            const deck = decksById.get(f.card.deckId);
            return deck ? (
              <PileFlyer
                key={f.key}
                flight={f}
                deck={deck}
                size={size(f.card.deckId)}
                live={pileLive}
                onLanded={() => {
                  setPileFlights((all) => {
                    const left = all.filter((x) => x.key !== f.key);
                    // The last one in: a tick as the pile forms; the last one out: a thud as the group lands.
                    if (!left.length && all.length) (f.into ? haptics.tick : haptics.drop)();
                    return left;
                  });
                }}
              />
            ) : null;
          })}

          {/* The card being carried, drawn over everything, following the finger, just as it will lie. */}
          {held && heldTop && heldDeck && heldSize ? (
            <Animated.View
              pointerEvents="none"
              style={[styles.held, { width: heldSize.w, height: heldSize.h, left: -heldSize.w / 2, top: -heldSize.h / 2 }, heldStyle]}>
              <CardView deck={heldDeck} card={cardOf(heldTop)} faceUp={heldTop.faceUp} width={heldSize.w} sharp />
              {held.cards.length > 1 ? (
                <View style={styles.badge}>
                  <Text style={styles.badgeText}>{held.cards.length}</Text>
                </View>
              ) : null}
            </Animated.View>
          ) : null}
        </View>
      </GestureDetector>

      {/* A card or stack's menu: the card brought up close, its options under it. */}
      <CardFocus
        visible={!!sheet && (menu?.kind === 'stack' || menu?.kind === 'hand')}
        card={sheet && 'header' in sheet ? sheet.header : null}
        title={sheet?.title}
        tiles={sheet?.tiles ?? []}
        panel={
          menu?.kind === 'stack' && menuStack && dealingFrom === menuStack.id ? (
            <DealPanel
              max={menuStack.cards.length}
              players={table.handNames.map((name, i) => ({ name, holding: table.hands[i].length }))}
              onDeal={(count, player) => {
                commit(dealToHand(table, menuStack.id, count, player));
                haptics.drop();
                setMenu(null);
              }}
              onBack={() => setDealingFrom(null)}
            />
          ) : menu?.kind === 'stack' && menuStack && searching === menuStack.id ? (
            <StackSearch
              cards={menuStack.cards}
              deckOf={(c) => decksById.get(c.deckId)}
              handName={table.handNames[handIndex]}
              onTake={(card) => {
                const rest = take(table, { kind: 'card', stackId: menuStack.id, iid: card.iid });
                commit(putInHand(rest, [{ ...card, faceUp: true }], handIndex));
                haptics.drop();
                setMenu(null);
                setSearching(null);
              }}
              onBack={() => setSearching(null)}
            />
          ) : undefined
        }
        onClose={() => {
          setMenu(null);
          setDealingFrom(null);
          setSearching(null);
        }}
        overlay={
          zoomed && zoomDeck && zoomCard ? (
            <CardZoom
              deck={zoomDeck}
              current={{ key: zoomed.iid, card: zoomCard }}
              area={{ w: screenW, h: area.h }}
              onClose={() => setZoomed(null)}
            />
          ) : undefined
        }
      />
      <AddCardsModal visible={addingCards} decks={decks} onAdd={addCardsToTable} onClose={() => setAddingCards(false)} />
      {/* The table's menu, and choosing a deck to add. */}
      <ActionSheet
        visible={!!sheet && (menu?.kind === 'table' || menu?.kind === 'addDeck' || menu?.kind === 'color')}
        title={sheet?.title}
        actions={sheet?.actions ?? []}
        onClose={() => setMenu(null)}
      />
    </View>
  );
}

/**
 * The grid's lines across the whole table, shown while snapping is on (for now, for trying it out: the grid is
 * meant to be invisible). Cards snap to their crossings and the middles of their squares.
 */
const GridLines = memo(function GridLines() {
  return [
    ...Array.from({ length: Math.floor(TABLE_W / GRID_STEP) + 1 }, (_, i) => (
      <View key={`v${i}`} style={[styles.gridLine, { left: i * GRID_STEP - 0.75, top: 0, width: 1.5, height: TABLE_H }]} />
    )),
    ...Array.from({ length: Math.floor(TABLE_H / GRID_STEP) + 1 }, (_, i) => (
      <View key={`h${i}`} style={[styles.gridLine, { top: i * GRID_STEP - 0.75, left: 0, height: 1.5, width: TABLE_W }]} />
    )),
  ];
});

/** A card flying into a stack just gathered: from where its stack lay (relative to the gathering one), to it. */
interface Flyer {
  key: string;
  card: SandboxCard;
  /** Where the stack it flies to lies, and its turn. */
  at: { x: number; y: number; angle: number };
  /** Where it starts, relative to that, and its own turn. */
  from: { dx: number; dy: number; angle: number };
  /** Which way up it lands (the gathering stack's way). */
  face: boolean;
}

/** How long a gathered card takes to fly into its stack. */
const GATHER_MS = 340;

/** One card's flight into a gathered stack: gliding there, turning to its angle, and flipping over if it must. */
function GatherFlyer({ flyer, deck, size, onLanded }: { flyer: Flyer; deck: Deck; size: { w: number; h: number }; onLanded: () => void }) {
  const [t] = useState(() => new RNAnimated.Value(0));
  const [faceUp, setFaceUp] = useState(flyer.card.faceUp);
  useEffect(() => {
    // Turned to the stack's way as it goes (the card turning over as it flies).
    setTimeout(() => setFaceUp(flyer.face), GATHER_MS * 0.15);
    RNAnimated.timing(t, { toValue: 1, duration: GATHER_MS, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      haptics.tick();
      onLanded();
    });
    // Once, as it sets off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  // Turning the short way round.
  const turn = ((((flyer.at.angle - flyer.from.angle + 180) % 360) + 360) % 360) - 180;
  return (
    <RNAnimated.View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: flyer.at.x - size.w / 2,
        top: flyer.at.y - size.h / 2,
        transform: [
          { translateX: t.interpolate({ inputRange: [0, 1], outputRange: [flyer.from.dx, 0] }) },
          { translateY: t.interpolate({ inputRange: [0, 1], outputRange: [flyer.from.dy, 0] }) },
          { rotate: t.interpolate({ inputRange: [0, 1], outputRange: [`${flyer.from.angle}deg`, `${flyer.from.angle + turn}deg`] }) },
        ],
      }}>
      <CardView deck={deck} card={deck.cards.find((c) => c.id === flyer.card.cardId)} faceUp={faceUp} width={size.w} sharp />
    </RNAnimated.View>
  );
}

/**
 * A stack just brought onto the table: its top card flying in from the top of the screen to where it lands (on
 * screen; the camera brings the table under it as it flies), growing to its size there as it comes.
 */
function ArrivalFlyer({
  deck,
  card,
  size,
  from,
  to,
  scale,
  angle,
  onLanded,
}: {
  deck: Deck;
  card: SandboxCard;
  size: { w: number; h: number };
  from: { x: number; y: number };
  to: { x: number; y: number };
  /** Screen points per table unit (the camera's zoom), and its turn: the card's size and turn on landing. */
  scale: number;
  angle: number;
  onLanded: () => void;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(
      withTiming(1, { duration: ARRIVE_MS, easing: ReEasing.inOut(ReEasing.cubic) }, (finished) => {
        if (finished) scheduleOnRN(onLanded);
      }),
    );
    // Once, as it sets off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const style = useAnimatedStyle(() => {
    const p = t.value;
    return {
      opacity: Math.min(1, p * 4),
      transform: [
        { translateX: from.x + (to.x - from.x) * p },
        { translateY: from.y + (to.y - from.y) * p },
        { rotate: `${angle * p}deg` },
        { scale: scale * (0.5 + 0.5 * p) },
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -size.w / 2, top: -size.h / 2, width: size.w, height: size.h }, style]}>
      <CardView deck={deck} card={deck.cards.find((c) => c.id === card.cardId)} faceUp={card.faceUp} width={size.w} sharp />
    </Animated.View>
  );
}

/** One card's flight between the spread-out group and its pile over the hand. */
interface PileFlight {
  key: string;
  card: SandboxCard;
  /** Where its stack lies in the group (before the group's drag), and its turn. */
  at: { x: number; y: number; angle: number };
  /** Its size in the pile: screen points per table unit, for a hand card's size. */
  handScale: number;
  /** Flying into the pile (gathering) rather than out of it (spreading out). */
  into: boolean;
}

/** What a flying card follows: the camera, how far the group has been dragged, and the finger (the pile). */
interface PileLive {
  camA: SharedValue<number>;
  camB: SharedValue<number>;
  camX: SharedValue<number>;
  camY: SharedValue<number>;
  groupDX: SharedValue<number>;
  groupDY: SharedValue<number>;
  fingerX: SharedValue<number>;
  fingerY: SharedValue<number>;
}

/** How long a card takes to fly between the group and its pile. */
const PILE_MS = 240;

/**
 * A card flying between the spread-out group and its pile over the hand: gliding, turning and resizing as it goes,
 * every frame between where it is in the group now and where the finger is now, so it keeps up as the finger moves.
 */
function PileFlyer({
  flight,
  deck,
  size,
  live,
  onLanded,
}: {
  flight: PileFlight;
  deck: Deck;
  size: { w: number; h: number };
  live: PileLive;
  onLanded: () => void;
}) {
  const t = useSharedValue(0);
  useEffect(() => {
    t.set(
      withTiming(1, { duration: PILE_MS, easing: ReEasing.out(ReEasing.cubic) }, (finished) => {
        if (finished) scheduleOnRN(onLanded);
      }),
    );
    // Once, as it sets off.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const { at, handScale, into } = flight;
  const style = useAnimatedStyle(() => {
    // In the group: its place there now (moved with the group), seen through the camera.
    const wx = at.x + live.groupDX.value;
    const wy = at.y + live.groupDY.value;
    const a = live.camA.value;
    const b = live.camB.value;
    const spread = {
      x: a * wx - b * wy + live.camX.value,
      y: b * wx + a * wy + live.camY.value,
      angle: at.angle + (Math.atan2(b, a) * 180) / Math.PI,
      scale: Math.hypot(a, b),
    };
    // In the pile: under the finger, upright, at hand size.
    const pile = { x: live.fingerX.value, y: live.fingerY.value, angle: 0, scale: handScale };
    const from = into ? spread : pile;
    const to = into ? pile : spread;
    const p = t.value;
    // Turning the short way round.
    const turn = ((((to.angle - from.angle + 180) % 360) + 360) % 360) - 180;
    return {
      transform: [
        { translateX: from.x + (to.x - from.x) * p },
        { translateY: from.y + (to.y - from.y) * p },
        { rotate: `${from.angle + turn * p}deg` },
        { scale: from.scale + (to.scale - from.scale) * p },
      ],
    };
  });
  return (
    <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: -size.w / 2, top: -size.h / 2, width: size.w, height: size.h }, style]}>
      <CardView deck={deck} card={deck.cards.find((c) => c.id === flight.card.cardId)} faceUp={flight.card.faceUp} width={size.w} sharp />
    </Animated.View>
  );
}
/** The lasso's line as it's drawn, closed back to its start, with a faint gold fill inside. */
function LassoLine({ points }: { points: { x: number; y: number }[] }) {
  const builder = Skia.PathBuilder.Make();
  builder.moveTo(points[0].x, points[0].y);
  for (const p of points.slice(1)) builder.lineTo(p.x, p.y);
  builder.close();
  const path = builder.build();
  return (
    <Canvas style={StyleSheet.absoluteFill} pointerEvents="none">
      <Path path={path} color="rgba(224,179,84,0.12)" />
      <Path path={path} color={colors.accent} style="stroke" strokeWidth={2} strokeJoin="round" />
    </Canvas>
  );
}

/** A stack on the table: its top card (and edges below it, for more than one), turned as it lies. */
const StackView = memo(function StackView({
  stack,
  deck,
  decks,
  size,
  hidden,
  target,
  selected,
}: {
  stack: SandboxStack;
  deck: Deck | undefined;
  decks: Map<string, Deck>;
  size: { w: number; h: number };
  /** Its cards being carried (out of sight here), as their ids joined by commas. */
  hidden: string;
  target: boolean;
  /** Picked out with the lasso: outlined in gold. */
  selected: boolean;
}) {
  const gone = new Set(hidden ? hidden.split(',') : []);
  const shown = gone.size ? stack.cards.filter((c) => !gone.has(c.iid)) : stack.cards;
  if (!shown.length || !deck) return null;
  const top = shown[shown.length - 1];
  const topDeck = decks.get(top.deckId) ?? deck;
  const card = topDeck.cards.find((c) => c.id === top.cardId);
  const edges = Math.min(2, shown.length - 1);
  return (
    <View
      style={[
        styles.stack,
        { left: stack.x - size.w / 2, top: stack.y - size.h / 2, width: size.w, height: size.h, transform: [{ rotate: `${stack.angle}deg` }] },
      ]}>
      {Array.from({ length: edges }, (_, i) => (
        <View key={i} style={[styles.edge, { left: (edges - i) * 2, top: (edges - i) * 2, width: size.w, height: size.h }]} />
      ))}
      <View style={styles.shadow}>
        <CardView deck={topDeck} card={card} faceUp={top.faceUp} width={size.w} sharp />
      </View>
      {shown.length > 1 ? (
        <View style={styles.badge}>
          <Text style={styles.badgeText}>{shown.length}</Text>
        </View>
      ) : null}
      {target || selected ? <View style={styles.target} /> : null}
      {/* Locked in place: a small padlock on its corner. */}
      {stack.locked ? (
        <View style={styles.lockBadge}>
          <SymbolView name={{ ios: 'lock.fill', android: 'lock', web: 'lock' }} size={11} tintColor={colors.text} />
        </View>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.feltDeep },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, backgroundColor: colors.bg },
  missingText: { color: colors.textMuted },
  link: { color: colors.accent, fontSize: 16, fontWeight: '600' },
  world: { position: 'absolute', left: 0, top: 0, width: TABLE_W, height: TABLE_H, transformOrigin: [0, 0, 0] },
  felt: { position: 'absolute', left: 0, top: 0, width: TABLE_W, height: TABLE_H, opacity: 0.9 },
  cloth: { position: 'absolute', left: 0, top: 0, width: TABLE_W, height: TABLE_H },
  feltOverCloth: { opacity: 0.3 },
  // A wooden rim round the table, so its edge is clear when zoomed out.
  tableEdge: {
    position: 'absolute',
    left: -40,
    top: -40,
    width: TABLE_W + 80,
    height: TABLE_H + 80,
    borderRadius: 60,
    backgroundColor: '#3b2414',
  },
  stack: { position: 'absolute' },
  edge: { position: 'absolute', borderRadius: 6, backgroundColor: '#d9d2c4', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.3)' },
  shadow: { shadowColor: '#000', shadowOpacity: 0.45, shadowRadius: 4, shadowOffset: { width: 1, height: 3 } },
  target: { position: 'absolute', left: -5, top: -5, right: -5, bottom: -5, borderRadius: 10, borderWidth: 3, borderColor: colors.accent },
  badge: {
    position: 'absolute',
    top: -8,
    right: -8,
    minWidth: 26,
    height: 26,
    borderRadius: 13,
    paddingHorizontal: 6,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeText: { color: colors.accentText, fontWeight: '800', fontSize: 13 },
  // The grid's lines, shown for now (for trying the grid out).
  gridLine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.13)' },
  // The tools drawer: a panel off the left edge, with a tab on its right edge to pull it out by.
  tools: { position: 'absolute', left: 0, width: TOOLS_W + TOOLS_TAB_W, height: TOOLS_H },
  toolsPanel: {
    width: TOOLS_W,
    height: TOOLS_H,
    padding: 14,
    gap: 12,
    backgroundColor: 'rgba(8,18,26,0.9)',
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 0,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  toolsTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toolText: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  toolsTab: {
    position: 'absolute',
    left: TOOLS_W,
    top: (TOOLS_H - TOOLS_TAB_H) / 2,
    width: TOOLS_TAB_W,
    height: TOOLS_TAB_H,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,18,26,0.9)',
    borderTopRightRadius: 12,
    borderBottomRightRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: 0,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  // The whole table's size (a sizeless layer at the table's corner can be skipped as off screen, cards and all),
  // turning about that corner, as its transform expects.
  groupLayer: { position: 'absolute', left: 0, top: 0, width: TABLE_W, height: TABLE_H, transformOrigin: [0, 0, 0] },
  flipButton: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.accent,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  held: { position: 'absolute' },
  hidden: { opacity: 0 },
  trashButton: { backgroundColor: colors.danger },
  lockBadge: {
    position: 'absolute',
    left: -6,
    bottom: -6,
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,18,26,0.85)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  // The tray and its tabs, which slide together when it folds.
  trayWrap: { position: 'absolute', left: 0, right: 0 },
  // The groove the hand's cards sit in, as along table mode's rail.
  groove: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.45)',
    borderBottomColor: 'rgba(255,220,180,0.12)',
  },
  trayEmpty: { position: 'absolute', left: 0, right: 0, color: 'rgba(255,240,220,0.45)', fontSize: 14, textAlign: 'center' },
  handCard: { position: 'absolute' },
  // A carried card's place in the hand: still there (see above), but unseen, untouchable, and taking no room.
  carried: { position: 'absolute', opacity: 0, pointerEvents: 'none' },
  // Table mode's hand row: its scroll view, and the space round and between its cards.
  handList: { position: 'absolute', left: 0, right: 0 },
  // Cards stand in the middle of the row's height (landscape ones are shorter than the rest).
  handCards: { paddingHorizontal: HAND_PAD, paddingVertical: HAND_ROW_PAD, gap: HAND_GAP, alignItems: 'center' },
  // Pull tabs standing on the tray's top edge, in the same wood, as table mode's: one per hand.
  tabs: { height: HAND_TAB_H, flexDirection: 'row', justifyContent: 'center', alignItems: 'flex-end', gap: 4, paddingHorizontal: 8 },
  tab: {
    flexShrink: 1,
    height: HAND_TAB_H,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    borderTopLeftRadius: 11,
    borderTopRightRadius: 11,
    backgroundColor: '#4a2d18',
    // The light catching its top edge, as along the rail's.
    borderTopWidth: 1.5,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,220,180,0.25)',
  },
  // The chosen hand's tab: lighter wood, like table mode's one tab.
  tabOn: { backgroundColor: '#6b4528', borderColor: 'rgba(255,220,180,0.35)' },
  tabPressed: { backgroundColor: '#3a2212' },
  tabText: { color: 'rgba(255,240,220,0.6)', fontSize: 12, fontWeight: '700' },
  tabTextOn: { color: 'rgba(255,240,220,0.95)' },
});
