import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactElement, ReactNode } from 'react';
import { Animated, FlatList, LayoutAnimation, PanResponder, StyleSheet, Text, View } from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent, NativeTouchEvent } from 'react-native';

import { gridHit, gridSlot } from '../lib/order';
import { colors } from '../theme';

/** Holding an item still this long picks it up. */
const HOLD_MS = 300;
/** Moving further than this before the hold completes is a scroll, not a pick-up. */
const SLOP = 8;
/** Dragging within this distance of the top or bottom edge scrolls the grid that way. */
const EDGE = 70;
/** Points scrolled per step while dragging at an edge, and how often a step happens. */
const EDGE_STEP = 14;
const EDGE_TICK_MS = 16;

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
  /**
   * The touch handler was released by the second finger lifting (iOS can report that as the whole touch
   * ending) while the holding finger is still down. The grid's own touch events carry on from there.
   */
  orphaned: boolean;
}

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
}

/**
 * One grid cell. Memoised so that during a drag only the cells whose state changes (picked up, or the
 * landing slot) re-render, not the whole grid.
 */
const Cell = memo(function Cell<T>({
  item,
  width,
  picked,
  landing,
  renderItem,
  onLayout,
}: {
  item: T;
  width: number;
  picked: boolean;
  landing: boolean;
  renderItem: (item: T) => ReactNode;
  onLayout?: (e: LayoutChangeEvent) => void;
}) {
  return (
    <View onLayout={onLayout} style={[{ width, pointerEvents: 'box-only' }, picked && styles.placeholder]}>
      <View style={picked && { opacity: 0 }}>{renderItem(item)}</View>
      {landing ? <View style={styles.landing} /> : null}
    </View>
  );
}) as <T>(props: {
  item: T;
  width: number;
  picked: boolean;
  landing: boolean;
  renderItem: (item: T) => ReactNode;
  onLayout?: (e: LayoutChangeEvent) => void;
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
}: Props<T>) {
  // Kept in state, not a ref, because touch handlers scroll it; created once so it isn't re-attached each render.
  const [list, setList] = useState<FlatList<T> | null>(null);
  const [attachList] = useState(() => (view: FlatList<T> | null) => setList(view));
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
    const now = { x: 0, y: 0, scroll: 0 };
    return {
      get: () => now,
      setFinger: (x: number, y: number) => Object.assign(now, { x, y }),
      setScroll: (scroll: number) => Object.assign(now, { scroll }),
    };
  }, []);

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
    if (slot !== target) setTarget(slot);
    const rel = y - origin.y;
    const next = press?.helper ? 0 : rel < EDGE ? -1 : rel > viewHeight - bottomInset - EDGE ? 1 : 0;
    if (next !== edge) setEdge(next);
  };

  const maxScroll = Math.max(0, contentHeight - viewHeight + bottomInset);
  const scrollBy = (to: number) => {
    const next = Math.min(maxScroll, Math.max(0, to));
    list?.scrollToOffset({ offset: next, animated: false });
    live.setScroll(next);
  };

  // Hold to pick up. Any movement, lift-off or new press changes `holdKey` and cancels the timer.
  const holdKey = press && !press.lifted && !press.abandoned ? press.pressedAt : null;
  useEffect(() => {
    if (holdKey === null) return;
    const timer = setTimeout(() => {
      slideIntoPlace();
      setPress((p) => p && { ...p, lifted: true });
    }, HOLD_MS);
    return () => clearTimeout(timer);
  }, [holdKey]);

  // Keep scrolling while the carried items sit at an edge. Each tick also moves the landing slot, since the
  // grid slides under a finger that isn't moving.
  const tick = useRef<() => void>(() => {});
  useEffect(() => {
    tick.current = () => {
      scrollBy(live.get().scroll + edge * EDGE_STEP);
      track();
    };
  });
  useEffect(() => {
    if (!edge) return;
    const timer = setInterval(() => tick.current(), EDGE_TICK_MS);
    return () => clearInterval(timer);
  }, [edge]);

  const finish = () => {
    setPress(null);
    setTarget(null);
    setEdge(0);
    // The drag offset isn't reset here: that would jump the lifted item back to where it was picked up just
    // before it disappears. The next press resets it.
  };

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
    const helper = { touchId: t.identifier, startX: t.pageX, startY: t.pageY, startScroll: live.get().scroll, moved: false };
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
    scrollBy(h.startScroll - (t.pageY - h.startY));
    track();
  };
  const helperEnd = (changed: NativeTouchEvent[]) => {
    const h = press?.helper;
    const t = h && changed.find((c) => c.identifier === h.touchId);
    if (!h || !t) return;
    setPress((p) => p && { ...p, helper: undefined });
    if (h.moved || Math.hypot(t.pageX - h.startX, t.pageY - h.startY) >= SLOP) return;
    const index = itemAt(h.startX, h.startY);
    if (index !== null) setPress((p) => (p && !p.picked.includes(index) ? { ...p, picked: [...p.picked, index] } : p));
  };

  /** The holding finger lifted: put the carried items in the slot under it, or treat a short press as a tap. */
  const release = () => {
    const p = press;
    const to = target;
    finish();
    if (!p || p.abandoned) return;
    if (p.lifted) {
      if (to !== null && !(p.picked.length === 1 && to === p.from)) {
        slideIntoPlace();
        onMove(p.picked, to);
      }
      return;
    }
    onPress(items[p.from]);
  };

  /** A release that arrives while the holding finger is still down came from the second finger lifting. */
  const stillHeld = (e: GestureResponderEvent) => !!press?.lifted && !!holdingFinger(e.nativeEvent.touches);
  const keepHolding = () => setPress((p) => p && { ...p, orphaned: true, helper: undefined });

  // One touch handler for the whole grid (rather than one per item): it works out which item a finger is on
  // from the grid's geometry.
  const responder = PanResponder.create({
    onStartShouldSetPanResponder: (e) =>
      !press?.lifted && itemAt(e.nativeEvent.pageX, e.nativeEvent.pageY) !== null,
    // Before the hold completes, let the list take a swipe and scroll.
    onShouldBlockNativeResponder: () => false,
    onPanResponderTerminationRequest: () => !press?.lifted,
    onPanResponderGrant: (e) => {
      const n = e.nativeEvent;
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
        orphaned: false,
      });
    },
    // Extra fingers landing and lifting while items are held.
    onPanResponderStart: (e) => {
      if (press?.lifted && !press.orphaned) helperStart(e.nativeEvent.changedTouches);
    },
    onPanResponderEnd: (e) => {
      if (press?.lifted && !press.orphaned) helperEnd(e.nativeEvent.changedTouches);
    },
    onPanResponderMove: (e) => {
      if (!press || press.orphaned) return;
      const t = holdingFinger(e.nativeEvent.touches);
      if (!press.lifted) {
        if (t && !press.abandoned && Math.hypot(t.pageX - press.startX, t.pageY - press.startY) > SLOP) {
          setPress((p) => p && { ...p, abandoned: true });
        }
        return;
      }
      if (t) followFinger(t);
      helperMove(e.nativeEvent.touches);
    },
    onPanResponderRelease: (e) => (stillHeld(e) ? keepHolding() : release()),
    onPanResponderTerminate: (e) => (stillHeld(e) ? keepHolding() : finish()),
  });

  // The grid itself stays put while dragging: reordering its data mid-drag would rebuild its rows. Instead
  // the landing slot is outlined, and each cell only re-renders when its own state changes.
  const picked = lifted?.picked;
  const renderCell = useCallback(
    ({ item, index }: { item: T; index: number }) => (
      <Cell
        item={item}
        width={itemWidth}
        picked={!!picked?.includes(index)}
        landing={index === target && !(picked?.length === 1 && picked[0] === target)}
        renderItem={renderItem}
        onLayout={index === 0 ? measureItem : undefined}
      />
    ),
    [itemWidth, picked, target, renderItem, measureItem],
  );

  const headerEl = useMemo(
    () => (header ? <View onLayout={(e) => setHeaderHeight(e.nativeEvent.layout.height)}>{header}</View> : null),
    [header],
  );

  return (
    <View
      ref={wrapRef}
      style={{ flex: 1 }}
      {...responder.panHandlers}
      onLayout={(e) => {
        setViewHeight(e.nativeEvent.layout.height);
        wrapRef.current?.measureInWindow((x, y) => setOrigin({ x, y }));
      }}
      onTouchStart={(e) => {
        // Re-measure on every press: the screen may have moved (e.g. the keyboard) since layout.
        if (!press) wrapRef.current?.measureInWindow((x, y) => setOrigin({ x, y }));
        if (press?.orphaned) helperStart(e.nativeEvent.changedTouches);
      }}
      // Once orphaned (see Press.orphaned), the grid's touch events carry the drag and the scrolling finger.
      onTouchMove={(e) => {
        if (!press?.orphaned) return;
        const t = holdingFinger(e.nativeEvent.touches);
        if (t) followFinger(t);
        helperMove(e.nativeEvent.touches);
      }}
      onTouchEnd={(e) => {
        if (!press?.orphaned) return;
        if (holdingFinger(e.nativeEvent.changedTouches)) release();
        else helperEnd(e.nativeEvent.changedTouches);
      }}
      onTouchCancel={(e) => {
        if (press?.orphaned && holdingFinger(e.nativeEvent.changedTouches)) finish();
      }}>
      <FlatList
        ref={attachList}
        data={items}
        extraData={renderCell}
        keyExtractor={keyOf}
        numColumns={columns}
        columnWrapperStyle={{ gap }}
        contentContainerStyle={{ padding, gap }}
        scrollEnabled={!lifted}
        onContentSizeChange={(_, h) => setContentHeight(h)}
        // Only recorded, never rendered, so following every scroll event is cheap.
        scrollEventThrottle={16}
        onScroll={(e) => live.setScroll(e.nativeEvent.contentOffset.y)}
        ListHeaderComponent={headerEl}
        ListFooterComponent={footer}
        renderItem={renderCell}
      />

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
          {lifted.picked
            .slice(1, 3)
            .map((index, i) => (
              <View key={index} style={{ position: 'absolute', left: (i + 1) * 5, top: (i + 1) * 5 }}>
                {renderLifted(items[index])}
              </View>
            ))
            .reverse()}
          {renderLifted(items[lifted.picked[0]])}
          {lifted.picked.length > 1 ? (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{lifted.picked.length}</Text>
            </View>
          ) : null}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
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
