import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Animated, Easing, LayoutAnimation, ScrollView, StyleSheet, View } from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent, NativeTouchEvent } from 'react-native';

import * as haptics from '../lib/haptics';
import { gridHit, gridSlot } from '../lib/order';
import { colors } from '../theme';
import { Text } from './Text';
import { FRAME_MS, useFrameLoop } from './useFrameLoop';

/** Holding an item still this long picks it up. */
const HOLD_MS = 300;
/** Moving further than this before the hold completes is a scroll, not a pick-up. */
const SLOP = 8;
/** Dragging within this distance of the top or bottom edge scrolls the grid that way. */
const EDGE = 70;
/** Points scrolled each (60 Hz) frame while dragging at an edge. */
const EDGE_STEP = 14;

/** Animates items moving to new places on the next layout change. Movement only: fading views in would make them blink. */
const slideIntoPlace = () =>
  LayoutAnimation.configureNext({ duration: 220, update: { type: LayoutAnimation.Types.easeInEaseOut } });

interface Press {
  from: number;
  touchId: string;
  startX: number;
  startY: number;
  /** Where on the item the finger landed, so the lifted item stays under the finger. */
  offX: number;
  offY: number;
  pressedAt: number;
  lifted: boolean;
  /** Moved before the hold completed: the list is scrolling instead. */
  abandoned: boolean;
  /**
   * Indexes of every item being carried, in the order they were picked: the pressed item first, then any
   * tapped with a second finger. They're dropped together as a block, in this order.
   */
  picked: number[];
  /** A second finger while items are held: a tap picks up the item under it, a swipe scrolls the grid. */
  helper?: { touchId: string; startX: number; startY: number; startScroll: number; moved: boolean };
}

/** A scroll by the second finger keeps going after it lifts, slowing by this factor every frame. */
const COAST_FRICTION = 0.95;
/** Coasting stops below this speed, in points per millisecond. */
const COAST_MIN_SPEED = 0.02;

interface Props<T> {
  items: T[];
  keyOf: (item: T) => string;
  columns: number;
  itemWidth: number;
  gap: number;
  padding: number;
  header?: ReactElement;
  footer?: ReactElement;
  /** Space covered by something floating over the bottom of the grid, e.g. a footer bar. */
  bottomInset?: number;
  renderItem: (item: T) => ReactNode;
  /** How the item looks while being dragged. */
  renderLifted: (item: T) => ReactNode;
  onPress: (item: T) => void;
  /** `picked` are item indexes in pick order; they end up together as a block starting at index `to`. */
  onMove: (picked: number[], to: number) => void;
  /**
   * Told when items are picked up (and again when more are, or they're put down: then with null), so the caller
   * can take them elsewhere with the finger still on them, e.g. out of a screen. `letGo` then has the grid drop
   * the drag without putting them anywhere; the finger is the caller's from then on. `offX` and `offY` are where
   * the finger holds the first item.
   */
  onHold?: (held: GridHold | null) => void;
  /** Keeps the grid from scrolling, e.g. while a slider in its header is being moved. */
  scrollLocked?: boolean;
}

/** Items being carried in a grid, for its `onHold`. */
export interface GridHold {
  picked: number[];
  touchId: string;
  offX: number;
  offY: number;
  letGo: () => void;
}

/**
 * One grid cell. Memoised so that during a drag only the cells whose state changes (picked up, or the
 * landing slot) re-render, not the whole grid.
 */
const Cell = memo(function Cell<T>({
  item,
  width,
  picked,
  hidden,
  landing,
  renderItem,
  onLayout,
  onActivate,
}: {
  item: T;
  width: number;
  picked: boolean;
  /** Out of sight: dropped, and settling into place under its lifted copy. */
  hidden?: boolean;
  landing: boolean;
  renderItem: (item: T) => ReactNode;
  onLayout?: (e: LayoutChangeEvent) => void;
  /** VoiceOver's double-tap: the same as tapping it (taps themselves come through the grid's touch handling). */
  onActivate: (item: T) => void;
}) {
  return (
    <View
      onLayout={onLayout}
      accessible
      accessibilityRole="button"
      onAccessibilityTap={() => onActivate(item)}
      style={[{ width, pointerEvents: 'box-only' }, picked && styles.placeholder, hidden && { opacity: 0 }]}>
      <View style={picked && { opacity: 0 }}>{renderItem(item)}</View>
      {landing ? <View style={styles.landing} /> : null}
    </View>
  );
}) as <T>(props: {
  item: T;
  width: number;
  picked: boolean;
  /** Out of sight: dropped, and settling into place under its lifted copy. */
  hidden?: boolean;
  landing: boolean;
  renderItem: (item: T) => ReactNode;
  onLayout?: (e: LayoutChangeEvent) => void;
  onActivate: (item: T) => void;
}) => ReactElement;

