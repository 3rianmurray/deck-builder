import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { router } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Fragment, memo, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { ActionSheetIOS, Alert, Animated as RNAnimated, Easing, Image, PanResponder, Platform, Pressable, ScrollView, StyleSheet, Switch, View, useWindowDimensions } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { Easing as ReEasing, LinearTransition, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDecks } from '../lib/DecksContext';
import { askName, askNumber } from '../lib/names';
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
  addPiece,
  DIE_SIDES,
  defaultPieceColor,
  PIECE_COLORS,
  movePieces,
  gridDice,
  separateDice,
  newPiece,
  pieceAt,
  PIECE_SHAPES,
  rollable,
  bagAt,
  bagItems,
  bagTakes,
  allAlike,
  drawFromBag,
  emptyBag,
  endSupply,
  itemKey,
  placeItem,
  putInBag,
  removeBagItems,
  besideBagOf,
  pieceName,
  artSize,
  fitZone,
  clipCards,
  copyItems,
  pasteItems,
  PIECE_SIZE,
  turnArt,
  normalizeAngle,
  artLevel,
  keepArtLevels,
  layerArt,
  raiseArt,
  ART_MAX,
  reorderBag,
  shuffleBag,
  keepCards,
  MIN_ZOOM,
  takeFromBag,
  trackSpaceAt,
  TRACK_MAX,
  pieceSizeOf,
  resizeZone,
  spotAt,
  zoneAt,
  zoneGripAt,
  toggleTimer,
  parseTimerText,
  timerText,
  cardSizeOf,
  matchStackSizes,
  scaleItems,
  scaleOf,
  piecesInShape,
  removePiece,
  throwDice,
  setPiece,
  stackTargetAt,
  startCamera,
  tableBounds,
  fitCamera,
  TABLE_H,
  TABLE_W,
  GRID_STEP,
  CARD_W,
  gatherDecks,
  setsOfDeck,
  gridStackReach,
  gridStepOf,
  GRID_SIZES,
  tidyTable,
  trashCards,
  takeFromTrash,
  take,
  UNITS_PER_MM,
  takeAll,
  dealToHand,
  toScreen,
  toTable,
  turnStack,
  moveLayer,
  reorderStack,
  fanStack,
  removeStacks,
  rotateStacks,
  setSolo,
  setStack,
  settleOnto,
  MAX_TABLE_CARDS,
  tableCardCount,
} from '../lib/sandbox';
import type { BagItem, Camera, CardSize, PieceKind, PiecePart, PieceShape, SandboxCard, SandboxStack, SandboxTable, Source, TablePiece } from '../lib/sandbox';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { artPicture, tokenPicture } from '../lib/images';
import { deckLook, isPlayground, isProPiece, usePro } from '../lib/pro';
import { updateSandbox, useSandbox } from '../lib/sandboxStore';
import { clipSize, setClip, useClip } from '../lib/tableClipboard';
import { offerTipAfterUses, offerTipSoon, tipLearned } from '../lib/tips';
import { tourEvent } from '../lib/tour';
import { cardRadius, cardRatio, cardSizeMm, copiesOf, deckSize, PRESET_SIZES_MM } from '../lib/types';
import type { Deck } from '../lib/types';
import { colors } from '../theme';
import { ActionSheet } from './ActionSheet';
import type { SheetAction, SheetTile } from './ActionSheet';
import { CardFocus } from './CardFocus';
import type { FocusRow } from './CardFocus';
import { AddCardsModal } from './AddCardsModal';
import { TrashModal } from './TrashModal';
import { DealPanel } from './DealPanel';
import { Riffle } from './Riffle';
import { StackSearchPanel } from './StackSearchPanel';
import { TablePieceView } from './TablePieceView';
import { ScaleControl } from './ScaleControl';
import { RotationControl } from './RotationControl';
import { CountStepper } from './CountStepper';
import { CardView, HALF_FLIP_MS, prefersReducedMotion } from './CardView';
import { CardZoom } from './CardZoom';
import type { TableControls } from './TableTopBar';
import { WoodRail } from './Tabletop';
import { TABLE_THEMES, THEME_KEYS, themeOf } from '../lib/tableThemes';
import { importImage, isSeeThrough, loadSettings, saveSettings } from '../lib/storage';
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
/** A lasso traced back over rubs out: how near its line the finger must come back (points), and how far back along it. */
const LASSO_RETRACE_REACH = 18;
const LASSO_RETRACE_LENGTH = 220;
/** A touch on empty table lifted within this long (and without moving) is a tap. */
const TAP_MS = 300;
/** How far round a stack's count badge (in screen points) a touch takes the whole stack. */
/** How long a press on a stack must be held, still, for the whole stack to come up (a quick drag takes its top card). */
const HOLD_STACK_MS = 350;
/** Holding a counter or die still this long opens its options. */
const HOLD_PIECE_MS = 450;
/** Holding empty table still this long opens what can be added there. */
const HOLD_ADD_MS = 500;
/** How far from a small piece's middle (screen points) a finger still catches it: half a comfortable fingertip target. */
const FINGER_REACH = 22;
/** Where tokens' pictures are kept (as a deck's are, in a folder of their own). */
const TOKEN_PICTURES = 'tokens';
/** How near a zone's bottom-right corner (screen points) a finger grabs its grip, to resize it. */
const ZONE_GRIP_REACH = 28;
/** The most dice added at once (from the Add a die menu): enough for big dice games, few enough to roll smoothly. */
const DICE_AT_ONCE = 20;
/** Stands in for the finger carrying cards taken out of the search, till the table's gesture says which it is. */
const TAKE_OUT_FINGER = -7;
/** How long a stack brought onto the table takes to fly in (and the camera to glide over to it). */
const ARRIVE_MS = 480;
/**
 * Opening a stack's or piece's options: how long the camera takes to glide in on it, how much of the room above
 * the options it then fills, and the closest it comes (a die isn't blown up to fill the screen).
 */
const SPOT_MS = 280;
/**
 * On iPad: options float beside what's held, in a small panel (no darkening, the camera left be); and a second
 * finger's tap on empty table turns over what's carried (no reaching for the flip button on a big screen).
 */
const IS_PAD = Platform.OS === 'ios' && Platform.isPad;
const SPOT_FILL = 0.7;
const SPOT_MAX_ZOOM = 2.5;
/** Hand cards sliding to new places (one gone, one coming in, the gap moving). */
const HAND_SLIDE = LinearTransition.duration(200);
/** A finger moving less than this before lifting is a tap. */
const TAP_SLOP = 8;
/** An extra finger down and up within this long (and not moving) is a tap, picking up another card. */
const EXTRA_TAP_MS = 350;
/** Roughly the hand tray's height, for placing the camera at the start (the tray sizes itself to its cards). */
const HAND_H = 160;
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
/** The tools drawer on the left edge: the panel's width, and the tab it's pulled out by. */
const TOOLS_W = 230;
const TOOLS_TAB_W = 26;
const TOOLS_TAB_H = 72;
/** How far down the drawer its pull tab sits: near the top, where it's always been (the drawer's grown taller). */
const TOOLS_TAB_TOP = 42;
/** How long the grid shows when its size is chosen (with its lines off). */
const GRID_PEEK_MS = 1500;
/** And how long it takes to fade away after that. */
const GRID_FADE_MS = 1000;
/** Where the tools tab is: which edge, and how far down (0 just below the top bar, 1 just above the hand's tabs). */
type ToolsSpot = { side: 'left' | 'right'; at: number };
/** Where it starts: on the left, near the top. */
const DEFAULT_TOOLS_SPOT: ToolsSpot = { side: 'left', at: 0.08 };
/** A pinch inward this quick, to this share of its fingers' first distance apart or less, fits all cards in view. */
/** Two fingers tapping the table: how quickly they're lifted, and how soon a second tap must come (to fit everything in view). */
const TWO_TAP_MS = 260;
/** How soon after the first a second finger comes down to count as two fingers together (not a second, later one). */
const TWO_TOUCH_MS = 150;
const TWO_TAP_GAP_MS = 420;
/** How far sideways the tools tab must be dragged to come away from its edge, and how much it gives before then. */
const TOOLS_DETACH = 70;
const TOOLS_EDGE_GIVE = 0.15;
/** A card's size on the table when its deck is gone (as a standard card). */
const STANDARD_SIZE = { w: PRESET_SIZES_MM.standard.w * UNITS_PER_MM, h: PRESET_SIZES_MM.standard.h * UNITS_PER_MM };
/** The tools drawer's spring; how long it takes to slide shut, and how hard it bounces back off the edge then. */
const TOOLS_SPRING = { damping: 18, stiffness: 180, mass: 0.9 };
const TOOLS_CLOSE_MS = 220;
const TOOLS_REBOUND = 450;
/** How far the tray and the tools panel carry on past their outer edge, so their springy bounce shows no gap. */
const SPRING_OVERSHOOT = 60;
/** Cards moved about the table before the lasso's tip is offered. */
const LASSO_TIP_AFTER = 5;
/** The tools panel's rounded corners (squared off where the tab meets one). */
const TOOLS_PANEL_RADIUS = 14;
/** The tools tab, let go this near the top or bottom of its edge, goes right up against it. */
const TOOLS_END_SNAP = TOOLS_PANEL_RADIUS + 16;
/** How long the tools tab is held before it lifts to be moved. */
const TOOLS_HOLD_MS = 200;
/** Moving further than this before the hold is up is a slip: neither a tap nor a drag. */
const TOOLS_DRAG_SLOP = 8;

const FLIP_ICON = { ios: 'arrow.trianglehead.2.clockwise.rotate.90', android: 'flip', web: 'flip' } as const;

/** What a menu is open on. */
type Menu =
  | { kind: 'stack'; id: string }
  | { kind: 'hand'; hand: number; iid: string }
  | { kind: 'table' }
  | { kind: 'addDeck' }
  | { kind: 'color' }
  | { kind: 'selection' }
  | { kind: 'piece'; id: string }
  | { kind: 'components' }
  | { kind: 'addDie' }
  /** For one counter or die, or (with no id) every one picked out. */
  | { kind: 'dieKind'; id?: string }
  /** For one counter or die, or (with no id) every one picked out; marker for a track's marker. */
  | { kind: 'pieceColor'; id?: string; marker?: boolean }
  | { kind: 'pieceShape'; id?: string }
  | { kind: 'addShape' }
  /** Adding cards: whole decks, or cards chosen one by one. */
  | { kind: 'addCards' }
  /** Where a token's picture comes from: for a new token, or (with an id) to change one's. */
  /** Scaling stacks and pieces (changing as the slider moves). */
  | { kind: 'scale'; stacks: string[]; pieces: string[] }
  /** Turning custom art (changing as the slider moves). */
  | { kind: 'rotate'; pieces: string[] };

/** Counters and dice being dragged: the one under the finger, all of them, and how far they've gone (table units). */
interface PieceDrag {
  lead: string;
  ids: string[];
  dx: number;
  dy: number;
  /** A piece just taken out of a bag (it isn't on the table till it's put down): which bag, and it, where it set off. */
  out?: { bagId: string; piece: TablePiece };
  /** Custom art twisted with a second finger as it's dragged: its turn now (degrees clockwise). */
  turn?: number;
}

