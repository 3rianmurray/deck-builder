import { router } from 'expo-router';
import { memo, useEffect, useMemo, useState } from 'react';
import { Alert, Image, Platform, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDecks } from '../lib/DecksContext';
import * as haptics from '../lib/haptics';
import { newId } from '../lib/id';
import {
  addDeck,
  CARD_W,
  cameraAngle,
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
  stackAt,
  stackTargetAt,
  startCamera,
  TABLE_H,
  TABLE_W,
  take,
  toScreen,
  toTable,
  turnStack,
} from '../lib/sandbox';
import type { Camera, CardSize, SandboxCard, SandboxStack, SandboxTable, Source } from '../lib/sandbox';
import { updateSandbox, useSandbox } from '../lib/sandboxStore';
import { cardRatio } from '../lib/types';
import type { Deck } from '../lib/types';
import { colors } from '../theme';
import { ActionSheet } from './ActionSheet';
import type { SheetTile } from './ActionSheet';
import { CardView } from './CardView';
import { CardZoom } from './CardZoom';
import type { TableControls } from './TableTopBar';
import { Text } from './Text';

/** Steps of undo kept. */
const UNDO_STEPS = 30;
/** A finger moving less than this before lifting is a tap. */
const TAP_SLOP = 8;
/** The hand tray: its height, and its cards' width. */
const HAND_H = 128;
const HAND_CARD_W = 70;
/** A held card is drawn a little bigger than it lies, as if lifted. */
const LIFT = 1.08;

const FLIP_ICON = { ios: 'arrow.trianglehead.2.clockwise.rotate.90', android: 'flip', web: 'flip' } as const;

/** What a menu is open on. */
type Menu =
  | { kind: 'stack'; id: string }
  | { kind: 'hand'; hand: number; iid: string }
  | { kind: 'table' }
  | { kind: 'addDeck' };

/** A card being carried by a finger. */
interface Held {
  src: Source;
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
  const [handIndex, setHandIndex] = useState(0);
  const [held, setHeld] = useState<Held | null>(null);
  const [target, setTarget] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [zoomed, setZoomed] = useState<SandboxCard | null>(null);
  const [view, setView] = useState<{ w: number; h: number } | null>(null);

  // Cards of decks since deleted (or cards since removed from them) quietly leave the table.
  const table = useMemo(() => (stored ? prune(stored, decks) : undefined), [stored, decks]);

  const decksById = useMemo(() => new Map(decks.map((d) => [d.id, d])), [decks]);
  const cardOf = (c: SandboxCard) => decksById.get(c.deckId)?.cards.find((k) => k.id === c.cardId);
  const size: CardSize = (deckId) => {
    const deck = decksById.get(deckId);
    return { w: CARD_W, h: CARD_W / (deck ? cardRatio(deck) : 5 / 7) };
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
    writeCamera(table.camera ?? startCamera({ w: space.w, h: space.h - HAND_H }));
    placed.mark();
  };

  // ---- Changes ----
  /** A change to the table, which can be undone. */
  const commit = (next: SandboxTable) => {
    if (!table || next === table) return;
    setHistory((h) => [...h.slice(-(UNDO_STEPS - 1)), table]);
    updateSandbox(next);
  };
  const undo = () => {
    const prev = history[history.length - 1];
    if (!prev || !table) return;
    setHistory(history.slice(0, -1));
    updateSandbox({ ...prev, camera: table.camera, name: table.name, handNames: table.handNames });
    haptics.tick();
  };
  const saveCamera = () => table && updateSandbox({ ...table, camera: readCamera() });