/**
 * A scrolling grid whose items can be rearranged: hold one still to pick it up, drag it to a new spot (an
 * outline marks where it will land), and let go. While holding, a second finger taps more items to carry
 * them too, or swipes to scroll. Dragging near the top or bottom also scrolls. Taps and ordinary scrolling
 * work as usual.
 *
 * Performance: finger and scroll positions are tracked outside React (the lifted item is moved by an
 * Animated value), so a drag only re-renders when the landing slot or the carried items change.
 */
export function ReorderableGrid<T>({
  items,
  keyOf,
  columns,
  itemWidth,
  gap,
  padding,
  header,
  footer,
  bottomInset = 0,
  renderItem,
  renderLifted,
  onPress,
  onMove,
  onHold,
  scrollLocked = false,
}: Props<T>) {
  // Kept in state, not a ref, because touch handlers scroll it; created once so it isn't re-attached each render.
  const [list, setList] = useState<ScrollView | null>(null);
  const [attachList] = useState(() => (view: ScrollView | null) => setList(view));
  const wrapRef = useRef<View>(null);
  const [press, setPress] = useState<Press | null>(null);
  const [target, setTarget] = useState<number | null>(null);
  const [edge, setEdge] = useState<-1 | 0 | 1>(0);
  const [pan] = useState(() => new Animated.ValueXY());
  // Geometry for working out which slot is under the finger.
  const [origin, setOrigin] = useState({ x: 0, y: 0 });
  const [viewHeight, setViewHeight] = useState(0);
  const [contentHeight, setContentHeight] = useState(0);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [itemHeight, setItemHeight] = useState(0);
  const [measureItem] = useState(() => (e: LayoutChangeEvent) => setItemHeight(e.nativeEvent.layout.height));

  // Where the finger and the scroll are right now. These change every frame during a drag, so they live
  // outside React state: reading them never causes a render.
  const live = useMemo(() => {
    const now = { x: 0, y: 0, scroll: 0, momentum: false, helperY: 0, helperT: 0, helperV: 0 };
    return {
      get: () => now,
      setFinger: (x: number, y: number) => Object.assign(now, { x, y }),
      setScroll: (scroll: number) => Object.assign(now, { scroll }),
      /** Whether the list is still coasting from a flick (a touch then just stops it). */
      setMomentum: (momentum: boolean) => Object.assign(now, { momentum }),
      /** Follows the scrolling finger's speed (points per ms, smoothed), for coasting once it lifts. */
      sampleHelper: (y: number, t: number, reset = false) => {
        if (!reset && t > now.helperT) now.helperV = 0.6 * ((y - now.helperY) / (t - now.helperT)) + 0.4 * now.helperV;
        if (reset) now.helperV = 0;
        Object.assign(now, { helperY: y, helperT: t });
      },
    };
  }, []);
  /** The grid's speed while coasting after a second-finger scroll (points per ms), or null when still. */
  const [coast, setCoast] = useState<number | null>(null);
  /**
   * Dropped items settling into place: the lifted copy glides to where they land, the grid rearranges, and only
   * then does the copy go and the items themselves show (hidden meanwhile, so they aren't seen sliding over).
   */
  const [settling, setSettling] = useState<{ keys: string[]; items: T[] } | null>(null);

  const lifted = press?.lifted ? press : null;

  /** A window position relative to the first item's top-left corner, in content (scrolled) coordinates. */
  const inGrid = (x: number, y: number) => {
    const top = padding + headerHeight + (header ? gap : 0);
    return { x: x - origin.x - padding, y: y - origin.y + live.get().scroll - top };
  };
  const cells = { columns, cellW: itemWidth + gap, cellH: itemHeight + gap, gap, count: items.length };
  /** The slot under a window position, for dropping. */
  const slotAt = (x: number, y: number) => {
    const p = inGrid(x, y);
    return gridSlot(p.x, p.y, cells);
  };
  /** The item under a window position, if any. */
  const itemAt = (x: number, y: number) => {
    const p = inGrid(x, y);
    return gridHit(p.x, p.y, cells);
  };

  /** Recomputes the landing slot and edge-scroll direction from the latest finger and scroll positions. */
  const track = () => {
    const { x, y } = live.get();
    const slot = slotAt(x, y);
    if (slot !== target) {
      setTarget(slot);
      // A tick each time the landing spot moves on.
      if (target !== null) haptics.tick();
    }
    const rel = y - origin.y;
    const next = press?.helper ? 0 : rel < EDGE ? -1 : rel > viewHeight - bottomInset - EDGE ? 1 : 0;
    if (next !== edge) setEdge(next);
  };

  const maxScroll = Math.max(0, contentHeight - viewHeight + bottomInset);
  const scrollBy = (to: number) => {
    const next = Math.min(maxScroll, Math.max(0, to));
    list?.scrollTo({ y: next, animated: false });
    live.setScroll(next);
  };

  // Hold to pick up. Any movement, lift-off or new press changes `holdKey` and cancels the timer.
  const holdKey = press && !press.lifted && !press.abandoned ? press.pressedAt : null;
  useEffect(() => {
    if (holdKey === null) return;
    const timer = setTimeout(() => {
      slideIntoPlace();
      setPress((p) => p && { ...p, lifted: true });
      haptics.lift();
    }, HOLD_MS);
    return () => clearTimeout(timer);
  }, [holdKey]);

  // Keep scrolling while the carried items sit at an edge, in step with the screen. Each step also moves the
  // landing slot, since the grid slides under a finger that isn't moving.
  useFrameLoop(edge !== 0, (frames) => {
    scrollBy(live.get().scroll + edge * EDGE_STEP * frames);
    track();
  });

  // Coast after a second-finger scroll: keep scrolling at the finger's last speed, slowing each frame, until
  // it's slow enough to stop or hits an end. Each step also moves the landing slot under the held items.
  const coasting = useMemo(() => {
    const box = { v: 0 };
    return { set: (v: number) => Object.assign(box, { v }), get: () => box.v };
  }, []);
  // Starts at the finger's speed; anything left from a coast that was cut short is dropped.
  if (coast === null) coasting.set(0);
  else if (coasting.get() === 0) coasting.set(coast);
  useFrameLoop(coast !== null, (frames) => {
    const v = coasting.get() * COAST_FRICTION ** frames;
    coasting.set(v);
    const before = live.get().scroll;
    scrollBy(before + v * FRAME_MS * frames);
    if (press?.lifted) track();
    if (Math.abs(v) >= COAST_MIN_SPEED && live.get().scroll !== before) return;
    coasting.set(0);
    setCoast(null);
    return false;
  });
  const finish = () => {
    setPress(null);
    setTarget(null);
    setEdge(0);
    setCoast(null);
    setSettling(null);
    // The drag offset isn't reset here: that would jump the lifted item back to where it was picked up just
    // before it disappears. The next press resets it.
  };

  // Tell the caller what's held, as it's picked up, added to and put down.
  const heldKey = lifted ? `${lifted.touchId}:${lifted.picked.join(',')}` : null;
  useEffect(() => {
    if (!onHold) return;
    if (!lifted) return onHold(null);
    onHold({ picked: lifted.picked, touchId: lifted.touchId, offX: lifted.offX, offY: lifted.offY, letGo: () => finish() });
    // Only when what's held changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heldKey]);

  /** The finger holding the items, if it's among these touches. */
  const holdingFinger = (touches: NativeTouchEvent[]) => touches.find((t) => t.identifier === press?.touchId);

  const followFinger = (t: NativeTouchEvent) => {
    if (!press) return;
    pan.setValue({ x: t.pageX - press.startX, y: t.pageY - press.startY });
    live.setFinger(t.pageX, t.pageY);
    track();
  };

  // A second finger while the first holds items: a swipe scrolls the grid (its own scrolling is off then,
  // since it would steal the holding finger), and a tap picks up the item under it.
  const helperStart = (changed: NativeTouchEvent[]) => {
    const t = changed.find((c) => c.identifier !== press?.touchId);
    if (!t || press?.helper) return;
    // A new finger stops any coasting, like catching a moving list.
    setCoast(null);
    const helper = { touchId: t.identifier, startX: t.pageX, startY: t.pageY, startScroll: live.get().scroll, moved: false };
    live.sampleHelper(t.pageY, t.timestamp, true);
    setPress((p) => p && { ...p, helper });
    setEdge(0);
  };
  const helperMove = (touches: NativeTouchEvent[]) => {
    const h = press?.helper;
    const t = h && touches.find((c) => c.identifier === h.touchId);
    if (!h || !t) return;
    if (!h.moved) {
      if (Math.hypot(t.pageX - h.startX, t.pageY - h.startY) < SLOP) return;
      setPress((p) => (p?.helper ? { ...p, helper: { ...p.helper, moved: true } } : p));
    }
    live.sampleHelper(t.pageY, t.timestamp);
    scrollBy(h.startScroll - (t.pageY - h.startY));
    track();
  };
  const helperEnd = (changed: NativeTouchEvent[]) => {
    const h = press?.helper;
    const t = h && changed.find((c) => c.identifier === h.touchId);
    if (!h || !t) return;
    setPress((p) => p && { ...p, helper: undefined });
    if (h.moved || Math.hypot(t.pageX - h.startX, t.pageY - h.startY) >= SLOP) {
      // A swipe: let the grid coast on at the finger's speed (scrolling runs opposite to the finger).
      const v = -live.get().helperV;
      if (Math.abs(v) >= COAST_MIN_SPEED) setCoast(v);
      return;
    }
    const index = itemAt(h.startX, h.startY);
    if (index !== null) {
      setPress((p) => (p && !p.picked.includes(index) ? { ...p, picked: [...p.picked, index] } : p));
      haptics.lift();
    }
  };

  /** The holding finger lifted: put the carried items in the slot under it, or treat a short press as a tap. */
  const release = () => {
    const p = press;
    const to = target;
    if (!p || p.abandoned) return finish();
    if (p.lifted) {
      const moves = to !== null && !(p.picked.length === 1 && to === p.from);
      // Where the first carried item ends up (or back where it came from), in the grid's own coordinates.
      const slot = moves ? to : p.from;
      const top = padding + headerHeight + (header ? gap : 0);
      const x = padding + (slot % columns) * (itemWidth + gap);
      const y = top + Math.floor(slot / columns) * (itemHeight + gap) - live.get().scroll;
      setTarget(null);
      setEdge(0);
      setCoast(null);
      setSettling({ keys: p.picked.map((i) => keyOf(items[i])), items: p.picked.map((i) => items[i]) });
      // Glide the lifted copy there; then the grid rearranges (the items hidden, under the copy), and it settles.
      Animated.timing(pan, {
        toValue: { x: x - (p.startX - p.offX - origin.x), y: y - (p.startY - p.offY - origin.y) },
        duration: 160,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        if (!moves) return finish();
        slideIntoPlace();
        onMove(p.picked, to);
        haptics.drop();
        setTimeout(finish, 230);
      });
      return;
    }
    finish();
    onPress(items[p.from]);
  };

  // The grid follows fingers through plain touch events rather than claiming the touch: claiming it on a
  // press (to watch for a hold) stops the list's own scrolling from starting there. Until a hold picks
  // something up the list scrolls freely; after that its scrolling is turned off and these events carry
  // the drag, any second finger, and the drop.

  /** A finger lands. With nothing held, it may be the start of a tap or a hold on an item. */
  const touchStart = (e: GestureResponderEvent) => {
    const n = e.nativeEvent;
    // Nothing new while dropped items settle into place.
    if (settling) return;
    if (press?.lifted) return helperStart(n.changedTouches);
    if (press) return;
    setCoast(null);
    // Re-measure on every press: the screen may have moved (e.g. the keyboard) since layout.
    wrapRef.current?.measureInWindow((x, y) => setOrigin({ x, y }));
    // A touch on a coasting list just stops it; it isn't a tap or hold on whatever passes under it. (The
    // list may not report stopping, so the flag is cleared here rather than trusted for the next touch too.)
    if (live.get().momentum) {
      live.setMomentum(false);
      return;
    }
    if (n.touches.length > 1) return;
    const index = itemAt(n.pageX, n.pageY);
    if (index === null) return;
    pan.setValue({ x: 0, y: 0 });
    live.setFinger(n.pageX, n.pageY);
    setPress({
      from: index,
      touchId: n.identifier,
      startX: n.pageX,
      startY: n.pageY,
      // The cell's views pass touches to the cell itself, so this is the position within the cell.
      offX: n.locationX,
      offY: n.locationY,
      // Only used to tell one press from the next, so the touch's own timestamp will do.
      pressedAt: n.timestamp,
      lifted: false,
      abandoned: false,
      picked: [index],
    });
  };

  const touchMove = (e: GestureResponderEvent) => {
    if (!press) return;
    const t = holdingFinger(e.nativeEvent.touches);
    if (!press.lifted) {
      // Moving before the hold completes is a scroll: the list has it.
      if (t && !press.abandoned && Math.hypot(t.pageX - press.startX, t.pageY - press.startY) > SLOP) {
        setPress((p) => p && { ...p, abandoned: true });
      }
      return;
    }
    if (t) followFinger(t);
    helperMove(e.nativeEvent.touches);
  };

  const touchEnd = (e: GestureResponderEvent) => {
    if (!press) return;
    // The holding finger lifting drops what it carries (or, before a hold, counts as a tap); any other
    // finger lifting is the second finger finishing a tap or swipe.
    if (holdingFinger(e.nativeEvent.changedTouches)) release();
    else if (press.lifted) helperEnd(e.nativeEvent.changedTouches);
  };

  const touchCancel = (e: GestureResponderEvent) => {
    if (press && holdingFinger(e.nativeEvent.changedTouches)) finish();
  };

  // The grid itself stays put while dragging: reordering its data mid-drag would move its cells about. Instead
  // the landing slot is outlined, and each cell only re-renders when its own state changes.
  const picked = settling ? undefined : lifted?.picked;
  const settlingKeys = settling?.keys;
  // VoiceOver's double-tap on a cell, made once so the cells needn't re-render; it reads the latest onPress.
  const [pressing] = useState(() => {
    const box = { onPress };
    return { set: (next: typeof onPress) => Object.assign(box, { onPress: next }), get: () => box.onPress };
  });
  pressing.set(onPress);
  const [activate] = useState(() => (item: T) => pressing.get()(item));

  // What's carried, as it was picked up: while it settles, the items may already have moved in the list.
  const heldItems = settling ? settling.items : (lifted?.picked.map((i) => items[i]) ?? []);

  const headerEl = useMemo(
    () => (header ? <View onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>{header}</View> : null),
    [header],
  );

  return (
    <View
      ref={wrapRef}
      style={{ flex: 1 }}
      onLayout={(e) => {
        setViewHeight(e.nativeEvent.layout.height);
        wrapRef.current?.measureInWindow((x, y) => setOrigin({ x, y }));
      }}
      onTouchStart={touchStart}
      onTouchMove={touchMove}
      onTouchEnd={touchEnd}
      onTouchCancel={touchCancel}>
      <ScrollView
        ref={attachList}
        contentContainerStyle={{ padding, gap }}
        scrollEnabled={!lifted && !scrollLocked}
        onContentSizeChange={(_, h) => setContentHeight(h)}
        // Only recorded, never rendered, so following every scroll event is cheap.
        scrollEventThrottle={16}
        onScroll={(e) => live.setScroll(e.nativeEvent.contentOffset.y)}
        onMomentumScrollBegin={() => live.setMomentum(true)}
        onMomentumScrollEnd={() => live.setMomentum(false)}>
        {headerEl}
        {/*
          Every cell in one wrapping row, keyed by its item, rather than a row of views per line: an item that
          moves to another line is then the same view moving (so it slides there, and its picture doesn't
          reload and blink) instead of one torn down in its old line and built anew in the next. A hair wider
          than the columns need, so rounding can't push the last one in a line onto the next.
        */}
        <View style={[styles.cells, { gap, width: columns * (itemWidth + gap) - gap + 0.5 }]}>
          {items.map((item, index) => (
            <Cell
              key={keyOf(item)}
              item={item}
              width={itemWidth}
              picked={!!picked?.includes(index)}
              hidden={!!settlingKeys?.includes(keyOf(item))}
              landing={index === target && !(picked?.length === 1 && picked[0] === target)}
              renderItem={renderItem}
              onLayout={index === 0 ? measureItem : undefined}
              onActivate={activate}
            />
          ))}
        </View>
        {footer}
      </ScrollView>

      {lifted ? (
        <Animated.View
          style={[
            styles.lifted,
            {
              left: lifted.startX - lifted.offX - origin.x,
              top: lifted.startY - lifted.offY - origin.y,
              transform: [...pan.getTranslateTransform(), { scale: 1.08 }],
            },
          ]}>
          {/* The next couple of carried items peek out behind the first. */}
          {heldItems
            .slice(1, 3)
            .map((item, i) => (
              <View key={keyOf(item)} style={{ position: 'absolute', left: (i + 1) * 5, top: (i + 1) * 5 }}>
                {renderLifted(item)}
              </View>
            ))
            .reverse()}
          {renderLifted(heldItems[0])}
          {heldItems.length > 1 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{heldItems.length}</Text>
            </View>
          ) : null}
        </Animated.View>
      ) : null}

    </View>
  );
}

const styles = StyleSheet.create({
  cells: { flexDirection: 'row', flexWrap: 'wrap' },
  placeholder: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.35)',
    borderRadius: 8,
  },
  landing: {
    ...StyleSheet.absoluteFill,
    pointerEvents: 'none',
    borderWidth: 3,
    borderColor: colors.accent,
    borderRadius: 8,
    backgroundColor: 'rgba(224,179,84,0.15)',
  },
  badge: {
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
  badgeText: { color: colors.accentText, fontWeight: '800', fontSize: 14 },
  lifted: {
    position: 'absolute',
    pointerEvents: 'none',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
});