/** Where a token's (or custom art's) picture comes from. */
type PictureSource = 'photos' | 'files' | 'camera';
/** What a picture's for: a token, or custom art (a new one, or with an id, that one's picture changed). */
type PictureTarget = { kind: 'token' | 'art'; id?: string };

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
  /**
   * How far counters and dice picked out with dragged cards have gone with them (they don't turn). Pieces are moved
   * by where they're drawn (never by a moving style on their views: one could be left on a view used again for
   * another piece, which was then drawn away from where it lay, and couldn't be picked up where it was seen).
   */
  const [groupShift, setGroupShift] = useState<{ dx: number; dy: number } | null>(null);
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
  /** The search is drawn while open, and while it slides away. */
  const [searchMounted, setSearchMounted] = useState(false);
  if (searching && !searchMounted) setSearchMounted(true);
  /** Cards have been taken out of the search and are being carried over the table: it fades, but stays till they land. */
  const [searchLeaving, setSearchLeaving] = useState(false);
  /** The cards being taken out of the search (top first), till the carrying finger is picked up by the table. */
  const [searchTake] = useState(() => {
    const box = { iids: [] as string[] };
    return { get: () => box.iids, set: (iids: string[]) => Object.assign(box, { iids }) };
  });
  /** Closes the search (it slides away). */
  const endSearch = () => {
    setSearching(null);
    setSearchLeaving(false);
  };
  /** Choosing cards from a deck to bring onto the table. */
  const [addingCards, setAddingCards] = useState(false);
  /** The grid shown for a moment (its size just chosen), even with its lines off. */
  const [gridPeek, setGridPeek] = useState(0);
  /** The peeked grid's lines fading away. */
  const gridFade = useSharedValue(1);
  const [latestPeek] = useState(() => {
    const box = { id: 0 };
    return { get: () => box.id, set: (id: number) => Object.assign(box, { id }) };
  });
  const gridFadeStyle = useAnimatedStyle(() => ({ opacity: gridFade.value }));
  /** The table's trash is open, to put cards back. */
  const [trashOpen, setTrashOpen] = useState(false);
  /** A stack just brought onto the table, flying in to where the camera's taking it on screen. */
  const [arriving, setArriving] = useState<{ stackId: string; key: string; to: { x: number; y: number }; scale: number; angle: number } | null>(null);
  /** A stack being riffle shuffled (as in a deck's play screen): which, a fresh key each time, and whether it's started. */
  const [riffling, setRiffling] = useState<{ stackIds: string[]; key: number; started: boolean } | null>(null);
  const [zoomed, setZoomed] = useState<SandboxCard | null>(null);
  const [view, setView] = useState<{ w: number; h: number } | null>(null);

  // Cards of decks since deleted (or cards since removed from them) quietly leave the table.
  const table = useMemo(() => (stored ? prune(stored, decks) : undefined), [stored, decks]);

  const decksById = useMemo(() => new Map(decks.map((d) => [d.id, d])), [decks]);
  const cardOf = (c: SandboxCard) => decksById.get(c.deckId)?.cards.find((k) => k.id === c.cardId);
  /** A card's size on the table: its deck's real size (a mini card is smaller; a landscape one, a portrait turned). */
  // Worked out once per deck, and the same object each time: a new one every redraw would make every stack on the
  // table redraw too (they're memoized, and it's one of their props), every time a finger moves.
  const sizes = useMemo(
    () =>
      new Map(
        decks.map((d) => {
          const mm = cardSizeMm(d);
          return [d.id, { w: mm.w * UNITS_PER_MM, h: mm.h * UNITS_PER_MM }];
        }),
      ),
    [decks],
  );
  const size: CardSize = (deckId) => sizes.get(deckId) ?? STANDARD_SIZE;

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
    // Never looked at before (a new table, or Solitaire the first time): everything fitted in view, once laid out.
    if (!table.camera) setFitFirst(true);
  };
  const [fitFirst, setFitFirst] = useState(false);

  // ---- Changes ----
  /** A change to the table, which can be undone. */
  const commit = (changed: SandboxTable) => {
    if (!table || changed === table) return;
    // A card put onto a stack of another size takes the stack's size.
    const next = keepArtLevels(table, matchStackSizes(changed, size));
    setHistory((h) => [...h.slice(-(UNDO_STEPS - 1)), table]);
    setFuture([]);
    updateSandbox(next);
  };
  // ---- Scaling: the chosen things change size as the slider moves, and it's all one undo once it's put away ----
  /** The table as it was when scaling began. */
  const [scaleBase, setScaleBase] = useState<SandboxTable | null>(null);
  const openScale = (stacks: string[], pieces: string[]) => {
    if (!table) return;
    setScaleBase(table);
    // Once the menu it's chosen from has gone.
    setTimeout(() => setMenu({ kind: 'scale', stacks, pieces }), 300);
  };
  /** Custom art turned as the rotation slider moves (locked art stays as it is): one undo, as scaling is. */
  const openRotate = (pieces: string[]) => {
    if (!table) return;
    setScaleBase(table);
    setTimeout(() => setMenu({ kind: 'rotate', pieces }), 300);
  };
  const previewRotate = (deg: number) => {
    if (!scaleBase || menu?.kind !== 'rotate') return;
    const ids = menu.pieces;
    updateSandbox({ ...scaleBase, pieces: (scaleBase.pieces ?? []).map((p) => (ids.includes(p.id) && p.kind === 'art' && !p.locked ? { ...p, angle: deg } : p)) });
  };
  const previewScale = (k: number) => {
    if (!scaleBase || menu?.kind !== 'scale') return;
    updateSandbox(scaleItems(scaleBase, menu.stacks, menu.pieces, k, size));
  };
  const finishScale = () => {
    if (!scaleBase) return;
    if (table && table !== scaleBase) {
      setHistory((h) => [...h.slice(-(UNDO_STEPS - 1)), scaleBase]);
      setFuture([]);
    }
    setScaleBase(null);
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
  /** The grid's spacing (its size, chosen in the tools). */
  const gridStep = table ? gridStepOf(table) : GRID_STEP;
  // The tools drawer, on the left or right edge: pulled out to show the tools, tucked away again to hide them. Its
  // tab can be dragged up and down the edge, or across to the other one (the player's choice, kept for every table).
  const [toolsOpen, setToolsOpen] = useState(false);
  const [toolsSpot, setToolsSpot] = useState<ToolsSpot>(() => loadSettings().toolsSpot ?? DEFAULT_TOOLS_SPOT);
  const toolsClosedX = toolsSpot.side === 'left' ? -TOOLS_W : TOOLS_W;
  const toolsX = useSharedValue(toolsClosedX);
  /** The tab's being dragged: just the tab shows, not the (tucked away) panel it pulls out. */
  const [toolsDragging, setToolsDragging] = useState(false);
  /** The tab being dragged: how far, so far (the drawer follows it until it's let go). */
  const toolsDragX = useSharedValue(0);
  const toolsDragY = useSharedValue(0);
  const toolsStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: toolsX.value + toolsDragX.value }, { translateY: toolsDragY.value }],
  }));
  const showTools = (open: boolean) => {
    setToolsOpen(open);
    // Opening springs out past its place and back. Closing can't (it would push the tab past the screen's edge, cut
    // off): it slides shut, then bounces back out off the edge a little, like a drawer, and settles.
    toolsX.set(
      open
        ? withSpring(0, TOOLS_SPRING)
        : withSequence(
            withTiming(toolsClosedX, { duration: TOOLS_CLOSE_MS, easing: ReEasing.in(ReEasing.quad) }),
            withSpring(toolsClosedX, { ...TOOLS_SPRING, velocity: toolsSpot.side === 'left' ? TOOLS_REBOUND : -TOOLS_REBOUND }),
          ),
    );
    haptics.tick();
    // After opening it a few times: the tab can be moved.
    if (open) offerTipAfterUses('tables-tools-drag');
  };
  // Put down somewhere new: the drawer's laid out there now, so the drag's offset goes (and it's tucked on that side),
  // before the screen's drawn, so it doesn't jump.
  useLayoutEffect(() => {
    toolsDragX.set(0);
    toolsDragY.set(0);
    toolsX.set(toolsSpot.side === 'left' ? -TOOLS_W : TOOLS_W);
  }, [toolsSpot, toolsDragX, toolsDragY, toolsX]);

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
  // The hands hidden (from the table's menu): no tray at all, and the table down to the bottom of the screen (just
  // clear of the home bar, where the hand's tabs would stand). Nothing goes into a hand, then.
  const trayGone = !!table?.hideHands;
  const trayOpenTop = trayGone ? area.h - insets.bottom + HAND_TAB_H : area.h - trayH;
  const handTop = trayGone ? trayOpenTop : folded ? area.h - FOLDED_SHOWS : trayOpenTop;
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
    if (fold) tipLearned('tables-fold-hand');
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
  // The tools drawer's place: its tab anywhere from just below the top bar to just above the hand's tabs (as a share
  // of that, so it fits any screen), and the panel beside it, the whole of that height (its tools scroll if they don't fit).
  const toolsMinY = insets.top + TOP_BAR_H + 8;
  const toolsMaxY = Math.max(toolsMinY, trayOpenTop - HAND_TAB_H - TOOLS_TAB_H - 8);
  const tabY = toolsMinY + toolsSpot.at * (toolsMaxY - toolsMinY);
  const toolsH = toolsMaxY + TOOLS_TAB_H - toolsMinY;
  const toolsTop = Math.min(Math.max(tabY - TOOLS_TAB_TOP, toolsMinY), toolsMaxY + TOOLS_TAB_H - toolsH);
  /** Where the tab sits in the drawer. */
  const tabInDrawer = tabY - toolsTop;
  // With the tab up against the panel's top or bottom, that corner of the panel goes square, so the tab joins it
  // cleanly (like a folder's tab) instead of leaving a notch where the panel's corner curves away.
  const left = toolsSpot.side === 'left';
  const panelCorners = {
    ...(tabInDrawer < TOOLS_PANEL_RADIUS && { [left ? 'borderTopRightRadius' : 'borderTopLeftRadius']: 0 }),
    ...(tabInDrawer + TOOLS_TAB_H > toolsH - TOOLS_PANEL_RADIUS && { [left ? 'borderBottomRightRadius' : 'borderBottomLeftRadius']: 0 }),
  };
  // The tab: a tap opens or closes the drawer; a drag (while it's closed) carries it up or down, or to the other edge.
  const toolsDrag = useMemo(() => {
    const box = {
      dragging: false,
      /** Moved before the hold was up: not a tap, and not a drag. */
      slipped: false,
      timer: null as ReturnType<typeof setTimeout> | null,
      /** Pulled away from its edge (dragged far enough sideways): it follows the finger across, and may change sides. */
      loose: false,
      side: 'left' as ToolsSpot['side'],
      open: false,
      tabY: 0,
      min: 0,
      max: 0,
      width: 0,
      set: (_s: ToolsSpot) => {},
      toggle: () => {},
      showDragging: (_on: boolean) => {},
    };
    const responder = PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      // A tap opens or closes it. Held a moment (closed, without moving), it lifts, with a buzz and a gold outline,
      // and can then be dragged; moved before then, it's neither (a slip of the finger).
      onPanResponderGrant: () => {
        box.dragging = false;
        box.loose = false;
        box.slipped = false;
        if (box.timer) clearTimeout(box.timer);
        box.timer = setTimeout(() => {
          box.timer = null;
          if (box.open || box.slipped) return;
          box.dragging = true;
          box.showDragging(true);
          haptics.lift();
        }, TOOLS_HOLD_MS);
      },
      onPanResponderMove: (_, g) => {
        if (!box.dragging) {
          if (Math.hypot(g.dx, g.dy) > TOOLS_DRAG_SLOP) box.slipped = true;
          return;
        }
        // Held to its edge, giving a little, until the finger's gone a way sideways: then it comes away and follows.
        if (!box.loose && Math.abs(g.dx) > TOOLS_DETACH) {
          box.loose = true;
          haptics.tick();
        }
        toolsDragX.set(box.loose ? g.dx : g.dx * TOOLS_EDGE_GIVE);
        toolsDragY.set(Math.min(Math.max(box.tabY + g.dy, box.min), box.max) - box.tabY);
      },
      onPanResponderRelease: (_, g) => {
        if (box.timer) clearTimeout(box.timer);
        box.timer = null;
        if (!box.dragging) {
          if (!box.slipped) box.toggle();
          return;
        }
        box.showDragging(false);
        // Let go near the top or bottom: right up against it, never just short (where the panel's corner, squared
        // off for the tab, would be left with a point beside it).
        const dropped = Math.min(Math.max(box.tabY + g.dy, box.min), box.max);
        const y = dropped - box.min < TOOLS_END_SNAP ? box.min : box.max - dropped < TOOLS_END_SNAP ? box.max : dropped;
        const side = box.loose ? (g.moveX < box.width / 2 ? 'left' : 'right') : box.side;
        box.set({ side, at: box.max > box.min ? (y - box.min) / (box.max - box.min) : 0 });
        haptics.drop();
        tipLearned('tables-tools-drag');
      },
      onPanResponderTerminate: () => {
        if (box.timer) clearTimeout(box.timer);
        box.timer = null;
        box.dragging = false;
        box.showDragging(false);
        toolsDragX.set(withSpring(0));
        toolsDragY.set(withSpring(0));
      },
    });
    return { box, responder };
  }, [toolsDragX, toolsDragY]);
  Object.assign(toolsDrag.box, {
    open: toolsOpen,
    side: toolsSpot.side,
    tabY,
    min: toolsMinY,
    max: toolsMaxY,
    width: area.w || screenW,
    set: (spot: ToolsSpot) => {
      setToolsSpot(spot);
      saveSettings({ ...loadSettings(), toolsSpot: spot });
    },
    toggle: () => showTools(!toolsOpen),
    showDragging: setToolsDragging,
  });
  /** The flip button, in the bottom-left corner above the tray, while cards are carried. */
  const flipButton = { x: FLIP_MARGIN, y: handTop - HAND_TAB_H - FLIP_MARGIN - FLIP_SIZE, size: FLIP_SIZE };
  /** A double tap: the card (or the whole stack) turned over where it lies. */
  const flipFromTap = (src: Source) => {
    if (!table || src.kind === 'bag') return;
    if (src.kind === 'hand') commit(flipInHand(table, src.hand, src.iid));
    // Turned over to face the way the stack it lies on does, it joins it.
    else commit(settleOnto(flipStack(table, src.stackId), src.stackId));
    haptics.tick();
    tourEvent('tables-flipped');
    tipLearned('tables-double-tap');
  };

  // ---- Pieces: counters and dice ----
  /** A piece being dragged: where it's drawn for now (it's put down where it's let go). */
  const [pieceDrag, setPieceDrag] = useState<PieceDrag | null>(null);
  /** Each die's latest roll here: how many so far (so it tumbles each time), and where it set off from. */
  const [rolls, setRolls] = useState<Record<string, { key: number; dx: number; dy: number }>>({});
  /** Counters and dice picked out with the lasso; the dice among them roll together (tap any, or the roll button). */
  const [pickedPieceIds, setPickedPieces] = useState<string[]>([]);
  const pickedPieces = pickedPieceIds.filter((id) => table?.pieces?.some((p) => p.id === id));
  const pickedDice = pickedPieces.filter((id) => table?.pieces?.some((p) => p.id === id && p.kind === 'die'));
  /** The picked-out dice, coins and spinners: the roll button rolls, flips and spins them all (a tap on one, those of its kind). */
  const pickedRollables = pickedPieces.filter((id) => table?.pieces?.some((p) => p.id === id && rollable(p)));
  /**
   * Several of one kind picked out, and nothing else (no cards, nor pieces of another kind): the kind the corner
   * button rolls (dice), flips (coins) or spins (spinners), all together. Otherwise none shows.
   */
  const rollKind = (() => {
    if (pickedPieces.length < 2 || selected.some((id) => table?.stacks.some((s) => s.id === id))) return null;
    const kinds = new Set(pickedPieces.map((id) => table?.pieces?.find((p) => p.id === id)?.kind));
    const [kind] = [...kinds];
    return kinds.size === 1 && (kind === 'die' || kind === 'coin' || kind === 'spinner') ? kind : null;
  })();
  /**
   * Rolls dice (one undo for them all): each lands on a new face a little way off, in a random direction, and
   * tumbles across to there.
   */
  const rollDice = (ids: string[]) => {
    if (!table) return;
    const { table: next, from } = throwDice(table, ids);
    if (!Object.keys(from).length) return;
    commit(next);
    setRolls((r) => Object.fromEntries([...Object.entries(r), ...Object.entries(from).map(([id, f]) => [id, { key: (r[id]?.key ?? 0) + 1, ...f }])]));
    // Felt as it's thrown, and as it bounces.
    haptics.deal();
    setTimeout(haptics.tick, 280);
    setTimeout(haptics.tick, 500);
  };
  /** Letting the selection go lets the picked-out dice go too. */
  const selectStacks = (ids: string[]) => {
    setSelected(ids);
    if (!ids.length) setPickedPieces([]);
  };
  /**
   * A tap on a piece: a die rolls, a coin flips, a spinner spins (all the picked-out ones, if it's one of them); a
   * text label's words can be changed; a counter's − or + counts down or up (its number: its options).
   */
  const tapPiece = (id: string, part: PiecePart, at?: { x: number; y: number }) => {
    const piece = table?.pieces?.find((p) => p.id === id);
    if (!table || !piece) return;
    if (rollable(piece)) {
      // One of several picked out: those of the same kind go with it (all the dice, or all the coins), not the rest.
      const kin = pickedRollables.filter((pid) => table.pieces?.find((p) => p.id === pid)?.kind === piece.kind);
      rollDice(pickedRollables.includes(id) ? kin : [id]);
      return;
    }
    if (piece.kind === 'text') {
      rename('Text', piece.label ?? '', (label) => commit(setPiece(table, id, { label })));
      return;
    }
    if (piece.kind === 'bag') {
      // As a stack: a tap picks it out; a tap on it picked out opens its own options (and lets any others go).
      if (pickedPieces.includes(id)) {
        if (pickedPieces.length + chosen.length > 1) selectStacks([]);
        setMenu({ kind: 'piece', id });
        return;
      }
      setSelected([]);
      setPickedPieces([id]);
      haptics.tick();
      return;
    }
    if (piece.kind === 'track') {
      // Its marker to the space tapped.
      const space = at ? trackSpaceAt(piece, at.x, at.y) : piece.value;
      if (space !== piece.value) {
        commit(setPiece(table, id, { value: space }));
        haptics.tick();
      }
      return;
    }
    if (piece.kind === 'timer') {
      // Starting and pausing it isn't undone (the time goes on regardless).
      updateSandbox(toggleTimer(table, id));
      haptics.tick();
      return;
    }
    if (piece.kind !== 'counter') {
      haptics.tick();
      return;
    }
    if (part === 'body') {
      setMenu({ kind: 'piece', id });
      return;
    }
    commit(setPiece(table, id, { value: piece.value + (part === 'plus' ? 1 : -1) }));
    haptics.tick();
  };
  /**
   * Dragged pieces let go: they stay there, on top of the others (the one dragged on the grid, if snapping's on, and
   * the rest as far as it went). Dice that land on others are moved off them.
   */
  const dropPieces = (drag: PieceDrag) => {
    setPieceDrag(null);
    if (!table) return;
    // A piece just taken out of a bag: put on the table (or dropped on a bag; back on its own, it's left there).
    if (drag.out) {
      const { bagId, piece } = drag.out;
      const to = { x: piece.x + drag.dx, y: piece.y + drag.dy };
      const source = table.pieces?.find((p) => p.id === bagId);
      if (!source) return;
      const taken = source.supply ? table : removeBagItems(table, bagId, [piece.id]);
      const onto = bagAt(table, to.x, to.y);
      if (onto?.id === bagId) return;
      if (onto) return dropIntoBag(onto.id, [{ piece }], taken);
      commit(placeItem(taken, { piece }, gridOn ? snapToGrid({ ...to, angle: 0 }, gridStep) : to, newId()));
      return haptics.drop();
    }
    const lead = table.pieces?.find((p) => p.id === drag.lead);
    if (!lead) return;
    const to = { x: lead.x + drag.dx, y: lead.y + drag.dy };
    // Dropped on a bag (not one of those being dragged): into it.
    const bag = bagAt(table, to.x, to.y, drag.ids);
    if (bag) {
      const pieces = (table.pieces ?? []).filter((p) => drag.ids.includes(p.id));
      return dropIntoBag(bag.id, pieces.map((piece) => ({ piece })), { ...table, pieces: (table.pieces ?? []).filter((p) => !drag.ids.includes(p.id)) });
    }
    const snapped = gridOn ? snapToGrid({ ...to, angle: 0 }, gridStep) : to;
    // Custom art moved comes over every card, as a stack moved does (turned as it was twisted).
    const moved = raiseArt(movePieces(table, drag.ids, { x: snapped.x - lead.x, y: snapped.y - lead.y }), drag.ids);
    commit(drag.turn !== undefined ? setPiece(moved, lead.id, { angle: normalizeAngle(drag.turn) }) : moved);
    haptics.drop();
  };
  /**
   * Things dropped on a bag (`without`: the table with them already taken from where they were). An empty bag
   * given one thing, or several of the very same, asks: an endless supply of it, or just these? A supply takes
   * back only what it supplies; anything else stays where it was.
   */
  const dropIntoBag = (bagId: string, items: BagItem[], without: SandboxTable) => {
    const bag = without.pieces?.find((p) => p.id === bagId);
    if (!bag || !items.length) return;
    // A bag that's part of Pro, with Pro off: what's dropped stays where it was.
    if (lockedOut(bagId)) {
      haptics.warn();
      return openPro();
    }
    if (!bagTakes(bag, items)) return haptics.warn();
    const put = (asSupply: boolean) => {
      commit(putInBag(without, bagId, items, asSupply));
      haptics.drop();
    };
    // Back into a supply: they just go.
    if (bag.supply) return put(false);
    if (!bagItems(bag).length && allAlike(items)) {
      const n = items.length;
      Alert.alert(n === 1 ? 'Into the bag' : `${n} into the bag`, 'Make the bag an endless supply of it, or put in just what’s here?', [
        { text: 'Cancel', style: 'cancel' },
        { text: n === 1 ? 'Just this one' : `Just these ${n}`, onPress: () => put(false) },
        { text: 'Endless supply', onPress: () => put(true) },
      ]);
      return;
    }
    put(false);
  };
  /**
   * A picture from Photos, Files or the camera, for a token (made into a token's: see tokenPicture) or custom art
   * (kept at its own shape: see artPicture), saved: on a new one, or (given an id) on that one instead. Nothing if
   * none's chosen.
   */
  const pictureFor = async (source: PictureSource, target: PictureTarget) => {
    // One picker at a time (a second tap while one's opening would otherwise open another, or neither).
    if (pickingPicture.busy) return;
    Object.assign(pickingPicture, { busy: true });
    try {
      await pictureFrom(source, target);
    } finally {
      Object.assign(pickingPicture, { busy: false });
    }
  };
  // Kept in a box (not a ref), as the gesture's state is: read only when a picture's chosen.
  const [pickingPicture] = useState(() => ({ busy: false }));
  /**
   * Where a picture comes from, asked with the system's own menu: it reports the choice only once it's fully gone,
   * so the picker that follows always opens (one of our sheets still sliding away could stop it).
   */
  const choosePicture = (target: PictureTarget) => {
    // New custom art (or a token) is part of Pro.
    if (!target.id && !pro) return openPro();
    const sources: PictureSource[] = ['photos', 'files', 'camera'];
    const title = target.id ? 'Change the picture' : target.kind === 'art' ? 'Custom art' : 'Token picture';
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions({ title, options: ['Photos', 'Files', 'Take a photo', 'Cancel'], cancelButtonIndex: 3 }, (i) => {
        if (i < 3) void pictureFor(sources[i], target);
      });
      return;
    }
    Alert.alert(title, undefined, [
      { text: 'Photos', onPress: () => void pictureFor('photos', target) },
      { text: 'Files', onPress: () => void pictureFor('files', target) },
      { text: 'Take a photo', onPress: () => void pictureFor('camera', target) },
    ]);
  };
  const pictureFrom = async (source: PictureSource, target: PictureTarget) => {
    const forToken = target.kind === 'token';
    let uri: string | undefined;
    if (source === 'files') {
      const doc = await DocumentPicker.getDocumentAsync({ type: 'image/*', copyToCacheDirectory: true });
      uri = doc.canceled ? undefined : doc.assets[0]?.uri;
    } else if (source === 'camera') {
      const allowed = await ImagePicker.requestCameraPermissionsAsync();
      if (!allowed.granted) {
        Alert.alert('Camera not allowed', 'Shufflevale can use the camera once it’s allowed in Settings → Shufflevale.');
        return;
      }
      // A token's framed square as it's taken; art is the whole photo.
      const shot = await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], allowsEditing: forToken, aspect: [1, 1], quality: 1 });
      uri = shot.canceled ? undefined : shot.assets[0]?.uri;
    } else {
      // Not edited here, so a cut-out (a subject saved from Photos) keeps its see-through background; and taken as
      // it's stored, not converted first (which can keep the picker waiting a while).
      const picked = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
      });
      uri = picked.canceled ? undefined : picked.assets[0]?.uri;
    }
    if (!uri) return;
    try {
      // The table as it is now (the picker took a while).
      const now = latest.get();
      if (!now.table) return;
      if (forToken) {
        const image = importImage(TOKEN_PICTURES, await tokenPicture(uri));
        if (target.id) now.commit(setPiece(now.table, target.id, { image }));
        else now.addPieceToTable('token', undefined, undefined, { image });
        return;
      }
      const art = await artPicture(uri);
      const fresh = latest.get();
      if (!fresh.table) return;
      const image = importImage(TOKEN_PICTURES, art.uri);
      const size = artSize(art.width, art.height);
      if (target.id) fresh.commit(setPiece(fresh.table, target.id, { image, ...size }));
      else fresh.addPieceToTable('art', undefined, undefined, { image, ...size });
    } catch (e) {
      Alert.alert('Couldn’t use that picture', e instanceof Error ? e.message : String(e));
    }
  };  /** A zone being resized by its grip: its own size for now (see resizeZone). */
  const [zoneSize, setZoneSize] = useState<{ id: string; w: number; h: number } | null>(null);
  const dropZoneSize = () => {
    const zone = table?.pieces?.find((p) => p.id === zoneSize?.id);
    setZoneSize(null);
    if (!table || !zone || !zoneSize) return;
    commit(setPiece(table, zone.id, resizeZone(zone, zoneSize.w, zoneSize.h)));
    haptics.drop();
  };
  /** How much custom art the table has, against ART_MAX (each is a picture to draw, so there's a limit). */
  const artCount = (table?.pieces ?? []).filter((p) => p.kind === 'art').length + (table?.pieces ?? []).reduce((n, p) => n + bagItems(p).filter((i) => i.piece?.kind === 'art').length, 0);
  const artFull = () =>
    Alert.alert('That’s all the custom art a table holds', `A table can have up to ${ART_MAX} pieces of custom art, so it stays quick to move about. Take some off to add more.`);
  /** The picked-out dice lined up in a tight grid (the button by the roll one). */
  const gridPickedDice = () => {
    if (!table || pickedDice.length < 2) return;
    commit(gridDice(table, pickedDice));
    haptics.drop();
  };
  // ---- Pro: every component but dice is part of it. The Playground's are there to try, but nothing more comes
  // onto it (no cards, no more components, nothing pasted) and nothing of it goes elsewhere (copies need Pro). ----
  const pro = usePro();
  const playgroundHere = !!table && isPlayground(table.id);
  /** A Pro component that can't be used here: Pro is off (refunded, say) and this isn't the Playground. Left as it lies. */
  const lockedOut = (id: string) => {
    const p = table?.pieces?.find((x) => x.id === id);
    return !!p && !pro && !playgroundHere && isProPiece(p);
  };
  const openPro = () => router.push({ pathname: '/pro', params: { reason: 'components' } });
  // The Playground's cards, without Pro: only the Playing Cards example's, and only while it's as it was made (not
  // changed into a deck of someone's own). Any others are taken off as it opens, and it says why.
  const playgroundDeck = playgroundHere ? decksById.get(loadSettings().playingCardsDeckId ?? '') : undefined;
  const playgroundCardsOk = !playgroundDeck || deckLook(playgroundDeck) === loadSettings().playingCardsLook;
  useEffect(() => {
    if (pro || !playgroundHere || !table) return;
    const ok = (c: SandboxCard) => c.deckId === playgroundDeck?.id && playgroundCardsOk;
    const all = [...table.stacks.flatMap((s) => s.cards), ...table.hands.flat(), ...(table.trash ?? [])];
    if (all.every(ok)) return;
    // Not undoable: they were never meant to be here.
    updateSandbox(keepCards(table, ok));
    Alert.alert(
      'Some cards were taken off the Playground',
      playgroundCardsOk
        ? 'The Playground plays with its own Playing Cards. Your own decks, and every component, can be used together with Pro.'
        : 'The Playing Cards deck has been changed, so its cards don’t play here. Restore examples (in the home screen’s menu) brings it back as it was.',
    );
    // As it opens, and if Pro or the deck changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pro, playgroundHere, playgroundCardsOk, playgroundDeck?.id, table?.id]);
  /** Something brought onto the Playground without Pro: it's for trying what's there. */
  const playgroundOnly = () => {
    haptics.warn();
    Alert.alert('The Playground is for trying things out', 'Everything on it can be used here. Bringing more onto it, and using components on tables of your own, is part of Pro.', [
      { text: 'OK', style: 'cancel' },
      { text: 'See Pro', onPress: openPro },
    ]);
  };
  /** Where what's added goes: where the table was held to add it, if it was; or the middle of the view. */
  const [addAt, setAddAt] = useState<{ x: number; y: number } | null>(null);
  const middleOfView = () => (view ? toTable(readCamera(), view.w / 2, (insets.top + TOP_BAR_H + handTop - HAND_TAB_H) / 2) : { x: TABLE_W / 2, y: TABLE_H / 2 });
  const addSpot = () => addAt ?? middleOfView();
  const addPieceToTable = (kind: PieceKind, sides?: number, shape?: PieceShape, extra?: Partial<TablePiece>) => {
    if (!table || !view) return;
    // (The menus show these as Pro's: this is so nothing else can.)
    if (!pro && isProPiece({ kind })) return openPro();
    const mid = addSpot();
    // In the middle of the view, a little apart from the last few (so they don't hide each other); where held, right there.
    const nudge = addAt ? 0 : ((table.pieces?.length ?? 0) % 5) * 24;
    const id = newId();
    // A die isn't put down on another.
    commit(raiseArt(separateDice(addPiece(table, { ...newPiece(kind, id, { x: mid.x + nudge, y: mid.y + nudge }, sides, shape), ...extra }), [id]), [id]));
    haptics.drop();
  };
  /** How many dice the Add a die menu adds at once (kept for next time). */
  const [dieCount, setDieCount] = useState(1);
  /**
   * Dice added in the middle of what's in view: one as any piece is; several lined up in a tight grid, and picked
   * out, ready to roll together.
   */
  const addDice = (sides: number, count: number) => {
    if (count <= 1) return addPieceToTable('die', sides);
    if (!table || !view) return;
    const mid = addSpot();
    const ids = Array.from({ length: count }, () => newId());
    const added = ids.reduce((t, id, i) => addPiece(t, newPiece('die', id, { x: mid.x + i, y: mid.y }, sides)), table);
    commit(gridDice(added, ids));
    setSelected([]);
    setPickedPieces(ids);
    haptics.drop();
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
    setGroupShift(null);
    setGroupInHand(null);
    setFlyers([]);
    setPileFlights([]);
    const turn = gestureState.get().groupAngle;
    // Nothing left to move (e.g. trashed mid-drag), or not moved at all.
    if (!table || !chosen.length || (!by.x && !by.y && !turn)) return;
    // Dropped on a bag: all of it (cards and pieces picked out) into it.
    const grab = gestureState.get().groupFrom;
    const over = turn ? null : bagAt(table, grab.x + by.x, grab.y + by.y, pickedPieces);
    if (over) {
      const cardsIn = chosen.flatMap((id) => table.stacks.find((s) => s.id === id && !s.locked)?.cards ?? []);
      const piecesIn = (table.pieces ?? []).filter((p) => pickedPieces.includes(p.id) && p.id !== over.id);
      const lockedOut = new Set(table.stacks.filter((s) => s.locked).map((s) => s.id));
      return dropIntoBag(over.id, [...cardsIn.map((card) => ({ card })), ...piecesIn.map((piece) => ({ piece }))], {
        ...table,
        stacks: table.stacks.filter((s) => !chosen.includes(s.id) || lockedOut.has(s.id)),
        pieces: (table.pieces ?? []).filter((p) => !piecesIn.includes(p)),
      });
    }
    const place = gridOn ? (p: { x: number; y: number; angle: number }) => snapToGrid(p, gridStep) : undefined;
    const moved = turn ? rotateStacks(table, chosen, gestureState.get().groupFrom, turn, by, place) : moveStacks(table, chosen, by, place);
    // Counters and dice picked out with them come too (as far as the finger went).
    commit(pickedPieces.length && (by.x || by.y) ? movePieces(moved, pickedPieces, by) : moved);
    tourEvent('tables-moved');
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
    setGroupShift(null);
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
    tourEvent('tables-to-hand');
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
  // With cards picked out (and nothing carried), their buttons stand in a column up from the flip one: shuffle (when
  // a picked-out stack has cards to shuffle), gather (two or more picked out), then ••• (everything else).
  /** The button `n` places above the flip one. */
  const slot = (n: number) => ({ x: flipButton.x, y: flipButton.y - n * (FLIP_SIZE + 12), size: FLIP_SIZE });
  /** A picked-out stack has two or more cards: the shuffle button shows. */
  const canShuffle = chosen.some((id) => (table?.stacks.find((s) => s.id === id)?.cards.length ?? 0) > 1);
  const shuffleButton = slot(1);
  /** The gather button, as it stands while the cards are just picked out (while they're dragged, see `stackButton`). */
  const gatherButton = slot(canShuffle ? 2 : 1);
  const moreButton = slot(1 + (canShuffle ? 1 : 0) + (chosen.length > 1 ? 1 : 0));
  /** Which of the selection's buttons is at a point on screen, if any (while nothing's carried). */
  const selectionButtonAt = (x: number, y: number): 'flip' | 'shuffle' | 'gather' | 'more' | null => {
    const on = (b: { x: number; y: number; size: number }) => Math.hypot(x - (b.x + b.size / 2), y - (b.y + b.size / 2)) <= b.size / 2 + 8;
    // Not while the tools are out: they lie over the buttons, which wait, dimmed.
    if (!chosen.length || held || groupMoving || toolsOpen) return null;
    if (on(flipButton)) return 'flip';
    if (canShuffle && on(shuffleButton)) return 'shuffle';
    if (chosen.length > 1 && on(gatherButton)) return 'gather';
    if (on(moreButton)) return 'more';
    return null;
  };
  // While dice are picked out: the roll button, where the selection's column of buttons would start (or above the
  // cards' buttons, if cards are picked out too), and with two or more, one above it to line them up in a grid.
  const rollSlot = chosen.length ? 2 + (canShuffle ? 1 : 0) + (chosen.length > 1 ? 1 : 0) : 0;
  const rollButton = slot(rollSlot);
  const diceGridButton = slot(rollSlot + 1);
  const diceButtonsLive = !held && !groupMoving && !toolsOpen;
  const onButton = (b: { x: number; y: number }, x: number, y: number) => Math.hypot(x - (b.x + FLIP_SIZE / 2), y - (b.y + FLIP_SIZE / 2)) <= FLIP_SIZE / 2 + 8;
  const onRollButton = (x: number, y: number) => !!rollKind && diceButtonsLive && onButton(rollButton, x, y);
  const onDiceGridButton = (x: number, y: number) => rollKind === 'die' && diceButtonsLive && onButton(diceGridButton, x, y);
  /** Stacks shuffled where they lie (one undo), the riffle played on each. */
  const shuffleStacks = (ids: string[]) => {
    if (!table) return;
    const stacks = ids.filter((id) => (table.stacks.find((s) => s.id === id)?.cards.length ?? 0) > 1);
    if (!stacks.length) return;
    commit(stacks.reduce((t, id) => shuffleStack(t, id), table));
    setRiffling((r) => ({ stackIds: stacks, key: (r?.key ?? 0) + 1, started: false }));
  };
  /** The shuffle button: every picked-out stack shuffled. */
  const shuffleSelection = () => shuffleStacks(chosen);
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
  const handScaleOf = (c: SandboxCard) => handWidthOf(c) / cardSizeOf(c, size).w;
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
      gridStep: number;
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
      moreButton: { x: number; y: number; size: number };
      dropGroup: (by: { x: number; y: number }) => void;
      flipGroup: () => void;
      trashSelection: () => void;
      selectionButtonAt: (x: number, y: number) => 'flip' | 'shuffle' | 'gather' | 'more' | null;
      shuffleSelection: () => void;
      gatherGroup: (lead: string) => string | undefined;
      flipFromTap: (src: Source) => void;
      cameraLocked: boolean;
      toolsOpen: boolean;
      showTools: (open: boolean) => void;
      fitAll: () => void;
      setHandGap: (g: number | null) => void;
      handInsertAt: (x: number) => number;
      flipButton: { x: number; y: number; size: number };
      commit: (t: SandboxTable) => void;
      saveCamera: () => void;
      setHeld: (h: Held | null) => void;
      setTarget: (id: string | null) => void;
      setMenu: (m: Menu) => void;
      searchFrom: string | null;
      endSearch: () => void;
      tapPiece: (id: string, part: PiecePart, at?: { x: number; y: number }) => void;
      pickedDice: string[];
      pickedRollables: string[];
      pickedPieces: string[];
      setPickedPieces: (ids: string[]) => void;
      onRollButton: (x: number, y: number) => boolean;
      rollDice: (ids: string[]) => void;
      setPieceDrag: (d: PieceDrag | null) => void;
      setGroupShift: (d: { dx: number; dy: number } | null) => void;
      dropPieces: (d: PieceDrag) => void;
      onDiceGridButton: (x: number, y: number) => boolean;
      gridPickedDice: () => void;
      addPieceToTable: (kind: PieceKind, sides?: number, shape?: PieceShape, extra?: Partial<TablePiece>) => void;
      setZoneSize: (z: { id: string; w: number; h: number } | null) => void;
      openAddAt: (at: { x: number; y: number }) => void;
      dropIntoBag: (bagId: string, items: BagItem[], without: SandboxTable) => void;
      dropZoneSize: () => void;
      lockedOut: (id: string) => boolean;
      openPro: () => void;
    };
    return { set: (next: typeof box) => Object.assign(box, next), get: () => box };
  });
  latest.set({ table, size, handTop, hand, handIndex, handCardAt, handInsertAt, maxHandScroll, gridOn, gridStep, setGroupInHand, flyPile, groupToHand, groupHandScale, handScaleOf, selected: chosen, setSelected: selectStacks, setLassoPath, setGroupMoving, stackButton, moreButton, dropGroup, flipGroup, trashSelection, selectionButtonAt, shuffleSelection, gatherGroup, flipFromTap, cameraLocked: !!table?.lockCamera, toolsOpen, showTools, fitAll: () => table && fitView(table), setHandGap: changeGap, flipButton, commit, saveCamera, setHeld, setTarget, setMenu, searchFrom: searching, endSearch, setGroupShift, addPieceToTable, openAddAt: (at) => { setAddAt(at); setMenu({ kind: 'components' }); }, dropIntoBag, setZoneSize, dropZoneSize, tapPiece, setPieceDrag, dropPieces, onDiceGridButton, gridPickedDice, pickedDice, pickedRollables, pickedPieces, setPickedPieces, onRollButton, rollDice, lockedOut, openPro });

  // The gesture in progress (never drawn from, so kept outside React state).
  const [gestureState] = useState(() => {
    type Pt = { x: number; y: number };
    const s = {
      mode: 'none' as 'none' | 'camera' | 'press' | 'carry' | 'handPress' | 'lasso' | 'group' | 'button' | 'piece' | 'zoneResize',
      /** A zone being resized by its grip: where the finger landed (on the table), and its own size and scale then. */
      zone: null as null | { id: string; from: Pt; size: { w: number; h: number }; scale: number },
      /** The counter or die pressed: which part, where it lay and where the finger landed (on the table), and whether it's been dragged. */
      piece: null as null | {
        id: string;
        part: PiecePart;
        group: string[];
        from: Pt;
        moved: boolean;
        /** A bag held a moment: a drag moves the bag itself, not the top thing out of it. */
        whole?: boolean;
        /** A piece just taken out of a bag (see PieceDrag). */
        out?: { bagId: string; piece: TablePiece };
        /** Custom art being twisted by a second finger (which, the fingers' angle then, its turn then), and its turn now. */
        twist?: { id: number; from: number; base: number } | null;
        turn?: number;
      },
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
      lassoPieceBase: [] as string[],
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
      api: null as null | {
        down: (f: Finger[]) => void;
        move: (f: Finger[]) => void;
        up: (f: Finger[]) => void;
        cancel: () => void;
        startTakeOut: (at: { x: number; y: number }) => void;
      },
      /** Each finger's start and latest position, by id. */
      fingers: new Map<number, { start: Pt; now: Pt }>(),
      /** The finger that pressed (or carries). */
      first: -1,
      /** The camera as fingers last changed count, and where they were then. */
      camStart: { a: 1, b: 0, tx: 0, ty: 0 } as Camera,
      camFrom: [] as Pt[],
      /** Whether the camera last sat on a quarter turn (for a tick each time it snaps onto one). */
      camSquare: true,
      /** Two fingers came down on the table: when, and how far apart (a quick pinch inward fits all cards in view). */
      pinch: null as { at: number; dist: number } | null,
      /** When two fingers last tapped the table (a second soon after fits everything in view). */
      twoTapAt: 0,
      /** When the first finger of this touch came down (a second within TWO_TOUCH_MS makes it two fingers together). */
      firstAt: 0,
      /** A press on a component picked out with cards: a drag moves them all (as from one of the cards); a tap is the component's. */
      viaPiece: null as null | { id: string; part: PiecePart; at: Pt },
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
      /** What's carried was taken out of the search: once it's put down (or the drag's lost), the search closes. */
      fromSearch: false,
      /** Cards put down on the table this visit (for a tip, after a few). */
      drops: 0,
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
    const over = p.y < L.handTop && !solo ? stackTargetAt(takeAll(L.table, touch.sources), w.x, w.y, L.size, except, L.gridOn ? gridStackReach(L.gridStep) : undefined, face) : null;
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
    } else if (src.kind !== 'bag') {
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
      // On iPad, a tap on empty table (no card there, nor a piece): what's carried turns over.
      if (!hit && IS_PAD && !pieceAt(L.table, w.x, w.y)) return turnOver();
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
    // Carried by more than one finger, or a whole stack held up: those tips aren't needed now.
    if (sources.length > 1) tipLearned('tables-second-finger');
    if (sources.some((src) => src.kind === 'stack')) tipLearned('tables-hold-stack');
    if (p.y >= L.handTop) {
      tipLearned('tables-drag-to-hand');
      // The gap's place in the row (which leaves out the carried cards) is their place in the hand once taken.
      const without = takeAll(L.table, sources);
      const at = Math.min(L.handInsertAt(p.x), without.hands[L.handIndex].length);
      L.commit(putInHand(without, cards, L.handIndex, at));
      tourEvent('tables-to-hand');
      offerTipSoon('tables-fold-hand', 700);
      return;
    }
    // After moving a few cards about one at a time: the lasso picks out several at once (nothing on screen shows it).
    offerTipAfterUses('tables-lasso', LASSO_TIP_AFTER, 900);
    const w = toTable(readCamera(), p.x, p.y);
    // Dropped on a bag: into it.
    const bag = bagAt(L.table, w.x, w.y);
    if (bag) return L.dropIntoBag(bag.id, cards.map((card) => ({ card })), takeAll(L.table, sources));
    const whole = sources.find((src) => src.kind === 'stack');
    // Only onto a stack facing the same way.
    const face = cards[cards.length - 1].faceUp;
    let onto = cards.some((c) => c.solo)
      ? null
      : // On the table as it'll be once they're taken: where a card alone lay is nowhere to go back onto (it would
        // land, unsnapped, as if joining it). The rest of a stack it came off still counts.
        stackTargetAt(takeAll(L.table, sources), w.x, w.y, L.size, whole?.kind === 'stack' ? whole.stackId : undefined, L.gridOn ? gridStackReach(L.gridStep) : undefined, face);
    // With snapping on, its middle on the nearest grid crossing.
    const free = { x: w.x, y: w.y, angle: p.tableAngle };
    let at = L.gridOn && !onto ? snapToGrid(free, L.gridStep) : free;
    // Dropped in a card spot: onto what's in it already (facing the same way), or settled in its middle, upright.
    const spot = onto ? null : spotAt(L.table, w.x, w.y);
    if (spot) {
      const there = takeAll(L.table, sources).stacks.find(
        (s) => s.id !== (whole?.kind === 'stack' ? whole.stackId : '') && Math.hypot(s.x - spot.x, s.y - spot.y) < 1 && !s.cards.some((c) => c.solo) && s.cards[s.cards.length - 1].faceUp === face,
      );
      if (there && !cards.some((c) => c.solo)) onto = there;
      else at = { x: spot.x, y: spot.y, angle: 0 };
    }
    // A whole stack just moved (and turned), on its own, keeps being itself.
    // Tips, the first times: holding a stack (after taking one card off one), and more fingers (after a few drags).
    const from = sources[0]?.kind === 'card' ? L.table.stacks.find((st) => st.id === (sources[0] as { stackId: string }).stackId) : undefined;
    if (sources.length === 1 && from && from.cards.length > 1) offerTipSoon('tables-hold-stack', 600);
    touch.drops += 1;
    if (touch.drops === 4) offerTipSoon('tables-second-finger', 600);
    // For the walkthrough (a whole stack first, so one drop never counts for two of its steps).
    if (whole?.kind === 'stack') tourEvent('tables-lifted');
    tourEvent('tables-moved');
    if (whole?.kind === 'stack' && sources.length === 1 && !onto && !turnedOver) {
      return L.commit(raise(placeStack(L.table, whole.stackId, at), whole.stackId));
    }
    L.commit(putOnTable(takeAll(L.table, sources), cards, at, newId(), onto));
  };

  // Where the hand tabs and the open tray are on screen: touches starting there are left to them (the tabs are
  // buttons; the tray has table mode's scroll view and card handling). Read by the gesture, on the UI thread.
  const tabBand = useSharedValue({ top: 0, bottom: 0, tray: 0, toolsLeft: 0, toolsRight: 0, toolsTop: 0, toolsBottom: 0, panel: false });
  useEffect(() => {
    const reach = toolsOpen ? TOOLS_W + TOOLS_TAB_W : TOOLS_TAB_W;
    const right = toolsSpot.side === 'right';
    const w = area.w || screenW;
    tabBand.set({
      top: trayGone ? Number.MAX_VALUE : handTop - HAND_TAB_H,
      bottom: trayGone ? Number.MAX_VALUE : handTop,
      tray: folded || trayGone ? Number.MAX_VALUE : handTop,
      // The tools drawer, on its edge: just its tab while it's tucked away, the whole panel when it's out.
      toolsLeft: right ? w - reach : 0,
      toolsRight: right ? w : reach,
      toolsTop: toolsOpen ? toolsTop : tabY,
      toolsBottom: toolsOpen ? toolsTop + toolsH : tabY + TOOLS_TAB_H,
      // The search, over everything while it's open (and not on its way out): its touches are its own.
      panel: !!searching && !searchLeaving,
    });
  }, [handTop, folded, trayGone, toolsOpen, toolsTop, toolsH, tabY, toolsSpot, area.w, screenW, tabBand, searching, searchLeaving]);
  /** A touch that landed in the open tray, watched (but not yet claimed) to see if it lifts a card out. */
  const trayTouch = useSharedValue({ id: -1, x: 0, y: 0, t: 0, watching: false, panel: false });
  /** Cards taken out of the search: the next move, the finger nearest this point (on screen) carries them on the table. */
  const takeOut = useSharedValue({ active: false, x: 0, y: 0 });

  const [gesture] = useState(() => {
    const touch = gestureState.get();
    type Touch = { id: number; x: number; y: number };
    // What the table does with fingers, on the JS thread (where its state is). The gesture itself, on the UI
    // thread, just claims the touches (or leaves them to the hand tabs) and passes them on.
    /** The selected stacks start moving together, grabbed by the pressed one. */
    const startGroup = () => {
      const L = latest.get();
      const f = touch.fingers.get(touch.first);
      if (!f || !touch.pressed || touch.pressed.kind === 'hand' || touch.pressed.kind === 'bag') return;
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
    /** A finger down on a piece (or an unlocked zone): a tap uses it, a drag moves it (and any picked out with it), a hold gives its options. */
    const pressPiece = (pressed: string, part: PiecePart, w: { x: number; y: number }) => {
      const L = latest.get();
      // Part of Pro, with Pro off (and not on the Playground): left as it lies.
      if (L.lockedOut(pressed)) {
        touch.mode = 'button';
        touch.onEmpty = false;
        haptics.warn();
        L.openPro();
        return;
      }
      // Picked out along with cards: dragged, it all goes (as if from one of the cards); held, the group's options.
      if (L.pickedPieces.includes(pressed) && L.selected.length) {
        touch.pressed = { kind: 'top', stackId: L.selected[L.selected.length - 1] };
        touch.groupPress = true;
        touch.mode = 'press';
        touch.viaPiece = { id: pressed, part, at: w };
        touch.onEmpty = false;
        touch.holdTimer = setTimeout(() => {
          touch.holdTimer = null;
          if (touch.mode !== 'press' || !touch.viaPiece) return;
          touch.mode = 'button';
          touch.viaPiece = null;
          haptics.lift();
          latest.get().setMenu({ kind: 'selection' });
        }, HOLD_PIECE_MS);
        return;
      }
      // Pressing one of the picked-out dice keeps them picked out (a tap rolls them all); anything else lets them go.
      if (L.selected.length && !L.pickedPieces.includes(pressed)) L.setSelected([]);
      else if (L.pickedPieces.length && !L.pickedPieces.includes(pressed)) L.setPickedPieces([]);
      // One of several picked out: a drag takes them all.
      const group = L.pickedPieces.includes(pressed) && L.pickedPieces.length > 1 ? L.pickedPieces : [pressed];
      touch.piece = { id: pressed, part, group, from: w, moved: false };
      touch.mode = 'piece';
      touch.onEmpty = false;
      touch.holdTimer = setTimeout(() => {
        touch.holdTimer = null;
        if (touch.mode !== 'piece' || touch.piece?.id !== pressed || touch.piece.moved) return;
        // A bag on its own, held: as a stack held, a drag now moves the whole of it (let go still, its options).
        const held = latest.get();
        if (touch.piece.group.length === 1 && held.table?.pieces?.find((p) => p.id === pressed)?.kind === 'bag') {
          touch.piece.whole = true;
          haptics.lift();
          return;
        }
        touch.mode = 'button';
        touch.piece = null;
        haptics.lift();
        // One of several picked out: the group's options. Otherwise its own.
        const now = latest.get();
        const many = now.pickedPieces.includes(pressed) && now.pickedPieces.length + now.selected.length > 1;
        now.setMenu(many ? { kind: 'selection' } : { kind: 'piece', id: pressed });
      }, HOLD_PIECE_MS);
    };
    /**
     * The top thing out of a bag (a fresh one, from a supply), under the finger: a card carried as one off a stack
     * is; a piece dragged as a piece is (it's on the table once it's put down).
     */
    const pullFromBag = (bag: TablePiece, at: { x: number; y: number }) => {
      const L = latest.get();
      const items = bagItems(bag);
      const top = bag.supply ?? items[items.length - 1];
      if (!top) return;
      const id = newId();
      const item: BagItem = bag.supply ? (top.card ? { card: { ...top.card, iid: id } } : { piece: { ...top.piece!, id } }) : top;
      const w = toTable(readCamera(), at.x, at.y);
      haptics.lift();
      if (item.card) {
        touch.piece = null;
        touch.mode = 'carry';
        touch.sources = [{ kind: 'bag', bagId: bag.id, iid: item.card.iid }];
        touch.cards = [item.card];
        // Upright on the table, its middle under the finger.
        touch.offset = { x: 0, y: 0 };
        touch.screenAngle = cameraAngle(readCamera());
        touch.scaleShown = 0;
        touch.snapped = false;
        touch.turnedOver = false;
        touch.twist = null;
        touch.buttonFingers.clear();
        L.setHeld({ sources: touch.sources, cards: touch.cards });
        showCarried();
        return;
      }
      const piece = { ...item.piece!, x: w.x, y: w.y };
      const out = { bagId: bag.id, piece };
      touch.piece = { id: piece.id, part: 'body', group: [piece.id], from: w, moved: true, out };
      L.setPieceDrag({ lead: piece.id, ids: [piece.id], dx: 0, dy: 0, out });
    };
    const down = (changed: Touch[], fresh = false) => {
      // The first finger of a new touch: anything left of the last one is let go first. (Its end doesn't always come:
      // a menu opened over the table while a finger was still down, say. Left, it took this finger for a second one.)
      if (fresh && (touch.mode !== 'none' || touch.fingers.size)) cancel();
      const L = latest.get();
      // A touch on the table tucks the tools away, and does nothing else (a selection stays picked out).
      if (L.toolsOpen && touch.mode === 'none') {
        L.showTools(false);
        for (const t of changed) touch.fingers.set(t.id, { start: { x: t.x, y: t.y }, now: { x: t.x, y: t.y } });
        touch.mode = 'button';
        return;
      }
      for (const t of changed) touch.fingers.set(t.id, { start: { x: t.x, y: t.y }, now: { x: t.x, y: t.y } });
      const pts = [...touch.fingers.values()].map((f) => f.now);
      if (touch.mode === 'none') {
        const t = changed[0];
        touch.first = t.id;
        touch.viaPiece = null;
        touch.firstAt = Date.now();
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
        // The roll button, while dice are picked out.
        if (L.onRollButton(t.x, t.y)) {
          touch.mode = 'button';
          L.rollDice(L.pickedRollables);
          return;
        }
        if (L.onDiceGridButton(t.x, t.y)) {
          touch.mode = 'button';
          L.gridPickedDice();
          return;
        }
        // The selection's buttons (flip, gather, take off the table), showing while cards are picked out.
        if (L.selected.length) {
          const b = L.selectionButtonAt(t.x, t.y);
          if (b) {
            touch.mode = 'button';
            if (b === 'flip') {
              L.flipGroup();
              // After a few times: double-tapping a card does this too.
              offerTipAfterUses('tables-double-tap');
            }
            else if (b === 'shuffle') L.shuffleSelection();
            else if (b === 'gather') L.gatherGroup(L.selected[L.selected.length - 1]);
            else L.setMenu({ kind: 'selection' });
            return;
          }
        }
        // A counter or die (they lie above every card): a tap counts or rolls, a drag moves it, a hold opens its options.
        // A small piece is easy to get a finger on: caught within a fingertip's reach of it, if nothing else (not a
        // piece, nor a card) is right under the finger.
        const exactly = L.table ? pieceAt(L.table, w.x, w.y) : null;
        const onPiece =
          exactly ?? (L.table && !stackAt(L.table, w.x, w.y, L.size) ? pieceAt(L.table, w.x, w.y, FINGER_REACH / cameraZoom(readCamera())) : null);
        // Custom art lies among the cards: a card over it is what's touched.
        const overArt =
          onPiece?.piece.kind === 'art' && L.table
            ? (() => {
                const hit = stackAt(L.table, w.x, w.y, L.size);
                return !!hit && L.table.stacks.indexOf(hit.stack) > artLevel(L.table, onPiece.piece);
              })()
            : false;
        if (onPiece && !overArt) return pressPiece(onPiece.piece.id, onPiece.part, w);
        const hit = L.table ? stackAt(L.table, w.x, w.y, L.size) : null;
        touch.onEmpty = false;
        if (hit) {
          // A selected stack: dragging it moves the whole group. Any other card lets the selection go.
          touch.groupPress = L.selected.includes(hit.stack.id);
          if (!touch.groupPress && L.selected.length) L.setSelected([]);
          // A quick drag takes its top card; held a moment first, the whole stack comes (unless it's locked).
          touch.pressed = { kind: 'top', stackId: hit.stack.id };
          touch.mode = 'press';
          if (touch.groupPress) {
            // Held still, one of the picked-out stacks: the group's options.
            touch.holdTimer = setTimeout(() => {
              touch.holdTimer = null;
              if (touch.mode !== 'press' || !touch.groupPress) return;
              touch.mode = 'button';
              touch.lastTap = null;
              haptics.lift();
              latest.get().setMenu({ kind: 'selection' });
            }, HOLD_PIECE_MS);
          } else {
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
        // A zone, painted on the cloth under the cards: its corner grip resizes it; unlocked, it's moved as a piece
        // is; locked, the table under it works as ever (and a hold still gives its options).
        if (L.table) {
          const grip = zoneGripAt(L.table, w.x, w.y, ZONE_GRIP_REACH / cameraZoom(readCamera()));
          if (grip && !L.lockedOut(grip.id)) {
            if (L.selected.length || L.pickedPieces.length) L.setSelected([]);
            touch.zone = { id: grip.id, from: w, size: pieceSizeOf({ ...grip, scale: 1 }), scale: grip.scale ?? 1 };
            touch.mode = 'zoneResize';
            haptics.lift();
            return;
          }
          // (One that's part of Pro, with Pro off, is just painted on: the table under it works as ever.)
          const found = zoneAt(L.table, w.x, w.y);
          const zone = found && !L.lockedOut(found.id) ? found : null;
          if (zone && !zone.locked) return pressPiece(zone.id, 'body', w);
          if (zone) {
            const held = zone.id;
            touch.holdTimer = setTimeout(() => {
              touch.holdTimer = null;
              const f = touch.fingers.get(touch.first);
              if (touch.fingers.size !== 1 || !f || Math.hypot(f.now.x - f.start.x, f.now.y - f.start.y) > TAP_SLOP) return;
              if (touch.mode !== 'none' && touch.mode !== 'camera') return;
              touch.mode = 'button';
              touch.onEmpty = false;
              haptics.lift();
              latest.get().setMenu({ kind: 'piece', id: held });
            }, HOLD_PIECE_MS);
          }
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
          touch.lassoPieceBase = L.pickedPieces;
          L.setLassoPath(touch.lassoScreen);
          haptics.lift();
          tipLearned('tables-lasso');
          return;
        }
        touch.onEmpty = true;
        touch.firstDownAt = now;
        // Held still on empty table: what can be added, to go right there.
        if (!touch.holdTimer) {
          touch.holdTimer = setTimeout(() => {
            touch.holdTimer = null;
            const f = touch.fingers.get(touch.first);
            if (touch.fingers.size !== 1 || !f || Math.hypot(f.now.x - f.start.x, f.now.y - f.start.y) > TAP_SLOP) return;
            if (touch.mode !== 'none' && touch.mode !== 'camera') return;
            touch.mode = 'button';
            touch.onEmpty = false;
            haptics.lift();
            latest.get().openAddAt(w);
          }, HOLD_ADD_MS);
        }
      }
      // Two fingers down together (the second hard on the first), anywhere, even on a card or a component: the
      // table's, for the camera, and a two-finger double tap fits everything in view. (A second finger coming later,
      // on something held, twists it, as ever.)
      if ((touch.mode === 'press' || touch.mode === 'piece') && touch.fingers.size === 2 && Date.now() - touch.firstAt < TWO_TOUCH_MS) {
        clearHold();
        touch.piece = null;
        touch.pressed = null;
        touch.viaPiece = null;
        touch.groupPress = false;
        L.setPieceDrag(null);
        if (L.cameraLocked) {
          touch.mode = 'button';
          return;
        }
        touch.mode = 'camera';
        touch.camStart = readCamera();
        touch.camFrom = pts.slice(0, 2);
        touch.pinch = { at: Date.now(), dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) };
        return;
      }
      // A second finger on custom art being pressed or dragged (alone): it twists it, as a card's is.
      if (touch.mode === 'piece' && touch.piece) {
        const art = L.table?.pieces?.find((p) => p.id === touch.piece!.id && p.kind === 'art' && !p.locked);
        const first = touch.fingers.get(touch.first);
        const c = changed.find((t) => t.id !== touch.first);
        if (art && first && c && touch.piece.group.length === 1 && !touch.piece.twist) {
          clearHold();
          touch.piece.twist = { id: c.id, from: fingerAngle(first.now, { x: c.x, y: c.y }), base: touch.piece.turn ?? art.angle ?? 0 };
          touch.piece.moved = true;
        }
        return;
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
      // A second finger: perhaps a quick pinch.
      touch.pinch = pts.length === 2 ? { at: Date.now(), dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) } : null;
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
      if (touch.mode === 'zoneResize' && touch.zone) {
        const f = touch.fingers.get(touch.first);
        if (!f) return;
        const w = toTable(readCamera(), f.now.x, f.now.y);
        const z = touch.zone;
        latest.get().setZoneSize({ id: z.id, w: z.size.w + (w.x - z.from.x) / z.scale, h: z.size.h + (w.y - z.from.y) / z.scale });
        return;
      }
      if (touch.mode === 'piece' && touch.piece) {
        // Past a little slop, it follows the finger.
        const f = touch.fingers.get(touch.first);
        if (!f) return;
        if (!touch.piece.moved && Math.hypot(f.now.x - f.start.x, f.now.y - f.start.y) <= TAP_SLOP) return;
        if (!touch.piece.moved) {
          clearHold();
          // A quick drag from a bag (alone) takes its top thing out, as from a stack; held first, the bag moves.
          const pulled = latest.get().table?.pieces?.find((p) => p.id === touch.piece!.id && p.kind === 'bag');
          if (pulled && !touch.piece.whole && touch.piece.group.length === 1 && (pulled.supply || bagItems(pulled).length)) return pullFromBag(pulled, f.now);
          // A locked piece (on its own) stays put: the drag moves the table instead.
          const locked = latest.get().table?.pieces?.find((p) => p.id === touch.piece!.id && p.locked);
          if (locked && touch.piece.group.length === 1 && touch.piece.group[0] === locked.id) {
            touch.piece = null;
            if (latest.get().cameraLocked) {
              touch.mode = 'button';
              return;
            }
            touch.mode = 'camera';
            touch.camStart = readCamera();
            touch.camFrom = [f.start];
            return move(all);
          }

          touch.piece.moved = true;
          haptics.lift();
        }
        const w = toTable(readCamera(), f.now.x, f.now.y);
        // Twisted by a second finger: turned round with it, settling onto the table's 45° steps when close.
        const tw = touch.piece.twist && touch.fingers.get(touch.piece.twist.id);
        if (touch.piece.twist && tw) {
          const turn = snapAngle(touch.piece.twist.base + fingerAngle(f.now, tw.now) - touch.piece.twist.from);
          if (Math.abs(turn - Math.round(turn / 45) * 45) < 1e-6 && turn !== touch.piece.turn) haptics.tick();
          touch.piece.turn = turn;
        } else if (touch.piece.twist) {
          // Its finger's lifted: the turn stays, and another finger can twist it on from there.
          touch.piece.twist = null;
        }
        const { id, group, from, out, turn } = touch.piece;
        latest.get().setPieceDrag({ lead: id, ids: group, dx: w.x - from.x, dy: w.y - from.y, ...(out ? { out } : {}), ...(turn !== undefined ? { turn } : {}) });
        return;
      }
      if (touch.mode === 'lasso') {
        // The lasso follows the finger; the stacks it goes round light up as it does.
        const f = touch.fingers.get(touch.first);
        const L = latest.get();
        if (!f || !L.table) return;
        const last = touch.lassoScreen[touch.lassoScreen.length - 1];
        if (last && Math.hypot(f.now.x - last.x, f.now.y - last.y) < LASSO_STEP) return;
        // Gone too far and come back the way it came: the line rubs out back to there, letting go of what it caught
        // on the way out (as a pencil line traced back over would be erased).
        const back = lassoRetrace(touch.lassoScreen, f.now);
        const keep = back < 0 ? touch.lasso.length : back + 1;
        touch.lasso = [...touch.lasso.slice(0, keep), toTable(readCamera(), f.now.x, f.now.y)];
        touch.lassoScreen = [...touch.lassoScreen.slice(0, keep), f.now];
        L.setLassoPath(touch.lassoScreen);
        const caught = stacksInShape(L.table, touch.lasso, L.size);
        const picked = [...touch.lassoBase, ...caught.filter((id) => !touch.lassoBase.includes(id))];
        const pieces = [...touch.lassoPieceBase, ...piecesInShape(L.table, touch.lasso).filter((id) => !touch.lassoPieceBase.includes(id) && !L.lockedOut(id))];
        const grew = picked.length > L.selected.length || pieces.length > L.pickedPieces.length;
        if (picked.join() !== L.selected.join()) L.setSelected(picked);
        // Counters and dice too (set after the cards, which let them go when there are none).
        if (picked.join() !== L.selected.join() || pieces.join() !== L.pickedPieces.join()) L.setPickedPieces(pieces);
        if (grew) haptics.tick();
        return;
      }
      if (touch.mode === 'group') {
        // The whole group follows the finger, across the table.
        const f = touch.fingers.get(touch.first);
        if (!f) return;
        const w = toTable(readCamera(), f.now.x, f.now.y);
        groupDX.set(w.x - touch.groupFrom.x);
        groupDY.set(w.y - touch.groupFrom.y);
        // Counters and dice picked out with them go along (drawn where they've got to).
        if (latest.get().pickedPieces.length) latest.get().setGroupShift({ dx: w.x - touch.groupFrom.x, dy: w.y - touch.groupFrom.y });
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
      } else if (touch.mode === 'press' && touch.viaPiece && lifted.includes(touch.first)) {
        // A tap on a component picked out with cards: it's the component's (a die rolls the dice, and so on).
        clearHold();
        const { id, part, at } = touch.viaPiece;
        touch.viaPiece = null;
        L.tapPiece(id, part, at);
        touch.mode = 'none';
      } else if ((touch.mode === 'press' || touch.mode === 'handPress') && lifted.includes(touch.first)) {
        // A tap on a card on the table picks it out (its buttons show); a tap on one already picked out opens its
        // options (and lets the selection go). A hand card's tap opens its options. Each a moment later, in case
        // it's the first of two: a second tap on the same card in that moment flips it instead.
        clearHold();
        const src = touch.pressed;
        const wasSelected = touch.groupPress && touch.mode === 'press';
        if (src && src.kind !== 'bag') {
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
                tourEvent('tables-options');
              } else {
                now.setSelected([src.stackId]);
                haptics.tick();
                // A tip, the first time: tapping again opens its options.
                offerTipSoon('tables-tap-twice', 400);
              }
            }, DOUBLE_TAP_MS);
          }
        }
        touch.mode = 'none';
      } else if (touch.mode === 'zoneResize' && lifted.includes(touch.first)) {
        touch.zone = null;
        L.dropZoneSize();
        touch.mode = 'none';
      } else if (touch.mode === 'piece' && lifted.includes(touch.first)) {
        clearHold();
        const pressed = touch.piece;
        const f = touch.fingers.get(touch.first);
        touch.piece = null;
        if (pressed?.moved && f) {
          const w = toTable(readCamera(), f.now.x, f.now.y);
          L.dropPieces({
            lead: pressed.id,
            ids: pressed.group,
            dx: w.x - pressed.from.x,
            dy: w.y - pressed.from.y,
            ...(pressed.out ? { out: pressed.out } : {}),
            ...(pressed.turn !== undefined ? { turn: pressed.turn } : {}),
          });
        } else if (pressed?.whole) {
          // A bag held a moment and let go without moving: its options, as any other piece's held.
          L.setMenu({ kind: 'piece', id: pressed.id });
        } else if (pressed) {
          L.tapPiece(pressed.id, pressed.part, pressed.from);
        }
        touch.mode = 'none';
      } else if (touch.mode === 'carry') {
        if (lifted.includes(touch.first)) {
          putDown();
          touch.mode = 'none';
          if (touch.fromSearch) {
            touch.fromSearch = false;
            L.endSearch();
          }
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
          if (L.selected.length || L.pickedPieces.length) {
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
      // Two fingers tapped on the table (down and up quickly, hardly moving), twice: everything fitted in view, as
      // the tools' Fit All. (Hard to do by accident, as a quick pinch was.)
      if (touch.mode === 'camera' && touch.pinch && touch.fingers.size === 2) {
        const fingers = [...touch.fingers.values()];
        const [a, b] = fingers.map((f) => f.now);
        const tapped =
          Date.now() - touch.pinch.at < TWO_TAP_MS &&
          fingers.every((f) => Math.hypot(f.now.x - f.start.x, f.now.y - f.start.y) < TAP_SLOP * 1.5) &&
          Math.abs(Math.hypot(a.x - b.x, a.y - b.y) - touch.pinch.dist) < TAP_SLOP * 1.5;
        touch.pinch = null;
        if (tapped) {
          const now = Date.now();
          if (now - touch.twoTapAt < TWO_TAP_GAP_MS) {
            touch.twoTapAt = 0;
            L.fitAll();
            tipLearned('tables-quick-pinch');
            for (const id of lifted) touch.fingers.delete(id);
            // The other finger, still down, does nothing more till it's lifted.
            touch.mode = touch.fingers.size ? 'button' : 'none';
            return;
          }
          touch.twoTapAt = now;
        }
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
      if (touch.fromSearch) {
        touch.fromSearch = false;
        L.endSearch();
      }
      if (touch.mode === 'carry') {
        L.setHeld(null);
        L.setTarget(null);
      }
      if (touch.mode === 'lasso') L.setLassoPath(null);
      if (touch.mode === 'piece') {
        L.setPieceDrag(null);
        touch.piece = null;
      }
      if (touch.mode === 'zoneResize') {
        L.setZoneSize(null);
        touch.zone = null;
      }
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
    touch.api = { down, move, up, cancel, startTakeOut: (at) => startTakeOut(at) };
    /** A hand card lifted out (the gesture has seen a mostly upward drag from where the finger landed). */
    const liftFromHand = (start: Touch, all: Touch[]) => {
      down([start]);
      // Its moment's hold has been had already.
      touch.pressedAt = 0;
      move(all);
    };
    /**
     * Cards taken out of the search (see StackSearchPanel), the finger still on them: from here they're carried
     * over the table, face up, as a pile (the one first held on top), just like cards picked up off it.
     */
    const beginTakeOut = (finger: Touch, all: Touch[]) => {
      const L = latest.get();
      const stack = L.table?.stacks.find((s) => s.id === L.searchFrom);
      const iids = searchTake.get();
      const held = iids.flatMap((iid) => stack?.cards.filter((c) => c.iid === iid) ?? []);
      if (!stack || !held.length) return L.endSearch();
      touch.fingers.clear();
      for (const a of all) touch.fingers.set(a.id, { start: { x: a.x, y: a.y }, now: { x: a.x, y: a.y } });
      touch.first = finger.id;
      touch.twist = null;
      touch.offset = { x: 0, y: 0 };
      touch.screenAngle = 0;
      touch.scaleShown = 0;
      touch.snapped = false;
      touch.turnedOver = false;
      touch.buttonFingers.clear();
      touch.fromSearch = true;
      const carried = [...held].reverse().map((c) => ({ ...c, faceUp: true }));
      touch.sources = carried.map((c) => ({ kind: 'card', stackId: stack.id, iid: c.iid }));
      touch.cards = carried;
      touch.mode = 'carry';
      L.setHeld({ sources: touch.sources, cards: touch.cards });
      haptics.lift();
      move(all);
    };
    /** Cards taken out of the search, shown under the finger at once (till the table knows which finger it is). */
    const startTakeOut = (at: { x: number; y: number }) => {
      const pending = { id: TAKE_OUT_FINGER, x: at.x, y: at.y };
      beginTakeOut(pending, [pending]);
    };
    /** The finger carrying cards taken out of the search, now known to the table: it carries them on. */
    const adoptTakeOut = (finger: Touch, all: Touch[]) => {
      if (touch.mode !== 'carry' || touch.first !== TAKE_OUT_FINGER) return;
      const was = touch.fingers.get(TAKE_OUT_FINGER);
      touch.fingers.clear();
      for (const a of all) touch.fingers.set(a.id, { start: { x: a.x, y: a.y }, now: { x: a.x, y: a.y } });
      touch.fingers.set(finger.id, { start: was?.start ?? { x: finger.x, y: finger.y }, now: { x: finger.x, y: finger.y } });
      touch.first = finger.id;
      move(all);
    };
    /** That finger lifted before it ever moved: the cards are put down where it is. */
    const dropTakeOut = (finger: Touch) => {
      adoptTakeOut(finger, [finger]);
      up([finger]);
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
        // The search open: its touches are its own, but watched (not claimed), in case cards are taken out of it.
        if (band.panel && firstFinger && t0) {
          trayTouch.set({ id: t0.id, x: t0.x, y: t0.y, t: Date.now(), watching: true, panel: true });
          return;
        }
        const onTools = !!t0 && t0.x >= band.toolsLeft && t0.x < band.toolsRight && t0.y >= band.toolsTop && t0.y < band.toolsBottom;
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
            trayTouch.set({ id: t0.id, x: t0.x, y: t0.y, t: Date.now(), watching: true, panel: false });
            return;
          }
          trayTouch.set({ id: -1, x: 0, y: 0, t: 0, watching: false, panel: false });
        }
        // Other fingers while a tray touch is only watched: ignored.
        if (trayTouch.get().watching) return;
        manager.activate();
        scheduleOnRN(down, points(e.changedTouches), firstFinger);
      })
      .onTouchesMove((e, manager) => {
        const tt = trayTouch.get();
        if (tt.watching && tt.panel) {
          // Cards taken out of the search: the finger holding them (the one nearest where it was) carries them on.
          const to = takeOut.get();
          if (!to.active || !e.allTouches.length) return;
          let near = e.allTouches[0];
          for (const a of e.allTouches) if (Math.hypot(a.x - to.x, a.y - to.y) < Math.hypot(near.x - to.x, near.y - to.y)) near = a;
          takeOut.set({ active: false, x: 0, y: 0 });
          trayTouch.set({ ...tt, watching: false, panel: false });
          manager.activate();
          scheduleOnRN(adoptTakeOut, { id: near.id, x: near.x, y: near.y }, points(e.allTouches));
          return;
        }
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
        if (tt.watching && tt.panel) {
          // Cards taken out, and the finger lifted before it moved: they're put down right there.
          const to = takeOut.get();
          if (to.active && e.changedTouches.length) {
            let near = e.changedTouches[0];
            for (const a of e.changedTouches) if (Math.hypot(a.x - to.x, a.y - to.y) < Math.hypot(near.x - to.x, near.y - to.y)) near = a;
            takeOut.set({ active: false, x: 0, y: 0 });
            scheduleOnRN(dropTakeOut, { id: near.id, x: near.x, y: near.y });
          }
          if (allUp) {
            trayTouch.set({ id: -1, x: 0, y: 0, t: 0, watching: false, panel: false });
            manager.end();
          }
          return;
        }
        if (tt.watching) {
          const f = e.changedTouches.find((a) => a.id === tt.id);
          if (f) {
            if (Math.hypot(f.x - tt.x, f.y - tt.y) < DRAG_SLOP) scheduleOnRN(tapInHand, { id: tt.id, x: tt.x, y: tt.y });
            trayTouch.set({ id: -1, x: 0, y: 0, t: 0, watching: false, panel: false });
            manager.end();
          }
          return;
        }
        scheduleOnRN(up, points(e.changedTouches));
        if (allUp) manager.end();
      })
      .onTouchesCancelled((_, manager) => {
        if (!trayTouch.get().watching) scheduleOnRN(cancel);
        trayTouch.set({ id: -1, x: 0, y: 0, t: 0, watching: false, panel: false });
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
    return putOnTable(t, cards, gridOn ? snapToGrid(at, gridStep) : at, newId());
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
    let at = all ? { x: all.x + all.w / 2, y: all.y - gridStep - h / 2 } : viewMiddle();
    if (all && at.y < h / 2) at = { x: at.x, y: all.y + all.h + gridStep + h / 2 };
    if (gridOn) at = snapToGrid({ ...at, angle: 0 }, gridStep);
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
  /** Whether this many more cards fit on the table (see `MAX_TABLE_CARDS`); if not, says so. */
  // ---- Copy and paste (anything on the table, onto this table or another) ----
  const clip = useClip();
  /** Stacks and pieces copied, to paste (and copied again: what was copied before goes). */
  const copyThese = (stackIds: string[], pieceIds: string[]) => {
    if (!table) return;
    setClip(copyItems(table, stackIds, pieceIds));
    haptics.success();
  };
  /**
   * What's been copied put in the middle of the view, laid out as it was, and picked out, ready to drag where it's
   * wanted. Not past the table's card limit, nor its custom art's.
   */
  const pasteClip = (inMiddle = false) => {
    if (!table || !view || !clip) return;
    if (!pro && playgroundHere) return playgroundOnly();
    if (!pro && clip.pieces.some(isProPiece)) return openPro();
    if (!roomFor(table, clipCards(clip))) return;
    if (artCount + clip.pieces.filter((p) => p.kind === 'art').length > ART_MAX) return artFull();
    const { table: next, stackIds, pieceIds } = pasteItems(table, clip, inMiddle ? middleOfView() : addSpot(), newId);
    commit(next);
    setSelected(stackIds);
    setPickedPieces(pieceIds);
    haptics.drop();
  };
  const roomFor = (t: SandboxTable, more: number) => {
    if (tableCardCount(t) + more <= MAX_TABLE_CARDS) return true;
    haptics.warn();
    Alert.alert(
      'This table is full',
      `A table holds up to ${MAX_TABLE_CARDS.toLocaleString('en-US')} cards, counting its hands and trash. Empty the trash, or start another table.`,
    );
    return false;
  };
  const addDeckToTable = (deck: Deck) => {
    if (!pro && playgroundHere) return playgroundOnly();
    if (!table || !roomFor(table, deckSize(deck))) return;
    arrive(addDeck(table, deck, viewMiddle(), newId));
  };
  /** Some of a deck's cards, chosen one by one: in one face-down stack. */
  const addCardsToTable = (deck: Deck, cardIds: string[]) => {
    if (!pro && playgroundHere) return playgroundOnly();
    const more = deck.cards.filter((c) => cardIds.includes(c.id)).reduce((n, c) => n + copiesOf(c), 0);
    if (!table || !roomFor(table, more)) return;
    arrive(addCards(table, deck, cardIds, viewMiddle(), newId));
  };

  const rename = askName;

  /** Everything in sight (cards and all): below the top bar's buttons, above the hand, upright (for this table, as it'll be). */
  const fitView = (t: SandboxTable, quiet = false) => {
    if (!view) return;
    const bounds = tableBounds(t, size);
    // Between the top bar's buttons and the hand: the top of its tabs (as it is now: open, or folded away).
    const top = insets.top + TOP_BAR_H;
    const bottom = handTop - HAND_TAB_H;
    const space = { x: FIT_MARGIN, y: top + FIT_MARGIN, w: view.w - FIT_MARGIN * 2, h: bottom - top - FIT_MARGIN * 2 };
    writeCamera(bounds ? fitCamera(bounds, space) : startCamera({ w: view.w, h: bottom }, t.focus));
    // Saved with the table as it is by then (this render's may be a change behind).
    setTimeout(() => latest.get().saveCamera(), 50);
    if (!quiet) haptics.tick();
  };
  useEffect(() => {
    if (!fitFirst || !view || !table) return;
    setFitFirst(false);
    fitView(table, true);
    // Just once, when the table's first laid out.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitFirst, view]);
  /** The tools' Clean Up: every card straight and on the grid, none sharing a spot. */
  const cleanUp = () => {
    if (!table) return;
    commit(tidyTable(table, gridStep));
    haptics.drop();
  };
  /** The tools' Gather by Deck: a new game, every deck used whole again, in a row in the middle of the view. */
  const gatherUp = () => {
    if (!table) return;
    haptics.warn();
    Alert.alert('Gather everything by deck?', 'Every card on the table, in the hands and in the trash goes back into its deck, shuffled and face down. Undo puts it all back.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Gather',
        onPress: () => {
          const m = viewMiddle();
          // As many decks as were brought on (two copies of a deck come back as two), in a row across the middle.
          const all = [...table.stacks.flatMap((s) => s.cards), ...table.hands.flat(), ...(table.trash ?? [])];
          const whole = all.filter((c) => !c.single);
          const count = Math.max(1, decks.filter((d) => d.cards.length && whole.some((c) => c.deckId === d.id)).reduce((n, d) => n + setsOfDeck(d, whole), 0));
          const start = { x: m.x - ((count - 1) * CARD_W * 1.5) / 2, y: m.y };
          const place = gridOn ? (p: { x: number; y: number; angle: number }) => snapToGrid(p, gridStep) : undefined;
          const next = gatherDecks(table, decks, start, newId, Math.random, place, gridStep);
          commit(next);
          fitView(next);
          haptics.drop();
        },
      },
    ]);
  };

  /** A card brought up close, for its menu: about half the screen across (less, for a tall screen's sake). */
  const bigCard = (c: SandboxCard, withList = false) => {
    const deck = decksById.get(c.deckId);
    if (!deck) return null;
    // A little smaller with a list of options under it too, so it all fits.
    const w = Math.min(screenW * (withList ? 0.42 : 0.55), area.h * (withList ? 0.26 : 0.36) * cardRatio(deck));
    return <CardView deck={deck} card={cardOf(c)} faceUp={c.faceUp} width={w} sharp />;
  };
  // ---- The search: a stack looked through, over the table. ----
  const searchStack = searching ? table?.stacks.find((s) => s.id === searching) : undefined;
  /** A bag being searched through (as a stack is), and what can be done with what's in it. */
  const searchBag = searching ? table?.pieces?.find((p) => p.id === searching && p.kind === 'bag') : undefined;
  const bagSearchActions = (key: string): SheetAction[] => {
    if (!table || !searchBag) return [];
    const topFirst = [...bagItems(searchBag)].reverse();
    const i = topFirst.findIndex((x) => itemKey(x) === key);
    const item = topFirst[i];
    if (!item) return [];
    return [
      { label: 'Take it out', onPress: () => commit(placeItem(removeBagItems(table, searchBag.id, [key]), item, besideBagOf(searchBag), newId())) },
      ...(i > 0 ? [{ label: 'Move to the top', onPress: () => commit(reorderBag(table, searchBag.id, [i], 0)) }] : []),
      ...(i < topFirst.length - 1 ? [{ label: 'Move to the bottom', onPress: () => commit(reorderBag(table, searchBag.id, [i], topFirst.length - 1)) }] : []),
    ];
  };
  const bagPickActions = (keys: string[]): SheetAction[] => {
    if (!table || !searchBag || !keys.length) return [];
    const topFirst = [...bagItems(searchBag)].reverse();
    const places = keys.map((k) => topFirst.findIndex((x) => itemKey(x) === k)).filter((i) => i >= 0);
    const n = places.length;
    const takeOut = () => {
      const beside = besideBagOf(searchBag);
      // Cards onto one pile beside it, pieces in a row after them.
      const next = places.reduce(
        (t, place, j) => placeItem(t, topFirst[place], topFirst[place].card ? beside : { x: beside.x + CARD_W + j * gridStep, y: beside.y }, newId()),
        removeBagItems(table, searchBag.id, keys),
      );
      commit(next);
    };
    return [
      { label: n === 1 ? 'Take it out' : `Take all ${n} out`, onPress: takeOut },
      { label: 'Top of the bag', onPress: () => commit(reorderBag(table, searchBag.id, places, 0)) },
      { label: 'Bottom of the bag', onPress: () => commit(reorderBag(table, searchBag.id, places, topFirst.length - n)) },
    ];
  };
  /** A card's options in the search: elsewhere in the stack, into the hand, onto the table (face up), or off it. */
  const searchActions = (iid: string): SheetAction[] => {
    if (!table || !searchStack) return [];
    const topFirst = [...searchStack.cards].reverse();
    const i = topFirst.findIndex((c) => c.iid === iid);
    const card = topFirst[i];
    if (!card) return [];
    const src: Source = { kind: 'card', stackId: searchStack.id, iid };
    const { w } = size(card.deckId);
    const beside = { x: searchStack.x + w + gridStep, y: searchStack.y, angle: searchStack.angle };
    return [
      ...(i > 0 ? [{ label: 'Move to the top', onPress: () => commit(reorderStack(table, searchStack.id, [i], 0)) }] : []),
      ...(i < topFirst.length - 1
        ? [{ label: 'Move to the bottom', onPress: () => commit(reorderStack(table, searchStack.id, [i], topFirst.length - 1)) }]
        : []),
      {
        label: `Into ${table.handNames[handIndex]}`,
        onPress: () => commit(putInHand(take(table, src), [{ ...card, faceUp: true }], handIndex)),
      },
      {
        label: 'Onto the table, face up',
        // Then the search goes, to show it there, picked out to be moved where it belongs.
        onPress: () => {
          const id = newId();
          commit(putOnTable(take(table, src), [{ ...card, faceUp: true }], gridOn ? snapToGrid(beside, gridStep) : beside, id));
          setSelected([id]);
          endSearch();
        },
      },
      { label: 'Take off the table', destructive: true, onPress: () => commit(trashCards(take(table, src), [card])) },
    ];
  };
  /**
   * What can be done with several cards picked in the search (listed top first): onto the table face up (fanned out
   * beside the stack), into the open hand, to the stack's top or bottom, or off the table.
   */
  const searchPickActions = (iids: string[]): SheetAction[] => {
    if (!table || !searchStack || !iids.length) return [];
    const topFirst = [...searchStack.cards].reverse();
    const cards = iids.flatMap((iid) => topFirst.filter((c) => c.iid === iid));
    const places = iids.map((iid) => topFirst.findIndex((c) => c.iid === iid));
    const rest = takeAll(table, iids.map((iid) => ({ kind: 'card' as const, stackId: searchStack.id, iid })));
    const n = cards.length;
    const { w } = size(cards[0].deckId);
    const beside = { x: searchStack.x + w + gridStep, y: searchStack.y };
    return [
      {
        label: 'Onto the table, face up',
        // Then the search goes, to show them there, picked out to be moved where they belong.
        onPress: () => {
          const ids = cards.map(() => newId());
          commit(
            cards.reduce((t, card, i) => {
              const at = { x: beside.x + i * gridStep, y: beside.y, angle: searchStack.angle };
              return putOnTable(t, [{ ...card, faceUp: true }], gridOn ? snapToGrid(at, gridStep) : at, ids[i]);
            }, rest),
          );
          setSelected(ids);
          endSearch();
        },
      },
      { label: `Into ${table.handNames[handIndex]}`, onPress: () => commit(putInHand(rest, cards.map((c) => ({ ...c, faceUp: true })), handIndex)) },
      { label: 'Top of this stack', onPress: () => commit(reorderStack(table, searchStack.id, places, 0)) },
      { label: 'Bottom of this stack', onPress: () => commit(reorderStack(table, searchStack.id, places, topFirst.length - n)) },
      { label: n === 1 ? 'Take it off the table' : `Take all ${n} off the table`, destructive: true, onPress: () => commit(trashCards(rest, cards)) },
    ];
  };
  const menuStack = menu?.kind === 'stack' ? table?.stacks.find((s) => s.id === menu.id) : undefined;
  const menuHandCard = menu?.kind === 'hand' ? table?.hands[menu.hand].find((c) => c.iid === menu.iid) : undefined;

  // ---- A stack's or piece's options: the camera glides in on it where it lies, and the rest goes dark. ----
  /** Where its options start on screen, once laid out: it's centered in the room above them. */
  const [optionsTop, setOptionsTop] = useState<number | null>(null);
  /** The camera before it glided in (to glide back to as the options close), and where it glided to. */
  const [glide] = useState(() => {
    const box: { before: Camera | null; to: Camera | null } = { before: null, to: null };
    return { get: () => box, set: (next: Partial<typeof box>) => Object.assign(box, next) };
  });
  const spotPiece = menu?.kind === 'piece' ? table?.pieces?.find((p) => p.id === menu.id) : undefined;
  /** What's lit up: where it lies, how big, and its turn on the table. */
  const spot = (() => {
    if (menuStack) {
      const { w, h } = cardSizeOf(menuStack.cards[menuStack.cards.length - 1], size);
      return { key: `s:${menuStack.id}`, x: menuStack.x, y: menuStack.y, w, h, angle: menuStack.angle };
    }
    if (spotPiece) {
      const { w, h } = pieceSizeOf(spotPiece);
      return { key: `p:${spotPiece.id}`, x: spotPiece.x, y: spotPiece.y, w, h, angle: spotPiece.kind === 'art' ? (spotPiece.angle ?? 0) : 0 };
    }
    return null;
  })();
  const spotKey = spot?.key ?? null;
  const glideCamera = (to: Camera) => {
    const t = { duration: SPOT_MS, easing: ReEasing.out(ReEasing.cubic) };
    camA.set(withTiming(to.a, t));
    camB.set(withTiming(to.b, t));
    camX.set(withTiming(to.tx, t));
    camY.set(withTiming(to.ty, t));
  };
  useEffect(() => {
    // (On iPad the camera's left be: the options float beside it instead.)
    if (IS_PAD) return;
    if (!spot) {
      // Closed: back to where the camera was, unless something chosen has moved it since.
      const { before, to } = glide.get();
      glide.set({ before: null, to: null });
      const now = readCamera();
      if (before && to && Math.abs(now.tx - to.tx) < 2 && Math.abs(now.ty - to.ty) < 2 && Math.abs(now.a - to.a) < 0.01) glideCamera(before);
      return;
    }
    if (optionsTop === null) return;
    const cam = glide.get().before ?? readCamera();
    const turn = Math.atan2(cam.b, cam.a);
    // Its outline as seen on screen (turned with the table), fitted to the room above the options.
    const seen = turn + (spot.angle * Math.PI) / 180;
    const bw = Math.abs(spot.w * Math.cos(seen)) + Math.abs(spot.h * Math.sin(seen));
    const bh = Math.abs(spot.w * Math.sin(seen)) + Math.abs(spot.h * Math.cos(seen));
    const roomTop = insets.top + 16;
    const room = { w: screenW - 64, h: Math.max(80, optionsTop - roomTop - 16) };
    const z = Math.min(SPOT_MAX_ZOOM, Math.max(MIN_ZOOM, SPOT_FILL * Math.min(room.w / Math.max(1, bw), room.h / Math.max(1, bh))));
    const at = { x: screenW / 2, y: roomTop + room.h / 2 };
    const a = z * Math.cos(turn);
    const b = z * Math.sin(turn);
    const to = { a, b, tx: at.x - (a * spot.x - b * spot.y), ty: at.y - (b * spot.x + a * spot.y) };
    glide.set({ before: cam, to });
    glideCamera(to);
    // As it opens (and if its options change size, or it changes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spotKey, optionsTop]);
  /** It, lit up over the darkened table: drawn as it lies, through the same camera, so it's just where it is. */
  const spotStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: camX.value },
      { translateY: camY.value },
      { rotate: `${Math.atan2(camB.value, camA.value)}rad` },
      { scale: Math.hypot(camA.value, camB.value) },
    ],
  }));
  /** Where it is on screen (the box round it, turned as it's seen), for the iPad's options to float beside. */
  const spotNear = (() => {
    if (!IS_PAD || !spot) return undefined;
    const cam = readCamera();
    const r = (spot.angle * Math.PI) / 180;
    const pts = [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ].map(([sx, sy]) => {
      const wx = spot.x + (sx * spot.w * Math.cos(r)) / 2 - (sy * spot.h * Math.sin(r)) / 2;
      const wy = spot.y + (sx * spot.w * Math.sin(r)) / 2 + (sy * spot.h * Math.cos(r)) / 2;
      return { x: cam.a * wx - cam.b * wy + cam.tx, y: cam.b * wx + cam.a * wy + cam.ty };
    });
    const xs = pts.map((q) => q.x);
    const ys = pts.map((q) => q.y);
    return { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
  })();
  const spotlight = spot && !IS_PAD ? (
    <Animated.View style={[styles.world, spotStyle]} pointerEvents="none">
      {menuStack ? (
        <StackView
          stack={menuStack}
          deck={decksById.get(menuStack.cards[menuStack.cards.length - 1].deckId)}
          decks={decksById}
          size={cardSizeOf(menuStack.cards[menuStack.cards.length - 1], size)}
          hidden=""
          target={false}
          selected={false}
          showCount={!table?.hideCounts}
        />
      ) : spotPiece ? (
        <TablePieceView piece={spotPiece} />
      ) : null}
    </Animated.View>
  ) : undefined;
  const sheet = (() => {
    if (!table || !menu) return null;
    if (menu.kind === 'stack' && menuStack) {
      const top = menuStack.cards[menuStack.cards.length - 1];
      const n = menuStack.cards.length;
      // The four used most, as buttons; everything else in a quiet list under them.
      const tiles: SheetTile[] = [
        {
          label: 'Flip over',
          icon: FLIP_ICON,
          onPress: () => {
            commit(settleOnto(flipStack(table, menuStack.id), menuStack.id));
            offerTipAfterUses('tables-double-tap');
          },
        },
        // Into the open hand: the top card.
        {
          label: 'Draw',
          icon: { ios: 'arrow.down.to.line', android: 'download', web: 'download' },
          onPress: () => {
            commit(dealToHand(table, menuStack.id, 1, handIndex));
            haptics.drop();
            // After a few times: dragging a card into the hand does this too.
            offerTipAfterUses('tables-drag-to-hand');
          },
        },
        ...(n > 1
          ? [
              {
                label: 'Shuffle',
                icon: { ios: 'shuffle', android: 'shuffle', web: 'shuffle' } as const,
                // One of several picked out: all of them.
                onPress: () => shuffleStacks(chosen.includes(menuStack.id) ? chosen : [menuStack.id]),
              },
              {
                label: 'Search',
                icon: { ios: 'magnifyingglass', android: 'search', web: 'search' } as const,
                onPress: () => {
                  setSearchLeaving(false);
                  setSearching(menuStack.id);
                },
              },
            ]
          : []),
      ];
      const rows: FocusRow[] = [
        // Dealing: how many off the top, and to whom (see DealPanel).
        { kind: 'action', label: 'Deal…', more: true, keepsOpen: true, onPress: () => setDealingFrom(menuStack.id) },
        {
          kind: 'pair',
          label: 'Turn',
          options: [
            { label: '⟲ Left', onPress: () => commit(turnStack(table, menuStack.id, -90)) },
            { label: 'Right ⟳', onPress: () => commit(turnStack(table, menuStack.id)) },
          ],
        },
        // Spread out, every card showing, as close as the grid allows.
        ...(n > 1
          ? [
              {
                kind: 'pair' as const,
                label: 'Fan out',
                options: [
                  { label: 'Down', onPress: () => commit(fanStack(table, menuStack.id, 'down', newId, gridStep)) },
                  { label: 'Across', onPress: () => commit(fanStack(table, menuStack.id, 'across', newId, gridStep)) },
                ],
              },
            ]
          : []),
        // Among the cards it overlaps: under or over them.
        {
          kind: 'pair',
          label: 'Layer',
          options: (['back', 'down', 'up', 'front'] as const).map((to) => ({
            label: to === 'back' ? 'Back' : to === 'down' ? 'Down' : to === 'up' ? 'Up' : 'Front',
            onPress: () => commit(moveLayer(table, menuStack.id, to, size)),
          })),
        },
        { kind: 'toggle', label: 'Lock', value: !!menuStack.locked, onChange: (on) => commit(setStack(table, menuStack.id, { locked: on })) },
        { kind: 'action', label: 'Scale…', onPress: () => openScale([menuStack.id], []) },
        // A single card can be kept from stacking: nothing goes onto it, and it goes onto nothing.
        ...(n === 1 ? [{ kind: 'toggle' as const, label: 'Never stack', value: !!top.solo, onChange: (on: boolean) => commit(setSolo(table, menuStack.id, on)) }] : []),
        ...(top.faceUp ? [{ kind: 'action' as const, label: 'Full size', keepsOpen: true, onPress: () => setZoomed(top) }] : []),
        { kind: 'action', label: 'Copy', onPress: () => copyThese([menuStack.id], []) },
        { kind: 'action', label: 'Take off the table', destructive: true, onPress: () => commit(removeStacks(table, [menuStack.id])) },
      ];
      return {
        title: n > 1 ? `Stack of ${n}` : top.faceUp ? (cardOf(top)?.name ?? 'Card') : 'Face-down card',
        header: bigCard(top, true),
        tiles,
        rows,        actions: [],
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
        { label: 'Off table', icon: { ios: 'trash', android: 'delete', web: 'delete' }, destructive: true, onPress: () => commit(trashCards(take(table, src), [menuHandCard])) },
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
          ...(clip ? [{ label: clipSize(clip) === 1 ? 'Paste' : `Paste ${clipSize(clip)} things`, onPress: () => pasteClip(true) }] : []),
          { label: 'Table theme…', onPress: () => setTimeout(() => setMenu({ kind: 'color' }), 250) },
          {
            label: table.hideHands ? 'Show the hands' : 'Hide the hands',
            onPress: () => updateSandbox({ ...table, hideHands: !table.hideHands || undefined }),
          },
          {
            label: 'Reset the view',
            onPress: () => {
              fitView(table);
              offerTipAfterUses('tables-quick-pinch', undefined, 900);
            },

          },
          ...(Platform.OS === 'ios'
            ? [{ label: 'Rename table', opensModal: true, onPress: () => rename('Rename table', table.name, (name) => updateSandbox({ ...table, name })) }]
            : []),
          {
            label: 'Clear the table',
            destructive: true,
            // Everything into the trash, so it can be put back (or gathered up again).
            onPress: () => commit(trashCards({ ...table, stacks: [], hands: table.hands.map(() => []) }, [...table.stacks.flatMap((s) => s.cards), ...table.hands.flat()])),
          },
        ],
      };
    }
    if (menu.kind === 'color') {
      const pick = (background: string) => {
        updateSandbox({ ...table, background });
        haptics.tick();
      };
      const current = TABLE_THEMES[table.background ?? 'classic'] ? (table.background ?? 'classic') : 'classic';
      return {
        title: 'Table theme',
        tiles: [],
        // Each cloth with a tray to match.
        actions: THEME_KEYS.map((key) => ({ label: `${TABLE_THEMES[key].name}${current === key ? '  ✓' : ''}`, onPress: () => pick(key) })),
      };
    }
    if (menu.kind === 'selection') {
      // Everything picked out: cards, and counters and dice.
      const n = chosen.length;
      const pieces = (table.pieces ?? []).filter((p) => pickedPieces.includes(p.id));
      const dice = pieces.filter((p) => p.kind === 'die');
      const total = n + pieces.length;
      const allLocked = chosen.every((id) => table.stacks.find((s) => s.id === id)?.locked);
      const shufflable = chosen.filter((id) => (table.stacks.find((s) => s.id === id)?.cards.length ?? 0) > 1);
      const takeAllOff = () => {
        commit(pieces.reduce((t, p) => removePiece(t, p.id), n ? removeStacks(table, chosen) : table));
        selectStacks([]);
        haptics.drop();
      };
      return {
        title: total === 1 ? 'Selected' : `${total} selected`,
        tiles: [],
        actions: [
          ...(dice.length
            ? [
                { label: dice.length === 1 ? 'Roll it' : `Roll all ${dice.length} dice`, onPress: () => rollDice(dice.map((d) => d.id)) },
                { label: dice.length === 1 ? 'Change the die…' : 'Change the dice…', onPress: () => setTimeout(() => setMenu({ kind: 'dieKind' }), 250) },
                {
                  // All of them one way: rolling in place if any rolls across.
                  label: dice.every((d) => d.rollInPlace) ? 'Roll across the table' : 'Roll in place',
                  onPress: () => {
                    const inPlace = !dice.every((d) => d.rollInPlace);
                    commit(dice.reduce((t, d) => setPiece(t, d.id, { rollInPlace: inPlace || undefined }), table));
                  },
                },
              ]
            : []),
          // Coins and spinners (alone, or with dice): one to flip and spin them all, dice and all.
          ...(pieces.some((p) => p.kind === 'coin' || p.kind === 'spinner')
            ? [{ label: dice.length ? 'Roll, flip and spin them all' : 'Flip and spin them all', onPress: () => rollDice(pieces.filter(rollable).map((p) => p.id)) }]
            : []),
          ...(pieces.some((p) => p.kind === 'meeple') ? [{ label: 'Change the shape…', onPress: () => setTimeout(() => setMenu({ kind: 'pieceShape' }), 250) }] : []),
          ...(pieces.length ? [{ label: 'Color…', onPress: () => setTimeout(() => setMenu({ kind: 'pieceColor' }), 250) }] : []),
          // Custom art picked out on its own (no cards): turned as cards are.
          ...(!n && pieces.some((p) => p.kind === 'art' && !p.locked)
            ? [
                { label: 'Rotate…', onPress: () => openRotate(pieces.filter((p) => p.kind === 'art' && !p.locked).map((p) => p.id)) },
              ]
            : []),
          ...(shufflable.length ? [{ label: shufflable.length === 1 ? 'Shuffle' : `Shuffle all ${shufflable.length}`, onPress: () => shuffleStacks(shufflable) }] : []),
          ...(n
            ? [
                // Custom art picked out with them turns too.
                { label: 'Turn left', onPress: () => commit(turnArt(chosen.reduce((t, id) => turnStack(t, id, -90), table), pieces.map((p) => p.id), -90)) },
                { label: 'Turn right', onPress: () => commit(turnArt(chosen.reduce((t, id) => turnStack(t, id), table), pieces.map((p) => p.id), 90)) },
                {
                  label: allLocked ? 'Unlock' : 'Lock',
                  onPress: () => commit(chosen.reduce((t, id) => setStack(t, id, { locked: !allLocked }), table)),
                },
              ]
            : []),
          // (Not what's locked in place.)
          { label: 'Scale…', onPress: () => openScale(chosen, pieces.filter((p) => !p.locked).map((p) => p.id)) },
          { label: total === 1 ? 'Copy' : `Copy all ${total}`, onPress: () => copyThese(chosen, pieces.map((p) => p.id)) },
          { label: total === 1 ? 'Take it off the table' : `Take all ${total} off the table`, destructive: true, onPress: takeAllOff },
        ],
      };
    }
    if (menu.kind === 'piece') {
      // Every piece's options laid out as a card's (see CardFocus): it, big, in the middle; what it does most as
      // tiles; then rows (switches, a layer, taking it off the table).
      const piece = table.pieces?.find((p) => p.id === menu.id);
      if (!piece) return null;
      const id = piece.id;
      const icon = (ios: string, android: string) => ({ ios, android, web: android }) as SheetTile['icon'];
      const tile = (label: string, ios: string, android: string, onPress: () => void, disabled = false): SheetTile => ({ label, icon: icon(ios, android), onPress, disabled });
      // What opens over the table once this has gone: another menu, the name prompt, the system's picture menu.
      const next = (m: Menu) => () => setTimeout(() => setMenu(m), 250);
      const ask = (title: string, current: string, done: (text: string) => void) => () => setTimeout(() => rename(title, current, done), 350);
      // A number (or a time), with the number keyboard.
      const askNum = (title: string, current: string, done: (text: string) => void, kind: 'number' | 'signed' | 'time' = 'number') => () =>
        setTimeout(() => askNumber(title, current, done, kind), 350);
      const colorTile = tile('Color', 'paintpalette', 'palette', next({ kind: 'pieceColor', id }));
      // Not for what's locked in place (it's meant to stay as it is).
      const scaleTile = tile('Scale', 'arrow.up.left.and.arrow.down.right', 'open_in_full', () => openScale([], [id]), !!piece.locked);
      // For what usually sits in one place through a game: locked, it stays put (dragging it moves the table).
      const lockRow: FocusRow = { kind: 'toggle', label: 'Lock', value: !!piece.locked, onChange: (on) => commit(setPiece(table, id, { locked: on || undefined })) };
      const takeOffRow: FocusRow = { kind: 'action', label: 'Take off the table', destructive: true, onPress: () => commit(removePiece(table, id)) };
      // It, big: as it lies on the table, fitted to the middle of the screen.
      const own = pieceSizeOf({ ...piece, scale: 1 });
      const fit = Math.min(3, 220 / own.w, 220 / own.h);
      const header = (
        <View style={{ width: own.w * fit, height: own.h * fit }}>
          <View style={{ width: own.w, height: own.h, transform: [{ translateX: (own.w * fit - own.w) / 2 }, { translateY: (own.h * fit - own.h) / 2 }, { scale: fit }] }}>
            <TablePieceView piece={{ ...piece, x: own.w / 2, y: own.h / 2, scale: 1 }} />
          </View>
        </View>
      );
      // Copy, last but one (taking it off the table is last).
      const copyRow: FocusRow = { kind: 'action', label: 'Copy', onPress: () => copyThese([], [id]) };
      const focus = (title: string, tiles: SheetTile[], rows: FocusRow[]) => ({
        title,
        header,
        tiles,
        rows: [...rows.slice(0, -1), copyRow, ...rows.slice(-1)],
        actions: [] as SheetAction[],
      });
      const named = (title: string, current: string) =>
        ask(title, current, (label) => commit(setPiece(table, id, { label })));
      switch (piece.kind) {
        case 'counter':
          return focus(
            piece.label || 'Counter',
            [
              tile(
                'Number',
                'number',
                'pin',
                askNum(
                  'Set the number',
                  String(piece.value),
                  (text) => {
                    const n = parseInt(text.replace(/[^\d-]/g, ''), 10);
                    if (Number.isFinite(n)) commit(setPiece(table, id, { value: n }));
                  },
                  'signed',
                ),
              ),
              tile('Reset', 'arrow.counterclockwise', 'restart_alt', () => commit(setPiece(table, id, { value: 0 }))),
              tile('Name', 'character.cursor.ibeam', 'edit', named('Name the counter', piece.label ?? '')),
              colorTile,
              scaleTile,
            ],
            [lockRow, takeOffRow],
          );
        case 'die':
          return focus(
            `d${piece.sides ?? 6}`,
            [
              tile('Roll', 'dice', 'casino', () => rollDice([id])),
              tile('Kind', 'die.face.6', 'casino', next({ kind: 'dieKind', id })),
              colorTile,
              scaleTile,
            ],
            [{ kind: 'toggle', label: 'Roll in place', value: !!piece.rollInPlace, onChange: (on) => commit(setPiece(table, id, { rollInPlace: on || undefined })) }, takeOffRow],
          );
        case 'coin':
          return focus('Coin', [tile('Flip', 'arrow.triangle.2.circlepath', 'sync', () => rollDice([id])), colorTile, scaleTile], [takeOffRow]);
        case 'spinner':
          return focus('Spinner', [tile('Spin', 'arrow.clockwise.circle', 'autorenew', () => rollDice([id])), colorTile, scaleTile], [lockRow, takeOffRow]);
        case 'text':
          return focus(piece.label || 'Text', [tile('Words', 'character.cursor.ibeam', 'edit', named('Text', piece.label ?? '')), colorTile, scaleTile], [lockRow, takeOffRow]);
        case 'marker':
          return focus(piece.label || 'Marker', [tile('Words', 'character.cursor.ibeam', 'edit', named('Marker', piece.label ?? '')), colorTile, scaleTile], [takeOffRow]);
        case 'meeple':
          return focus(pieceName(piece), [tile('Shape', 'square.on.circle', 'category', next({ kind: 'pieceShape', id })), colorTile, scaleTile], [takeOffRow]);
        case 'token':
          return focus(
            piece.value > 1 ? `Token × ${piece.value}` : 'Token',
            [
              tile(
                'How many',
                'number',
                'pin',
                askNum('How many', String(piece.value), (text) => {
                  const n = parseInt(text.replace(/\D/g, ''), 10);
                  if (n > 0) commit(setPiece(table, id, { value: Math.min(999, n) }));
                }),
              ),
              // The system's menu, once this has gone (see choosePicture).
              tile('Picture', 'photo', 'image', () => setTimeout(() => choosePicture({ kind: 'token', id }), 450)),
              colorTile,
              scaleTile,
            ],
            [
              { kind: 'toggle', label: 'Square', value: !!piece.square, onChange: (on) => commit(setPiece(table, id, { square: on || undefined })) },
              ...(piece.image ? [{ kind: 'action' as const, label: 'Take the picture off', onPress: () => commit(setPiece(table, id, { image: undefined })) }] : []),
              takeOffRow,
            ],
          );
        case 'timer':
          return focus(
            `Timer · ${timerText(piece.value)}`,
            [
              tile(
                'Time',
                'timer',
                'timer',
                askNum(
                  'Minutes, or minutes:seconds',
                  timerText(piece.value),
                  (text) => {
                    const secs = parseTimerText(text);
                    if (secs) commit(setPiece(table, id, { value: secs, endsAt: undefined, left: undefined }));
                    else Alert.alert('That isn’t a time', 'Type minutes (like 5) or minutes and seconds (like 1:30).');
                  },
                  'time',
                ),
              ),
              tile('Reset', 'arrow.counterclockwise', 'restart_alt', () => commit(setPiece(table, id, { endsAt: undefined, left: undefined }))),
              colorTile,
              scaleTile,
            ],
            [lockRow, takeOffRow],
          );
        case 'track':
          return focus(
            'Track',
            [
              tile(
                'Spaces',
                'number',
                'pin',
                askNum(`Spaces (2 to ${TRACK_MAX})`, String(piece.spaces ?? 10), (text) => {
                  const n = Math.min(TRACK_MAX, Math.max(2, parseInt(text.replace(/\D/g, ''), 10) || 0));
                  commit(setPiece(table, id, { spaces: n, value: Math.min(piece.value, n - 1) }));
                }),
              ),
              tile('To start', 'arrow.uturn.backward', 'undo', () => commit(setPiece(table, id, { value: 0 }))),
              colorTile,
              tile('Marker', 'square.fill', 'square', next({ kind: 'pieceColor', id, marker: true })),
              scaleTile,
            ],
            [
              { kind: 'toggle', label: 'Vertical', value: !!piece.vertical, onChange: (on) => commit(setPiece(table, id, { vertical: on || undefined })) },
              { kind: 'toggle', label: 'Flip number direction', value: !!piece.reversed, onChange: (on) => commit(setPiece(table, id, { reversed: on || undefined })) },
              { kind: 'toggle', label: 'Number from 0', value: piece.first === 0, onChange: (on) => commit(setPiece(table, id, { first: on ? 0 : 1 })) },
              lockRow,
              takeOffRow,
            ],
          );
        case 'zone': {
          const look = piece.look ?? 'outline';
          return focus(
            piece.label || (piece.snap ? 'Card spot' : 'Zone'),
            [tile('Name', 'character.cursor.ibeam', 'edit', named(piece.snap ? 'Name the card spot' : 'Name the zone', piece.label ?? '')), colorTile, scaleTile],
            [
              {
                kind: 'pair',
                label: 'Look',
                options: (['outline', 'filled', 'dashed'] as const).map((l) => ({
                  label: `${l === 'outline' ? 'Line' : l === 'filled' ? 'Filled' : 'Dashed'}${look === l ? ' ✓' : ''}`,
                  onPress: () => commit(setPiece(table, id, { look: l === 'outline' ? undefined : l })),
                })),
              },
              {
                kind: 'action',
                // Snug round the cards and custom art lying in it.
                label: 'Auto fit',
                onPress: () => {
                  const fitted = fitZone(table, id, size);
                  // Nothing in it to fit round.
                  if (fitted === table) return haptics.warn();
                  commit(fitted);
                  haptics.drop();
                },
              },
              { kind: 'toggle', label: 'Cards snap into it', value: !!piece.snap, onChange: (on) => commit(setPiece(table, id, { snap: on || undefined })) },
              lockRow,
              takeOffRow,
            ],
          );
        }
        case 'bag': {
          // As a stack's: draw, shuffle and search, and more under them.
          const items = bagItems(piece);
          const top = piece.supply ?? items[items.length - 1];
          const itemName = (i: BagItem) => (i.card ? (cardOf(i.card)?.name ?? 'Card') : pieceName(i.piece!));
          // The top thing: a card into the open hand, a piece beside the bag.
          const drawTop = () => {
            const out = takeFromBag(table, id, newId());
            if (!out) return haptics.warn();
            commit(out.item.card ? putInHand(out.table, [out.item.card], handIndex) : placeItem(out.table, out.item, besideBagOf(piece), newId()));
            haptics.deal();
          };
          return focus(
            piece.supply ? `Endless supply · ${itemName(piece.supply)}` : items.length ? `Bag · ${items.length}` : 'Bag · empty',
            [
              tile('Draw', 'arrow.down.to.line', 'download', drawTop, !top),
              tile(
                'Shuffle',
                'shuffle',
                'shuffle',
                () => {
                  commit(shuffleBag(table, id));
                  haptics.deal();
                },
                !!piece.supply || items.length < 2,
              ),
              tile(
                'Search',
                'magnifyingglass',
                'search',
                () => {
                  setSearchLeaving(false);
                  setSearching(id);
                },
                !!piece.supply || !items.length,
              ),
              colorTile,
              scaleTile,
            ],
            [
              ...(top ? [{ kind: 'action' as const, label: 'Take out the top', onPress: () => commit(drawFromBag(table, id, newId(), true)) }] : []),
              ...(items.length ? [{ kind: 'action' as const, label: 'Empty it onto the table', onPress: () => commit(emptyBag(table, id, newId)) }] : []),
              ...(piece.supply ? [{ kind: 'action' as const, label: 'Stop being a supply', onPress: () => commit(endSupply(table, id)) }] : []),
              lockRow,
              // Its cards go to the trash, to be put back from there.
              { ...takeOffRow, onPress: () => commit(trashCards(removePiece(table, id), items.flatMap((i) => (i.card ? [i.card] : [])))) },
            ],
          );
        }
        case 'art':
          return focus(
            'Custom art',
            [
              tile('Rotate', 'rotate.right', 'rotate_right', () => openRotate([id]), !!piece.locked),
              scaleTile,
              // The system's menu, once this has gone (see choosePicture).
              tile('Picture', 'photo', 'image', () => setTimeout(() => choosePicture({ kind: 'art', id }), 450)),
            ],
            [
              // Among the cards, as a stack's Layer: under or over those it overlaps.
              {
                kind: 'pair',
                label: 'Layer',
                options: (['back', 'down', 'up', 'front'] as const).map((to) => ({
                  label: to === 'back' ? 'Back' : to === 'down' ? 'Down' : to === 'up' ? 'Up' : 'Front',
                  onPress: () => commit(layerArt(table, id, to, size)),
                })),
              },
              // A board or a map lies still; a figure is moved about.
              lockRow,
              takeOffRow,
            ],
          );
      }
      return null;
    }    if (menu.kind === 'pieceShape') {
      // One playing piece, or every one picked out.
      const targets = (table.pieces ?? []).filter((p) => p.kind === 'meeple' && (menu.id ? p.id === menu.id : pickedPieces.includes(p.id)));
      if (!targets.length) return null;
      const shapes = new Set(targets.map((p) => p.shape ?? 'meeple'));
      return {
        title: 'Shape',
        tiles: [],
        actions: PIECE_SHAPES.map(({ shape, name }) => ({
          label: `${name}${shapes.size === 1 && shapes.has(shape) ? '  ✓' : ''}`,
          onPress: () => commit(targets.reduce((t, p) => setPiece(t, p.id, { shape }), table)),
        })),
      };
    }
    if (menu.kind === 'dieKind') {
      // One die, or every one picked out.
      const dice = (table.pieces ?? []).filter((p) => p.kind === 'die' && (menu.id ? p.id === menu.id : pickedPieces.includes(p.id)));
      if (!dice.length) return null;
      const kinds = new Set(dice.map((d) => d.sides ?? 6));
      return {
        title: dice.length === 1 ? 'Change the die' : `Change ${dice.length} dice`,
        tiles: [],
        // Another kind of die: each keeps its number, if it has that face.
        actions: DIE_SIDES.map((n) => ({
          label: `d${n}${kinds.size === 1 && kinds.has(n) ? '  ✓' : ''}`,
          onPress: () => commit(dice.reduce((t, d) => setPiece(t, d.id, { sides: n, value: Math.min(d.value, n) }), table)),
        })),
      };
    }
    if (menu.kind === 'pieceColor') {
      // One counter or die, or every one picked out.
      const targets = (table.pieces ?? []).filter((p) => (menu.id ? p.id === menu.id : pickedPieces.includes(p.id)));
      if (!targets.length) return null;
      // A track's marker has a color of its own (the app's gold, unless one's chosen).
      const colorOf = (p: TablePiece) => (menu.marker ? (p.markerColor ?? colors.accent) : (p.color ?? defaultPieceColor(p)));
      const colorsNow = new Set(targets.map(colorOf));
      const current = colorsNow.size === 1 ? [...colorsNow][0] : undefined;
      const pick = (color: string | undefined) => {
        commit(targets.reduce((t, p) => setPiece(t, p.id, menu.marker ? { markerColor: color } : { color }), table));
        haptics.tick();
        setMenu(null);
      };
      return {
        title: menu.marker ? 'Marker color' : 'Color',
        tiles: [],
        // Swatches to tap; and back to its own color (a die's color for its kind, a counter's dark glass).
        banner: (
          <View style={styles.swatches}>
            {Object.entries(PIECE_COLORS).map(([name, hex]) => (
              <Pressable
                key={name}
                onPress={() => pick(hex)}
                accessibilityRole="button"
                accessibilityLabel={name}
                accessibilityState={{ selected: current === hex }}
                style={[styles.swatch, { backgroundColor: hex }, current === hex && styles.swatchOn]}
              />
            ))}
          </View>
        ),
        actions: targets.some((p) => (menu.marker ? p.markerColor : p.color))
          ? [{ label: menu.marker ? 'Back to gold' : targets.length === 1 ? 'Its own color' : 'Their own colors', onPress: () => pick(undefined) }]
          : [],
      };
    }
    if (menu.kind === 'scale') {
      const n = menu.stacks.length + menu.pieces.length;
      return {
        title: n === 1 ? 'Scale' : `Scale ${n} things`,
        tiles: [],
        banner: <ScaleControl value={scaleOf(table, menu.stacks, menu.pieces)} onChange={previewScale} />,
        actions: [],
      };
    }
    if (menu.kind === 'rotate') {
      const first = table.pieces?.find((p) => menu.pieces.includes(p.id));
      return {
        title: menu.pieces.length === 1 ? 'Rotation' : `Rotate ${menu.pieces.length}`,
        tiles: [],
        banner: <RotationControl value={first?.angle ?? 0} onChange={previewRotate} />,
        actions: [],
      };
    }
    if (menu.kind === 'components') {
      // A tile each, three to a row, with its name under it: what rolls, then what counts, then pieces, then the
      // table's layout. Those with more to choose (which die, which deck, which picture) open another menu.
      const next = (m: Menu) => () => setTimeout(() => setMenu(m), 250);
      const icon = (ios: string, android: string) => ({ ios, android, web: android }) as SheetTile['icon'];
      // Without Pro, all but the dice are tagged as Pro's, and open it (on the Playground too: it's to try what's there).
      const proTile = (t: SheetTile): SheetTile => (pro ? t : { ...t, pro: true, opensModal: false, onPress: () => setTimeout(openPro, 250) });
      return {
        title: 'Add to the table',
        tiles: [
          { label: 'Dice', icon: icon('dice', 'casino'), onPress: next({ kind: 'addDie' }) },
          ...(
            [
              { label: 'Coin', icon: icon('centsign.circle', 'toll'), onPress: () => addPieceToTable('coin') },
              { label: 'Spinner', icon: icon('arrow.clockwise.circle', 'autorenew'), onPress: () => addPieceToTable('spinner') },
              { label: 'Counter', icon: icon('plus.forwardslash.minus', 'exposure'), onPress: () => addPieceToTable('counter') },
              { label: 'Timer', icon: icon('timer', 'timer'), onPress: () => addPieceToTable('timer') },
              { label: 'Track', icon: icon('number.square', 'pin'), onPress: () => addPieceToTable('track') },
              { label: 'Pieces', icon: icon('figure.stand', 'person'), onPress: next({ kind: 'addShape' }) },
              { label: '1st player', icon: icon('star.circle', 'stars'), onPress: () => addPieceToTable('marker') },
              { label: 'Custom art', icon: icon('photo.on.rectangle', 'add_photo_alternate'), opensModal: true, onPress: () => (artCount < ART_MAX ? choosePicture({ kind: 'art' }) : artFull()) },
              { label: 'Bag', icon: icon('bag', 'shopping_bag'), onPress: () => addPieceToTable('bag') },
              { label: 'Text', icon: icon('textformat', 'title'), onPress: () => addPieceToTable('text') },
              { label: 'Zone', icon: icon('rectangle.dashed', 'crop_free'), onPress: () => addPieceToTable('zone') },
            ] as SheetTile[]
          ).map(proTile),
        ],
        actions: [],
      };
    }
    if (menu.kind === 'addCards') {
      const icon = (ios: string, android: string) => ({ ios, android, web: android }) as SheetTile['icon'];
      return {
        title: 'Add cards',
        tiles: [
          { label: 'Full decks', icon: icon('rectangle.stack', 'layers'), onPress: () => setTimeout(() => setMenu({ kind: 'addDeck' }), 250) },
          // Its own screen, which iOS can only show once this menu has gone.
          { label: 'Single cards', icon: icon('rectangle.portrait', 'crop_portrait'), opensModal: true, onPress: () => setAddingCards(true) },
        ],
        actions: [],
      };
    }
    if (menu.kind === 'addShape') {
      return {
        title: 'Add a piece',
        tiles: [],
        actions: PIECE_SHAPES.map(({ shape, name }) => ({ label: name, onPress: () => addPieceToTable('meeple', undefined, shape) })),
      };
    }
    if (menu.kind === 'addDie') {
      return {
        title: dieCount === 1 ? 'Add a die' : `Add ${dieCount} dice`,
        tiles: [],
        // How many first (it's kept for next time), then which kind: each die as it looks on the table.
        banner: (
          <View>
          <CountStepper value={dieCount} onChange={setDieCount} max={DICE_AT_ONCE} label="How many dice" />
          <View style={styles.dicePicks}>
            {DIE_SIDES.map((n) => (
              <Pressable
                key={n}
                onPress={() => {
                  setMenu(null);
                  addDice(n, dieCount);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${dieCount === 1 ? 'A' : dieCount} d${n}`}
                style={({ pressed }) => [styles.dicePick, pressed && { opacity: 0.6 }]}>
                <View style={styles.dicePickArt}>
                  <TablePieceView piece={{ ...newPiece('die', `pick${n}`, { x: PIECE_SIZE.die.w / 2, y: PIECE_SIZE.die.h / 2 }, n) }} />
                </View>
                <Text style={styles.dicePickText}>d{n}</Text>
              </Pressable>
            ))}
          </View>
          </View>
        ),
        actions: [],
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
      hidden: !!searching,
    });
  }, [history.length, future.length, carrying, onControls, table, latestUndo, latestRedo, searching]);

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
  /** A piece's menu is laid out as a card's (see CardFocus), not as a sheet. */
  const menuIsPiece = menu?.kind === 'piece';
  /** How a piece is moved for now: dragged (with the finger), with picked-out cards being dragged, or not at all. */
  /** Where a piece is drawn for now: as far as it's been dragged, or gone with dragged cards; or where it lies. */
  const movedTo = (p: TablePiece) =>
    pieceDrag?.ids.includes(p.id)
      ? { x: p.x + pieceDrag.dx, y: p.y + pieceDrag.dy }
      : groupMoving && groupShift && pickedPieces.includes(p.id)
        ? { x: p.x + groupShift.dx, y: p.y + groupShift.dy }
        : undefined;
  /** A piece as it's drawn on the table (always the same view, never drawn afresh as it moves). */
  const drawPiece = (p: TablePiece) => {
    const dragged = !!pieceDrag?.ids.includes(p.id);
    const turn = dragged && pieceDrag?.lead === p.id ? pieceDrag.turn : undefined;
    return (
      <TablePieceView
        key={p.id}
        piece={p}
        at={movedTo(p)}
        turn={turn}
        rollKey={rolls[p.id]?.key}
        rollFrom={rolls[p.id]}
        selected={pickedPieces.includes(p.id)}
      />
    );
  };
  /** The custom art lying just over a stack (or, for null, under every card), where it lies. */
  const stackIds = new Set(table?.stacks.map((s) => s.id));
  const artOver = (stackId: string | null) =>
    (table?.pieces ?? [])
      .filter((p) => p.kind === 'art' && (stackId ? p.over === stackId : !p.over || !stackIds.has(p.over)))
      .map(drawPiece);
  const theme = themeOf(table.background);
  const ink = (alpha: number) => `rgba(${theme.ink},${alpha})`;
  const arrivingStack = arriving ? table.stacks.find((s) => s.id === arriving.stackId) : undefined;
  const arrivingTop = arrivingStack?.cards[arrivingStack.cards.length - 1];
  const riffleStacks = riffling ? table.stacks.filter((s) => riffling.stackIds.includes(s.id)) : [];
  const heldTop = held ? held.cards[held.cards.length - 1] : null;
  const heldDeck = heldTop ? getDeck(heldTop.deckId) : undefined;
  const heldSize = heldTop ? cardSizeOf(heldTop, size) : null;
  const zoomDeck = zoomed ? getDeck(zoomed.deckId) : undefined;
  const zoomCard = zoomed ? cardOf(zoomed) : undefined;

  return (
    <View style={[styles.root, { backgroundColor: theme.outside }]}>
      <GestureDetector gesture={gesture}>
        <View style={StyleSheet.absoluteFill} onLayout={layOut}>
          {/* The table, seen through the camera. */}
          <Animated.View style={[styles.world, worldStyle]} pointerEvents="none">
            <View style={[styles.tableEdge, { backgroundColor: theme.rim }]} />
            {/* The theme's cloth, under a lighter weave (or, classic, the felt itself). */}
            {theme.cloth ? <View style={[styles.cloth, { backgroundColor: theme.cloth }]} /> : null}
            <Image source={require('../../assets/textures/felt.png')} resizeMode="repeat" style={[styles.felt, theme.cloth && styles.feltOverCloth]} />
            {table.showGrid ? <GridLines step={gridStep} /> : null}
            {!table.showGrid && gridPeek ? (
              <Animated.View style={[StyleSheet.absoluteFill, gridFadeStyle]}>
                <GridLines step={gridStep} />
              </Animated.View>
            ) : null}
            {/* Zones, painted on the cloth: under every card. */}
            {(table.pieces ?? [])
              .filter((p) => p.kind === 'zone')
              .map((p) => {
                const shown = zoneSize?.id === p.id ? { ...p, ...resizeZone(p, zoneSize.w, zoneSize.h) } : p;
                return <TablePieceView key={p.id} piece={shown} at={movedTo(p)} />;
              })}
            {/* Custom art under every card, then the stacks, each with any custom art lying just over it. */}
            {artOver(null)}
            {table.stacks.map((s) => (
              <Fragment key={s.id}>
              {groupMoving && chosenIds.has(s.id) && !s.locked ? null : (
                <StackView
                  key={s.id}
                  stack={s}
                  deck={decksById.get(s.cards[s.cards.length - 1].deckId)}
                  decks={decksById}
                  size={cardSizeOf(s.cards[s.cards.length - 1], size)}
                  // While carried, its carried cards are out of sight (the rest still show); while riffled, all of it.
                  hidden={
                    (riffling?.started && riffling.stackIds.includes(s.id)) || arriving?.stackId === s.id
                      ? s.cards.map((c) => c.iid).join(',')
                      : held
                        ? s.cards.filter((c) => heldIds.has(c.iid)).map((c) => c.iid).join(',')
                        : ''
                  }
                  target={target === s.id}
                  selected={chosenIds.has(s.id)}
                  showCount={!table.hideCounts}
                />
              )}
              {artOver(s.id)}
              </Fragment>
            ))}
            {/* Counters and dice, above every card (and custom art, while it's being moved). */}
            {(table.pieces ?? []).map((p) => (p.kind === 'zone' || p.kind === 'art' ? null : drawPiece(p)))}
            {/* A piece just taken out of a bag, under the finger (it's on the table once it's put down). */}
            {pieceDrag?.out ? (
              <TablePieceView
                key={`out:${pieceDrag.out.piece.id}`}
                piece={pieceDrag.out.piece}
                at={{ x: pieceDrag.out.piece.x + pieceDrag.dx, y: pieceDrag.out.piece.y + pieceDrag.dy }}
              />
            ) : null}
            {/* Stacks being shuffled: the riffle, played on each where it lies, turned as it is (the first one says when). */}
            {riffling
              ? riffleStacks.map((rs, i) => {
                  const top = rs.cards[rs.cards.length - 1];
                  const deck = decksById.get(top.deckId);
                  if (!deck) return null;
                  const rsSize = cardSizeOf(top, size);
                  return (
                    <View
                      key={`riffle:${rs.id}`}
                      style={[
                        styles.stack,
                        { left: rs.x - rsSize.w / 2, top: rs.y - rsSize.h / 2, width: rsSize.w, height: rsSize.h, transform: [{ rotate: `${rs.angle}deg` }] },
                      ]}>
                      <Riffle
                        key={riffling.key}
                        deck={deck}
                        width={rsSize.w}
                        onStart={() => i === 0 && setRiffling((r) => (r ? { ...r, started: true } : r))}
                        onDone={() => i === 0 && setRiffling(null)}
                      />
                    </View>
                  );
                })
              : null}
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
                      size={cardSizeOf(s.cards[s.cards.length - 1], size)}
                      hidden=""
                      target={false}
                      selected
                      showCount={!table.hideCounts}
                    />
                  ))}
                {flyers.map((f) => {
                  const deck = decksById.get(f.card.deckId);
                  return deck ? (
                    <GatherFlyer
                      key={f.key}
                      flyer={f}
                      deck={deck}
                      size={cardSizeOf(f.card, size)}
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
                      size={cardSizeOf(f.card, size)}
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
          <Animated.View style={[styles.trayWrap, { top: trayOpenTop - HAND_TAB_H, height: trayH + HAND_TAB_H }, trayStyle, trayGone && { display: 'none' }]}>
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
                    style={({ pressed }) => [
                      styles.tab,
                      { backgroundColor: pressed ? theme.tabPressed : on ? theme.tabOn : theme.tab, borderColor: theme.shine },
                    ]}>
                    <Text style={[styles.tabText, { color: ink(on ? 0.95 : 0.6) }]} numberOfLines={1}>
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
              <WoodRail colors={theme.rail} shine={theme.shine} />
              {/* More of the tray below its bottom (off screen), so its spring's bounce never shows a gap under it. */}
              <View style={[styles.overshoot, { top: trayH, height: SPRING_OVERSHOOT, backgroundColor: theme.rail[2] }]} />
              <View style={[styles.groove, { top: HAND_TOP_PAD, height: handCardH + HAND_ROW_PAD * 2 }]} />
              {hand.length === 0 && handGap === null ? (
                <Text style={[styles.trayEmpty, { top: rowTop + handCardH / 2 - 10, color: ink(0.45) }]}>Drag cards here to put them in {table.handNames[handIndex]}</Text>
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
                      {/* Folded away, the hand's cards show their backs: nobody sees them as the phone goes round. */}
                      <CardView deck={deck} card={cardOf(c)} faceUp={c.faceUp && !folded} width={handWidthOf(c)} />
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

          {/* The tools drawer, on its edge: its tab pulls it out, and tucks it away again (and can be dragged). */}
          {/* Not while searching: the search is all there is. */}
          <Animated.View
            style={[
              styles.tools,
              toolsSpot.side === 'left' ? { left: 0 } : { right: 0 },
              { top: toolsTop, height: toolsH, zIndex: 10 },
              toolsStyle,
              !!searching && styles.hidden,
            ]}
            pointerEvents={searching ? 'none' : 'box-none'}>
            {/* More of the panel past the screen's edge, so its spring's bounce never shows a gap beside it. */}
            {toolsDragging ? null : (
              <View
                style={[
                  styles.overshoot,
                  styles.toolsOvershoot,
                  { top: 0, height: toolsH, width: SPRING_OVERSHOOT, left: toolsSpot.side === 'left' ? -SPRING_OVERSHOOT : TOOLS_TAB_W + TOOLS_W },
                ]}
              />
            )}
            <ScrollView
              style={[styles.toolsPanel, { height: toolsH }, toolsSpot.side === 'left' ? styles.toolsPanelLeft : styles.toolsPanelRight, panelCorners, toolsDragging && styles.hidden]}
              contentContainerStyle={{ gap: 10 }}
              showsVerticalScrollIndicator={false}>
              <Text style={styles.toolsTitle}>Tools</Text>
              {(
                [
                  ['square.grid.3x3', 'grid_on', 'Snap to grid', gridOn, (on: boolean) => ({ snapToGrid: on }), 'Cards put down line up on the grid. Cards already on the table stay put.'],
                  ['grid', 'grid_4x4', 'Show grid', !!table.showGrid, (on: boolean) => ({ showGrid: on }), 'Draws the grid’s lines on the table.'],
                  ['number', 'tag', 'Stack counts', !table.hideCounts, (on: boolean) => ({ hideCounts: !on }), 'Shows how many cards each stack holds.'],
                  ['lock', 'lock', 'Lock camera', !!table.lockCamera, (on: boolean) => ({ lockCamera: on }), 'The view stays put: sliding, zooming and turning the table do nothing. Cards still move.'],
                ] as const
              ).map(([ios, android, label, value, change, hint]) => (
                <View key={label} style={styles.toolRow}>
                  <SymbolView name={{ ios, android, web: android }} size={18} tintColor={colors.text} />
                  <Text style={styles.toolText}>{label}</Text>
                  <Switch
                    value={value}
                    onValueChange={(on) => {
                      updateSandbox({ ...table, ...change(on) });
                      haptics.tick();
                    }}
                    trackColor={{ true: colors.accent, false: undefined }}
                    accessibilityLabel={label}
                    accessibilityHint={hint}
                  />
                </View>
              ))}
              {/* The grid's size: its spacing, for snapping and its lines (shown for a moment as it's chosen). */}
              <Text style={styles.toolLabel}>Grid size</Text>
              <View style={styles.toolSegment}>
                {(Object.entries(GRID_SIZES) as [keyof typeof GRID_SIZES, number][]).map(([name, step]) => (
                  <Pressable
                    key={name}
                    onPress={() => {
                      updateSandbox({ ...table, gridStep: step });
                      haptics.tick();
                      // The lines for a moment, to see the spacing chosen.
                      const peek = Date.now();
                      latestPeek.set(peek);
                      setGridPeek(peek);
                      gridFade.set(1);
                      // Then they fade away (unless another size has been chosen meanwhile), and go.
                      setTimeout(() => {
                        if (latestPeek.get() === peek) gridFade.set(withTiming(0, { duration: GRID_FADE_MS }));
                      }, GRID_PEEK_MS);
                      setTimeout(() => {
                        if (latestPeek.get() === peek) setGridPeek(0);
                      }, GRID_PEEK_MS + GRID_FADE_MS);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`${name} grid`}
                    accessibilityState={{ selected: gridStep === step }}
                    style={[styles.toolSegmentItem, gridStep === step && styles.toolSegmentOn]}>
                    <Text style={[styles.toolSegmentText, gridStep === step && { color: colors.accentText }]}>
                      {name === 'small' ? 'Small' : name === 'medium' ? 'Medium' : 'Large'}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <View style={styles.toolDivider} />
              {(
                [
                  [
                    'arrow.up.left.and.arrow.down.right',
                    'fit_screen',
                    'Fit All',
                    () => {
                      fitView(table);
                      // After a few times: the quick pinch does this too.
                      offerTipAfterUses('tables-quick-pinch', undefined, 900);
                    },
                  ],
                  ['rectangle.portrait.on.rectangle.portrait', 'style', 'Add Cards', () => (!pro && playgroundHere ? playgroundOnly() : setMenu({ kind: 'addCards' }))],
                  [
                    'die.face.5',
                    'casino',
                    'Add Components',
                    () => {
                      // In the middle of the view (holding the table adds right where it's held).
                      setAddAt(null);
                      setMenu({ kind: 'components' });
                    },
                  ],
                  // Once something's been copied.
                  ...(clip ? ([['doc.on.clipboard', 'content_paste', 'Paste', () => pasteClip(true)]] as const) : []),
                  ['wand.and.stars', 'auto_fix_high', 'Clean Up', cleanUp],
                  ['rectangle.stack', 'layers', 'Gather by Deck', gatherUp],
                  ['trash', 'delete', `Trash${table.trash?.length ? ` (${table.trash.length})` : ''}`, () => setTrashOpen(true)],
                ] as const
              ).map(([ios, android, label, run]) => (
                <Pressable
                  key={ios}
                  onPress={() => {
                    showTools(false);
                    run();
                  }}
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.toolButton, pressed && { opacity: 0.6 }]}>
                  <SymbolView name={{ ios, android, web: android }} size={17} tintColor={colors.accent} />
                  <Text style={styles.toolButtonText}>{label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            {/* The tab: tap to open or close; drag (closed) up or down the edge, or across to the other edge. */}
            <View
              {...toolsDrag.responder.panHandlers}
              hitSlop={toolsSpot.side === 'left' ? { right: 10, top: 6, bottom: 6 } : { left: 10, top: 6, bottom: 6 }}
              accessible
              accessibilityRole="button"
              accessibilityLabel={toolsOpen ? 'Hide tools' : 'Show tools'}
              accessibilityHint="Drag to move it up or down, or to the other side."
              onAccessibilityTap={() => showTools(!toolsOpen)}
              style={[styles.toolsTab, { top: tabInDrawer }, toolsSpot.side === 'left' ? styles.toolsTabLeft : styles.toolsTabRight, toolsDragging && styles.toolsTabLifted]}>
              <SymbolView
                name={
                  toolsOpen
                    ? toolsSpot.side === 'left'
                      ? { ios: 'chevron.left', android: 'chevron_left', web: 'chevron_left' }
                      : { ios: 'chevron.right', android: 'chevron_right', web: 'chevron_right' }
                    : { ios: 'wrench.and.screwdriver', android: 'build', web: 'build' }
                }
                size={14}
                weight="semibold"
                tintColor={colors.accent}
              />
            </View>
          </Animated.View>

          {/*
            The flip button: while cards (or a group) are carried, tapped with another finger to turn them over; and
            whenever cards are picked out, to turn them over where they lie.
          */}
          {held || groupMoving || chosen.length ? (
            <View
              pointerEvents="none"
              style={[styles.flipButton, { left: flipButton.x, top: flipButton.y, width: FLIP_SIZE, height: FLIP_SIZE, borderRadius: FLIP_SIZE / 2 }, toolsOpen && !held && !groupMoving && styles.waiting]}>
              <SymbolView name={FLIP_ICON} size={28} weight="semibold" tintColor={colors.accentText} />
            </View>
          ) : null}

          {/* With a stack of two or more picked out (not dragged): above the flip button, one to shuffle it. */}
          {!held && !groupMoving && canShuffle ? (
            <View
              pointerEvents="none"
              style={[styles.flipButton, { left: shuffleButton.x, top: shuffleButton.y, width: FLIP_SIZE, height: FLIP_SIZE, borderRadius: FLIP_SIZE / 2 }, toolsOpen && styles.waiting]}>
              <SymbolView name={{ ios: 'shuffle', android: 'shuffle', web: 'shuffle' }} size={26} weight="semibold" tintColor={colors.accentText} />
            </View>
          ) : null}

          {/* With two or more picked out: one to gather them all into a stack (just above the flip button while they're dragged). */}
          {!held && chosen.length > 1 ? (
            <View
              pointerEvents="none"
              style={[styles.flipButton, { left: flipButton.x, top: groupMoving ? stackButton.y : gatherButton.y, width: FLIP_SIZE, height: FLIP_SIZE, borderRadius: FLIP_SIZE / 2 }, toolsOpen && !held && !groupMoving && styles.waiting]}>
              <SymbolView name={{ ios: 'square.stack.3d.down.right', android: 'layers', web: 'layers' }} size={26} weight="semibold" tintColor={colors.accentText} />
            </View>
          ) : null}

          {/* With cards picked out (not dragged): the selection's other options, taking it off the table among them. */}
          {!held && !groupMoving && chosen.length ? (
            <View
              pointerEvents="none"
              style={[styles.flipButton, styles.moreButtonLook, { left: moreButton.x, top: moreButton.y, width: FLIP_SIZE, height: FLIP_SIZE, borderRadius: FLIP_SIZE / 2 }, toolsOpen && styles.waiting]}>
              <SymbolView name={{ ios: 'ellipsis', android: 'more_horiz', web: 'more_horiz' }} size={24} weight="bold" tintColor={colors.text} />
            </View>
          ) : null}

          {/* With several dice (or coins, or spinners) picked out, and nothing else: one to roll (flip, spin) them all. */}
          {!held && !groupMoving && rollKind ? (
            <View
              pointerEvents="none"
              style={[styles.flipButton, { left: rollButton.x, top: rollButton.y, width: FLIP_SIZE, height: FLIP_SIZE, borderRadius: FLIP_SIZE / 2 }, toolsOpen && styles.waiting]}>
              <SymbolView
                name={
                  rollKind === 'coin'
                    ? { ios: 'centsign.circle', android: 'toll', web: 'toll' }
                    : rollKind === 'spinner'
                      ? { ios: 'arrow.clockwise.circle', android: 'autorenew', web: 'autorenew' }
                      : { ios: 'dice', android: 'casino', web: 'casino' }
                }
                size={26}
                weight="semibold"
                tintColor={colors.accentText}
              />
            </View>
          ) : null}
          {/* With several dice picked out (and nothing else): one to line them up in a tight grid. */}
          {!held && !groupMoving && rollKind === 'die' ? (
            <View
              pointerEvents="none"
              style={[styles.flipButton, { left: diceGridButton.x, top: diceGridButton.y, width: FLIP_SIZE, height: FLIP_SIZE, borderRadius: FLIP_SIZE / 2 }, toolsOpen && styles.waiting]}>
              <SymbolView name={{ ios: 'square.grid.2x2', android: 'grid_view', web: 'grid_view' }} size={24} weight="semibold" tintColor={colors.accentText} />
            </View>
          ) : null}

          {/* A stack just brought onto the table, flying in from the top of the screen. */}
          {arriving && arrivingTop && decksById.get(arrivingTop.deckId) ? (
            <ArrivalFlyer
              key={arriving.key}
              deck={decksById.get(arrivingTop.deckId)!}
              card={arrivingTop}
              size={cardSizeOf(arrivingTop, size)}
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
                  width: cardSizeOf(groupLeadTop, size).w,
                  height: cardSizeOf(groupLeadTop, size).h,
                  left: -cardSizeOf(groupLeadTop, size).w / 2,
                  top: -cardSizeOf(groupLeadTop, size).h / 2,
                },
                heldStyle,
              ]}>
              <CardView
                deck={decksById.get(groupLeadTop.deckId)!}
                card={cardOf(groupLeadTop)}
                faceUp={groupLeadTop.faceUp}
                width={cardSizeOf(groupLeadTop, size).w}
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
                size={cardSizeOf(f.card, size)}
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

          {/* The search: over everything, a layer of the table (not a window), so cards can be taken out of it. */}
          {searchMounted ? (
            <StackSearchPanel
              title={
                searchStack
                  ? `Searching ${searchStack.cards.length} ${searchStack.cards.length === 1 ? 'card' : 'cards'}`
                  : searchBag
                    ? `Searching the bag · ${bagItems(searchBag).length}`
                    : 'Search'
              }
              entries={
                searchStack
                  ? [...searchStack.cards].reverse().map((card) => ({ key: card.iid, card }))
                  : searchBag
                    ? [...bagItems(searchBag)].reverse().map((i) => ({ key: itemKey(i), card: i.card, piece: i.piece }))
                    : []
              }
              noun={searchBag ? ['thing', 'things'] : undefined}
              canTakeOut={!searchBag}
              decks={decksById}
              visible={!!searching && (!!searchStack || !!searchBag)}
              leaving={searchLeaving}
              onReorder={(picked, to) => {
                if (searchStack) commit(reorderStack(table, searchStack.id, picked, to));
                else if (searchBag) commit(reorderBag(table, searchBag.id, picked, to));
              }}
              onTakeOut={(iids, finger) => {
                searchTake.set(iids);
                setSearchLeaving(true);
                takeOut.set({ active: true, x: finger.x, y: finger.y });
                // Under the finger straight away, not just once it moves.
                gestureState.get().api?.startTakeOut(finger);
              }}
              cardActions={searchBag ? bagSearchActions : searchActions}
              pickActions={searchBag ? bagPickActions : searchPickActions}
              onClose={endSearch}
              onClosed={() => setSearchMounted(false)}
            />
          ) : null}
        </View>
      </GestureDetector>

      {/* A card or stack's menu: the card brought up close, its options under it. */}
      <CardFocus
        visible={!!sheet && (menu?.kind === 'stack' || menu?.kind === 'hand' || menuIsPiece)}
        card={sheet && 'header' in sheet ? sheet.header : null}
        spotlight={spotlight}
        onOptionsTop={setOptionsTop}
        near={spotNear}
        title={sheet?.title}
        tiles={sheet?.tiles ?? []}
        rows={sheet && 'rows' in sheet ? sheet.rows : undefined}
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
          ) : undefined
        }
        onClose={() => {
          setMenu(null);
          setDealingFrom(null);
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
      <TrashModal
        visible={trashOpen}
        cards={table.trash ?? []}
        decks={decksById}
        onPutBack={(iids) => {
          const back = (table.trash ?? []).filter((c) => iids.includes(c.iid)).map((c) => ({ ...c, faceUp: true }));
          arrive(putOnTable(takeFromTrash(table, iids), back, { ...viewMiddle(), angle: 0 }, newId()));
        }}
        onEmpty={() => commit({ ...table, trash: [] })}
        onClose={() => setTrashOpen(false)}
      />
      <AddCardsModal visible={addingCards} decks={decks} onAdd={addCardsToTable} onClose={() => setAddingCards(false)} />
      {/* The table's menu, and choosing a deck to add. */}
      <ActionSheet
        visible={!!sheet && (menu?.kind === 'table' || menu?.kind === 'addDeck' || menu?.kind === 'color' || menu?.kind === 'selection' || menu?.kind === 'dieKind' || menu?.kind === 'pieceColor' || menu?.kind === 'components' || menu?.kind === 'addDie' || menu?.kind === 'scale' || menu?.kind === 'rotate' || menu?.kind === 'pieceShape' || menu?.kind === 'addShape' || menu?.kind === 'addCards')}
        title={sheet?.title}
        banner={sheet && 'banner' in sheet ? sheet.banner : undefined}
        tiles={sheet?.tiles}
        actions={sheet?.actions ?? []}
        // Scaling is kept as it's made: put away, it's done (and one undo).
        closeLabel={menu?.kind === 'scale' || menu?.kind === 'rotate' ? 'Done' : undefined}
        onClose={() => {
          finishScale();
          setMenu(null);
        }}
      />
    </View>
  );
}

/**
 * The grid's lines across the whole table, shown while snapping is on (for now, for trying it out: the grid is
 * meant to be invisible). Cards snap to their crossings and the middles of their squares.
 */
const GridLines = memo(function GridLines({ step }: { step: number }) {
  return [
    ...Array.from({ length: Math.floor(TABLE_W / step) + 1 }, (_, i) => (
      <View key={`v${i}`} style={[styles.gridLine, { left: i * step - 0.75, top: 0, width: 1.5, height: TABLE_H }]} />
    )),
    ...Array.from({ length: Math.floor(TABLE_H / step) + 1 }, (_, i) => (
      <View key={`h${i}`} style={[styles.gridLine, { top: i * step - 0.75, left: 0, height: 1.5, width: TABLE_W }]} />
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

/**
 * Where a lasso's finger has come back along its own line, if it has: the earliest of the line's recent points
 * (its last LASSO_RETRACE_LENGTH or so) it's back beside, heading back the way the line went there. Coming round to
 * close the loop doesn't count: that's far back along the line, and heading on, not back. -1 if not.
 */
function lassoRetrace(line: { x: number; y: number }[], to: { x: number; y: number }): number {
  const last = line[line.length - 1];
  if (!last || line.length < 3) return -1;
  const move = { x: to.x - last.x, y: to.y - last.y };
  const moved = Math.hypot(move.x, move.y);
  if (!moved) return -1;
  let found = -1;
  let along = 0;
  // From the newest back, skipping the last point (always right beside the finger).
  for (let i = line.length - 2; i >= 0; i--) {
    along += Math.hypot(line[i + 1].x - line[i].x, line[i + 1].y - line[i].y);
    if (along > LASSO_RETRACE_LENGTH) break;
    if (Math.hypot(to.x - line[i].x, to.y - line[i].y) > LASSO_RETRACE_REACH) continue;
    // Heading back: against the way the line went from this point.
    const d = { x: line[i + 1].x - line[i].x, y: line[i + 1].y - line[i].y };
    const dLen = Math.hypot(d.x, d.y);
    if (dLen && (move.x * d.x + move.y * d.y) / (moved * dLen) < -0.5) found = i;
  }
  return found;
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
  showCount = true,
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
  /** Whether a stack shows how many cards it holds (the table's choice). */
  showCount?: boolean;
}) {
  const gone = new Set(hidden ? hidden.split(',') : []);
  const shown = gone.size ? stack.cards.filter((c) => !gone.has(c.iid)) : stack.cards;
  // Turned over, the whole stack turns: the paper edges under the top card turn edge-on and back with it (the card
  // does its own turn), so it doesn't look as if only the top card flipped.
  const faceUp = shown[shown.length - 1]?.faceUp;
  const [edgeTurn] = useState(() => new RNAnimated.Value(0));
  const [lastFaceUp, setLastFaceUp] = useState(faceUp);
  const [flips, setFlips] = useState(0);
  if (faceUp !== lastFaceUp) {
    setLastFaceUp(faceUp);
    if (faceUp !== undefined && lastFaceUp !== undefined) setFlips((n) => n + 1);
  }
  useEffect(() => {
    if (!flips || prefersReducedMotion()) return;
    const half = (toValue: number, easing: (t: number) => number) =>
      RNAnimated.timing(edgeTurn, { toValue, duration: HALF_FLIP_MS, easing, useNativeDriver: true });
    RNAnimated.sequence([half(1, Easing.in(Easing.quad)), half(0, Easing.out(Easing.quad))]).start();
  }, [flips, edgeTurn]);
  const [edgeTransform] = useState(() => [
    { perspective: 800 },
    { rotateY: edgeTurn.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '90deg'] }) },
    { scale: edgeTurn.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) },
  ]);
  if (!shown.length || !deck) return null;
  const top = shown[shown.length - 1];
  const topDeck = decks.get(top.deckId) ?? deck;
  const card = topDeck.cards.find((c) => c.id === top.cardId);
  // No paper edges under a see-through card (a die-cut shape): they'd show round it.
  const showing = top.faceUp ? card?.image : (card?.back ?? topDeck.backImage);
  const edges = isSeeThrough(showing) ? 0 : Math.min(2, shown.length - 1);
  return (
    <View
      style={[
        styles.stack,
        { left: stack.x - size.w / 2, top: stack.y - size.h / 2, width: size.w, height: size.h, transform: [{ rotate: `${stack.angle}deg` }] },
      ]}>
      <RNAnimated.View style={[StyleSheet.absoluteFill, { transform: edgeTransform }]} pointerEvents="none">
        {Array.from({ length: edges }, (_, i) => (
          <View key={i} style={[styles.edge, { left: (edges - i) * 2, top: (edges - i) * 2, width: size.w, height: size.h }]} />
        ))}
      </RNAnimated.View>
      {/*
        Its shadow. A rounded card's is drawn as a box shadow (worked out once, not traced from the card's picture
        every frame as the table moves: with hundreds of cards, that made sliding and zooming slow). A die-cut card
        keeps the traced one, which follows its shape.
      */}
      <View style={isSeeThrough(showing) ? styles.shadow : [styles.boxShadow, { width: size.w, height: size.h, borderRadius: cardRadius(topDeck, size.w) }]}>
        <CardView deck={topDeck} card={card} faceUp={top.faceUp} width={size.w} sharp />
      </View>
      {shown.length > 1 && showCount ? (
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
  // The same shadow, as a box shadow (see StackView).
  boxShadow: { boxShadow: '1px 3px 8px rgba(0, 0, 0, 0.45)' },
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
  // A counter's or die's colors to pick from (see the pieceColor menu).
  swatches: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 14, paddingVertical: 8, paddingHorizontal: 12 },
  // The dice to choose from, drawn as they'll look on the table.
  dicePicks: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 18, paddingVertical: 12, paddingHorizontal: 12 },
  dicePick: { width: 72, alignItems: 'center', gap: 6 },
  dicePickArt: { width: 60, height: 60 },
  dicePickText: { color: colors.text, fontSize: 14, fontWeight: '700' },
  swatch: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: 'rgba(255,255,255,0.25)' },
  swatchOn: { borderWidth: 3, borderColor: colors.accent },
  // The grid's lines, shown for now (for trying the grid out).
  gridLine: { position: 'absolute', backgroundColor: 'rgba(255,255,255,0.13)' },
  // The tools drawer: a panel off the left (or right) edge, with a tab on its inner edge to pull it out by.
  tools: { position: 'absolute', width: TOOLS_W + TOOLS_TAB_W },
  toolsPanel: {
    position: 'absolute',
    top: 0,
    width: TOOLS_W,
    padding: 14,
    gap: 12,
    backgroundColor: 'rgba(8,18,26,0.9)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  toolsPanelLeft: { left: 0, borderTopRightRadius: TOOLS_PANEL_RADIUS, borderBottomRightRadius: TOOLS_PANEL_RADIUS, borderLeftWidth: 0 },
  toolsPanelRight: { left: TOOLS_TAB_W, borderTopLeftRadius: TOOLS_PANEL_RADIUS, borderBottomLeftRadius: TOOLS_PANEL_RADIUS, borderRightWidth: 0 },
  toolsTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  toolRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  toolText: { flex: 1, color: colors.text, fontSize: 15, fontWeight: '600' },
  toolLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '600', marginBottom: -4 },
  toolSegment: { flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 9, padding: 2 },
  toolSegmentItem: { flex: 1, paddingVertical: 6, borderRadius: 7, alignItems: 'center' },
  toolSegmentOn: { backgroundColor: colors.accent },
  toolSegmentText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  toolDivider: { height: StyleSheet.hairlineWidth, backgroundColor: 'rgba(255,255,255,0.18)', marginVertical: 2 },
  toolButton: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6 },
  toolButtonText: { color: colors.text, fontSize: 15, fontWeight: '600' },
  toolsTab: {
    position: 'absolute',
    width: TOOLS_TAB_W,
    height: TOOLS_TAB_H,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(8,18,26,0.9)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  toolsTabLeft: { left: TOOLS_W, borderTopRightRadius: 12, borderBottomRightRadius: 12, borderLeftWidth: 0 },
  toolsTabRight: { left: 0, borderTopLeftRadius: 12, borderBottomLeftRadius: 12, borderRightWidth: 0 },
  // Lifted to be moved: outlined in gold all round, rounded all round (it's off its edge). Each side and corner is
  // set, since the edge styles above set them one by one, which would win over the all-round ones.
  toolsTabLifted: {
    borderColor: colors.accent,
    borderTopWidth: 2,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderRightWidth: 2,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
    borderBottomLeftRadius: 12,
    borderBottomRightRadius: 12,
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
  /** The selection's buttons while the tools lie over them: dimmed, and doing nothing till they're put away. */
  waiting: { opacity: 0.5 },
  moreButtonLook: { backgroundColor: 'rgba(8,18,26,0.85)', borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.3)' },
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
  // Past the tray's (or tools panel's) outer edge, off screen, for the spring's bounce.
  overshoot: { position: 'absolute', left: 0, right: 0, pointerEvents: 'none' },
  toolsOvershoot: { right: undefined, backgroundColor: 'rgba(8,18,26,0.9)' },
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
  tabPressed: { backgroundColor: '#3a2212' },
  tabText: { color: 'rgba(255,240,220,0.6)', fontSize: 12, fontWeight: '700' },
});