  // ---- The hand tray: its cards laid side by side, overlapping when they'd overflow. ----
  const area = view ?? { w: screenW, h: 0 };
  const handTop = area.h - HAND_H;
  const hand = table?.hands[handIndex] ?? [];
  const handCardH = (c: SandboxCard) => (HAND_CARD_W * size(c.deckId).h) / CARD_W;
  const handStep = hand.length > 1 ? Math.min(HAND_CARD_W + 8, (area.w - 24 - HAND_CARD_W) / (hand.length - 1)) : 0;
  const handSlot = (i: number) => ({ x: 12 + i * handStep, y: handTop + 14 });
  /** The hand card under a point on screen (the topmost, as later ones overlap earlier ones). */
  const handCardAt = (x: number, y: number) => {
    for (let i = hand.length - 1; i >= 0; i--) {
      const s = handSlot(i);
      if (x >= s.x && x <= s.x + HAND_CARD_W && y >= s.y && y <= s.y + handCardH(hand[i])) return i;
    }
    return -1;
  };
  /** Where in the hand cards dropped at a point would go. */
  const handInsertAt = (x: number) => (handStep ? Math.max(0, Math.min(hand.length, Math.round((x - 12) / handStep))) : 0);

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
      handSlot: (i: number) => { x: number; y: number };
      handInsertAt: (x: number) => number;
      commit: (t: SandboxTable) => void;
      saveCamera: () => void;
      setHeld: (h: Held | null) => void;
      setTarget: (id: string | null) => void;
      setMenu: (m: Menu) => void;
    };
    return { set: (next: typeof box) => Object.assign(box, next), get: () => box };
  });
  latest.set({ table, size, handTop, hand, handIndex, handCardAt, handSlot, handInsertAt, commit, saveCamera, setHeld, setTarget, setMenu });

  // The gesture in progress (never drawn from, so kept outside React state).
  const [gestureState] = useState(() => {
    type Pt = { x: number; y: number };
    const s = {
      mode: 'none' as 'none' | 'camera' | 'press' | 'carry',
      /** Each finger's start and latest position, by id. */
      fingers: new Map<number, { start: Pt; now: Pt }>(),
      /** The finger that pressed (or carries). */
      first: -1,
      /** The camera as fingers last changed count, and where they were then. */
      camStart: { a: 1, b: 0, tx: 0, ty: 0 } as Camera,
      camFrom: [] as Pt[],
      /** What was pressed: a stack (or its badge), or a hand card. */
      pressed: null as Source | null,
      /** The carried card's middle relative to the carrying finger, and its turn, both on screen. */
      offset: { x: 0, y: 0 },
      screenAngle: 0,
      /** The second finger twisting it: the line between the fingers' angle when it started, and the card's. */
      twist: null as null | { id: number; from: number; angle: number; offset: Pt },
      snapped: false,
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
    heldAngle.set(p.screenAngle);
    // A tick as it settles onto a 45° step.
    const snapped = Math.abs(p.tableAngle - Math.round(p.tableAngle / 45) * 45) < 1e-6;
    if (snapped && !touch.snapped && touch.twist) haptics.tick();
    touch.snapped = snapped;
    const L = latest.get();
    if (!L.table) return;
    const w = toTable(readCamera(), p.x, p.y);
    const except = touch.pressed?.kind === 'stack' ? touch.pressed.stackId : undefined;
    const over = p.y < L.handTop ? stackTargetAt(L.table, w.x, w.y, L.size, except) : null;
    L.setTarget(over?.id ?? null);
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
    const cam = readCamera();
    const k = cameraZoom(cam);
    if (src.kind === 'hand') {
      // From the hand: held at table size, upright on screen, under the finger.
      touch.offset = { x: 0, y: 0 };
      touch.screenAngle = 0;
    } else {
      const stack = L.table.stacks.find((s) => s.id === src.stackId)!;
      const mid = toScreen(cam, stack.x, stack.y);
      touch.offset = { x: mid.x - f.now.x, y: mid.y - f.now.y };
      touch.screenAngle = stack.angle + cameraAngle(cam);
    }
    heldScale.set(k * LIFT);
    touch.mode = 'carry';
    touch.snapped = false;
    showCarried();
    L.setHeld({ src, cards });
    haptics.lift();
  };

  /** Puts the carried cards down where the finger let go: into the hand, onto a stack, or on the table. */
  const putDown = () => {
    const touch = gestureState.get();
    const L = latest.get();
    const src = touch.pressed;
    const p = carriedPose();
    L.setHeld(null);
    L.setTarget(null);
    if (!L.table || !src || !p) return;
    const cards = cardsOf(L.table, src);
    if (!cards.length) return;
    haptics.drop();
    if (p.y >= L.handTop) {
      const into = L.handInsertAt(p.x);
      // From this very hand: moved within it.
      const without = take(L.table, src);
      const at = src.kind === 'hand' && src.hand === L.handIndex ? Math.min(into, without.hands[L.handIndex].length) : into;
      L.commit(putInHand(without, cards, L.handIndex, at));
      return;
    }
    const w = toTable(readCamera(), p.x, p.y);
    const at = { x: w.x, y: w.y, angle: p.tableAngle };
    const except = src.kind === 'stack' ? src.stackId : undefined;
    const onto = stackTargetAt(L.table, w.x, w.y, L.size, except);
    // A whole stack just moved (and turned) keeps being itself.
    if (src.kind === 'stack' && !onto) return L.commit(raise(placeStack(L.table, src.stackId, at), src.stackId));
    L.commit(putOnTable(take(L.table, src), cards, at, newId(), onto));
  };

  const [gesture] = useState(() => {
    const touch = gestureState.get();
    return Gesture.Manual()
      .runOnJS(true)
      .onTouchesDown((e, manager) => {
        manager.activate();
        const L = latest.get();
        for (const t of e.changedTouches) touch.fingers.set(t.id, { start: { x: t.x, y: t.y }, now: { x: t.x, y: t.y } });
        const pts = [...touch.fingers.values()].map((f) => f.now);
        if (touch.mode === 'none') {
          const t = e.changedTouches[0];
          touch.first = t.id;
          touch.twist = null;
          // On a hand card, or a card on the table: pressed (a tap opens its menu, a drag carries it).
          if (t.y >= L.handTop) {
            const i = L.handCardAt(t.x, t.y);
            touch.pressed = i >= 0 ? { kind: 'hand', hand: L.handIndex, iid: L.hand[i].iid } : null;
            touch.mode = i >= 0 ? 'press' : 'none';
            return;
          }
          const w = toTable(readCamera(), t.x, t.y);
          const hit = L.table ? stackAt(L.table, w.x, w.y, L.size) : null;
          if (hit) {
            touch.pressed = { kind: hit.whole ? 'stack' : 'top', stackId: hit.stack.id };
            touch.mode = 'press';
            return;
          }
        }
        if (touch.mode === 'press' || touch.mode === 'carry') {
          // A second finger while a card is held: it twists the card.
          if (touch.mode === 'press') pickUp();
          const second = e.changedTouches.find((c) => c.id !== touch.first);
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
        // Empty table: the camera, slid by one finger, zoomed and turned by two. Restarted from here whenever
        // a finger comes or goes, so nothing jumps.
        touch.mode = 'camera';
        touch.camStart = readCamera();
        touch.camFrom = pts.slice(0, 2);
      })
      .onTouchesMove((e) => {
        for (const t of e.allTouches) {
          const f = touch.fingers.get(t.id);
          if (f) f.now = { x: t.x, y: t.y };
        }
        if (touch.mode === 'press') {
          const f = touch.fingers.get(touch.first);
          if (f && Math.hypot(f.now.x - f.start.x, f.now.y - f.start.y) > TAP_SLOP) pickUp();
          return;
        }
        if (touch.mode === 'carry') return showCarried();
        if (touch.mode === 'camera') {
          const now = [...touch.fingers.values()].slice(0, 2).map((f) => f.now);
          if (now.length !== touch.camFrom.length) {
            touch.camStart = readCamera();
            touch.camFrom = now;
            return;
          }
          writeCamera(moveCamera(touch.camStart, touch.camFrom, now));
        }
      })
      .onTouchesUp((e, manager) => {
        const L = latest.get();
        const lifted = e.changedTouches.map((t) => t.id);
        if (touch.mode === 'press' && lifted.includes(touch.first)) {
          // A tap: the card's menu.
          const src = touch.pressed;
          if (src?.kind === 'hand') L.setMenu({ kind: 'hand', hand: src.hand, iid: src.iid });
          else if (src) L.setMenu({ kind: 'stack', id: src.stackId });
          touch.mode = 'none';
        } else if (touch.mode === 'carry') {
          if (lifted.includes(touch.first)) {
            putDown();
            touch.mode = 'none';
          } else if (touch.twist && lifted.includes(touch.twist.id)) {
            // The twisting finger lifted: the card keeps its new turn, carried on by the first.
            const p = carriedPose();
            const f = touch.fingers.get(touch.first);
            if (p && f) {
              touch.screenAngle = p.screenAngle;
              touch.offset = { x: p.x - f.now.x, y: p.y - f.now.y };
            }
            touch.twist = null;
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
        if (!touch.fingers.size) {
          touch.mode = 'none';
          manager.end();
        }
      })
      .onTouchesCancelled((_, manager) => {
        const L = latest.get();
        if (touch.mode === 'carry') {
          L.setHeld(null);
          L.setTarget(null);
        }
        touch.fingers.clear();
        touch.mode = 'none';
        manager.end();
      });
  });

  // ---- Menus ----
  const viewMiddle = () => {
    const c = readCamera();
    return toTable(c, area.w / 2, (area.h - HAND_H) / 2);
  };
  /** Puts cards on the table in the middle of the view, upright as seen (snapped to the table's 45° steps). */
  const playToView = (t: SandboxTable, cards: SandboxCard[]) => {
    const m = viewMiddle();
    return putOnTable(t, cards, { x: m.x, y: m.y, angle: snapAngle(-cameraAngle(readCamera()), 45, 45) }, newId());
  };

  const addDeckToTable = (deck: Deck) => {
    if (!table) return;
    const m = viewMiddle();
    // Beside anything already in the middle, rather than on it.
    let x = m.x;
    while (table.stacks.some((s) => Math.hypot(s.x - x, s.y - m.y) < CARD_W)) x += CARD_W * 1.3;
    commit(addDeck(table, deck, { x, y: m.y }, newId));
    haptics.drop();
  };

  const rename = (title: string, current: string, done: (name: string) => void) => {
    if (Platform.OS !== 'ios') return;
    Alert.prompt(title, undefined, (name) => name.trim() && done(name.trim()), 'plain-text', current);
  };

  const menuStack = menu?.kind === 'stack' ? table?.stacks.find((s) => s.id === menu.id) : undefined;
  const menuHandCard = menu?.kind === 'hand' ? table?.hands[menu.hand].find((c) => c.iid === menu.iid) : undefined;
  const sheet = (() => {
    if (!table || !menu) return null;
    if (menu.kind === 'stack' && menuStack) {
      const top = menuStack.cards[menuStack.cards.length - 1];
      const n = menuStack.cards.length;
      const tiles: SheetTile[] = [
        { label: 'Flip over', icon: FLIP_ICON, onPress: () => commit(flipStack(table, menuStack.id)) },
        { label: 'Turn 90°', icon: { ios: 'rotate.right', android: 'rotate_right', web: 'rotate_right' }, onPress: () => commit(turnStack(table, menuStack.id)) },
        {
          label: `To ${table.handNames[handIndex]}`,
          icon: { ios: 'hand.raised', android: 'back_hand', web: 'back_hand' },
          onPress: () => commit(putInHand(take(table, { kind: 'top', stackId: menuStack.id }), [top], handIndex)),
        },
        ...(n > 1
          ? [{ label: 'Shuffle', icon: { ios: 'shuffle', android: 'shuffle', web: 'shuffle' } as const, onPress: () => commit(shuffleStack(table, menuStack.id)) }]
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
      return { title: n > 1 ? `Stack of ${n}` : top.faceUp ? (cardOf(top)?.name ?? 'Card') : 'Face-down card', tiles, actions: [] };
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
      return { title: menuHandCard.faceUp ? (cardOf(menuHandCard)?.name ?? 'Card') : 'Face-down card', tiles, actions: [] };
    }
    if (menu.kind === 'table') {
      return {
        title: table.name,
        tiles: [],
        actions: [
          { label: 'Add a deck…', onPress: () => setTimeout(() => setMenu({ kind: 'addDeck' }), 250) },
          {
            label: 'Reset the view',
            onPress: () => {
              if (!view) return;
              writeCamera(startCamera({ w: view.w, h: view.h - HAND_H }));
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
  const carrying = !!held;
  useEffect(() => {
    if (!table) return onControls(null);
    onControls({
      title: table.name,
      canUndo: history.length > 0,
      busy: carrying,
      undo: () => latestUndo.get()(),
      openMenu: () => setMenu({ kind: 'table' }),
    });
  }, [history.length, carrying, onControls, table, latestUndo]);

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
            <Image source={require('../../assets/textures/felt.png')} resizeMode="repeat" style={styles.felt} />
            {table.stacks.map((s) => (
              <StackView
                key={s.id}
                stack={s}
                deck={decksById.get(s.cards[s.cards.length - 1].deckId)}
                decks={decksById}
                size={size(s.cards[s.cards.length - 1].deckId)}
                // While carried: a whole stack is out of sight; a top card leaves the rest showing.
                hide={held?.src.kind === 'stack' && held.src.stackId === s.id ? 'all' : held?.src.kind === 'top' && held.src.stackId === s.id ? 'top' : 'none'}
                target={target === s.id}
              />
            ))}
          </Animated.View>

          {/* The hand tray, along the bottom. */}
          <View style={[styles.tray, { top: handTop, height: HAND_H }]} pointerEvents="none">
            {hand.length === 0 ? <Text style={styles.trayEmpty}>Drag cards here to put them in {table.handNames[handIndex]}</Text> : null}
            {hand.map((c, i) => {
              const s = handSlot(i);
              const deck = decksById.get(c.deckId);
              const isHeld = held?.src.kind === 'hand' && held.src.iid === c.iid;
              return deck ? (
                <View key={c.iid} style={[styles.handCard, { left: s.x, top: s.y - handTop }, isHeld && styles.hidden]}>
                  <CardView deck={deck} card={cardOf(c)} faceUp={c.faceUp} width={HAND_CARD_W} />
                </View>
              ) : null;
            })}
          </View>

          {/* The card being carried, drawn over everything, following the finger. */}
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

      {/* Which hand the tray shows: one at a time, so the phone can be passed round. Hold a tab to rename it. */}
      <View style={[styles.tabs, { paddingBottom: insets.bottom + 6 }]}>
        {Array.from({ length: HAND_COUNT }, (_, i) => (
          <Pressable
            key={i}
            onPress={() => {
              setHandIndex(i);
              haptics.tick();
            }}
            onLongPress={() => rename('Rename hand', table.handNames[i], (name) => updateSandbox({ ...table, handNames: table.handNames.map((n, j) => (j === i ? name : n)) }))}
            disabled={carrying}
            accessibilityRole="tab"
            accessibilityState={{ selected: i === handIndex }}
            accessibilityHint="Hold to rename it."
            style={[styles.tab, i === handIndex && styles.tabOn]}>
            <Text style={[styles.tabText, i === handIndex && { color: colors.accentText }]} numberOfLines={1}>
              {table.handNames[i]} · {table.hands[i].length}
            </Text>
          </Pressable>
        ))}
      </View>

      <ActionSheet
        visible={!!sheet}
        title={sheet?.title}
        tiles={sheet?.tiles}
        actions={sheet?.actions ?? []}
        onClose={() => setMenu(null)}
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
    </View>
  );
}

/** A stack on the table: its top card (and edges below it, for more than one), turned as it lies. */
const StackView = memo(function StackView({
  stack,
  deck,
  decks,
  size,
  hide,
  target,
}: {
  stack: SandboxStack;
  deck: Deck | undefined;
  decks: Map<string, Deck>;
  size: { w: number; h: number };
  hide: 'none' | 'top' | 'all';
  target: boolean;
}) {
  const shown = hide === 'top' ? stack.cards.slice(0, -1) : hide === 'all' ? [] : stack.cards;
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
      {target ? <View style={styles.target} /> : null}
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
  held: { position: 'absolute', shadowColor: '#000', shadowOpacity: 0.5, shadowRadius: 14, shadowOffset: { width: 4, height: 14 } },
  hidden: { opacity: 0 },
  tray: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: 'rgba(42,26,15,0.94)',
    borderTopWidth: 2,
    borderTopColor: '#6b4527',
  },
  trayEmpty: { color: 'rgba(255,255,255,0.5)', fontSize: 14, textAlign: 'center', marginTop: 48 },
  handCard: { position: 'absolute' },
  tabs: { flexDirection: 'row', gap: 6, paddingHorizontal: 8, paddingTop: 6, backgroundColor: '#2a1a0f' },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.06)' },
  tabOn: { backgroundColor: colors.accent },
  tabText: { color: colors.text, fontSize: 13, fontWeight: '600' },
});
