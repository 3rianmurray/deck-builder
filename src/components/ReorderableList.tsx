import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Easing, LayoutAnimation, ScrollView, StyleSheet, View } from 'react-native';
import type { GestureResponderEvent, LayoutChangeEvent, NativeTouchEvent, StyleProp, ViewStyle } from 'react-native';

import * as haptics from '../lib/haptics';
import { colors } from '../theme';

/** Holding a row still this long picks it up. Rows' own long-press delay should match, to swallow the tap. */
export const LIFT_HOLD_MS = 350;
/** Moving further than this before the hold completes is a scroll or swipe, not a pick-up. */
const SLOP = 8;
/** Dragging within this distance of the top or bottom edge scrolls the list that way. */
const EDGE = 70;
const EDGE_STEP = 12;
const EDGE_TICK_MS = 16;

interface Press {
  index: number;
  touchId: string;
  startX: number;
  startY: number;
  /** How far down the row the finger landed, so the lifted row stays under the finger. */
  offY: number;
  pressedAt: number;
  lifted: boolean;
  abandoned: boolean;
}

interface Props<R> {
  rows: R[];
  keyOf: (row: R) => string;
  renderRow: (row: R) => ReactNode;
  /** How a row looks while being dragged. */
  renderLifted: (row: R) => ReactNode;
  /** Whether a press at this horizontal spot can pick the row up (e.g. not on a button in it). */
  canLift?: (row: R, x: number, width: number) => boolean;
  /** `at` is the insertion point among the rows: 0 is before the first, `rows.length` after the last. */
  onDrop: (row: R, at: number) => void;
  header?: ReactNode;
  footer?: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  /** Space covered by something floating over the bottom of the list, e.g. a footer bar. */
  bottomInset?: number;
}

/**
 * A scrolling list whose rows can be rearranged: hold a row still to pick it up, drag it up or down (a line
 * shows where it will land), and let go. Taps, buttons in rows and ordinary scrolling work as usual; it
 * follows fingers through plain touch events and only takes over once a hold lifts a row. Dragging near the
 * top or bottom scrolls the list.
 */
export function ReorderableList<R>({
  rows,
  keyOf,
  renderRow,
  renderLifted,
  canLift,
  onDrop,
  header,
  footer,
  contentContainerStyle,
  bottomInset = 0,
}: Props<R>) {
  const [scrollView, setScrollView] = useState<ScrollView | null>(null);
  const [attachScrollView] = useState(() => (v: ScrollView | null) => setScrollView(v));
  const wrapRef = useRef<View>(null);
  const [press, setPress] = useState<Press | null>(null);
  const [at, setAt] = useState<number | null>(null);
  const [edge, setEdge] = useState<-1 | 0 | 1>(0);
  const [pan] = useState(() => new Animated.Value(0));
  const [origin, setOrigin] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [contentHeight, setContentHeight] = useState(0);
  const [rowsTop, setRowsTop] = useState(0);
  const [layouts, setLayouts] = useState<Record<string, { y: number; h: number }>>({});
  /**
   * A dropped row settling into place: its lifted copy glides to where the row lands, the rows move, and only
   * then does the copy go and the row itself show (hidden meanwhile, so it isn't seen sliding from where it was).
   */
  const [settling, setSettling] = useState<{ row: R; key: string; h: number } | null>(null);

  // The scroll position and finger change every frame, so they live outside React state.
  const live = useMemo(() => {
    const now = { scroll: 0, fingerY: 0, momentum: false };
    return {
      get: () => now,
      set: (patch: Partial<typeof now>) => Object.assign(now, patch),
    };
  }, []);

  const lifted = press?.lifted ? press : null;
  const rowLayout = (i: number) => (rows[i] ? layouts[keyOf(rows[i])] : undefined);

  /** A window y position as a y within the rows (scrolled content, below the header). */
  const rowsY = (pageY: number) => pageY - origin.y + live.get().scroll - rowsTop;
  const rowAt = (pageY: number) => {
    const y = rowsY(pageY);
    return rows.findIndex((r) => {
      const l = layouts[keyOf(r)];
      return l && y >= l.y && y < l.y + l.h;
    });
  };
  /** The insertion point under the finger: after every row whose middle is above it. */
  const insertionAt = (pageY: number) => {
    const y = rowsY(pageY);
    return rows.filter((r) => {
      const l = layouts[keyOf(r)];
      return l && l.y + l.h / 2 < y;
    }).length;
  };

  const track = () => {
    const { fingerY } = live.get();
    const next = insertionAt(fingerY);
    if (next !== at) {
      setAt(next);
      // A tick each time the drop line moves to a new place.
      if (at !== null) haptics.tick();
    }
    const rel = fingerY - origin.y;
    const dir = rel < EDGE ? -1 : rel > origin.h - bottomInset - EDGE ? 1 : 0;
    if (dir !== edge) setEdge(dir);
  };

  const maxScroll = Math.max(0, contentHeight - origin.h + bottomInset);

  // Hold to pick up; any movement, lift-off or new press changes `holdKey` and cancels the timer.
  const holdKey = press && !press.lifted && !press.abandoned ? press.pressedAt : null;
  useEffect(() => {
    if (holdKey === null) return;
    const timer = setTimeout(() => {
      LayoutAnimation.configureNext({ duration: 180, update: { type: LayoutAnimation.Types.easeInEaseOut } });
      setPress((p) => p && { ...p, lifted: true });
      haptics.lift();
    }, LIFT_HOLD_MS);
    return () => clearTimeout(timer);
  }, [holdKey]);

  // Scroll while the lifted row sits at an edge; each tick also moves the drop line.
  const tick = useRef<() => void>(() => {});
  useEffect(() => {
    tick.current = () => {
      const next = Math.min(maxScroll, Math.max(0, live.get().scroll + edge * EDGE_STEP));
      scrollView?.scrollTo({ y: next, animated: false });
      live.set({ scroll: next });
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
    setAt(null);
    setEdge(0);
    setSettling(null);
  };

  const holding = (touches: NativeTouchEvent[]) => touches.find((t) => t.identifier === press?.touchId);

  const touchStart = (e: GestureResponderEvent) => {
    const n = e.nativeEvent;
    if (press) return;
    wrapRef.current?.measureInWindow((x, y, w, h) => setOrigin({ x, y, w, h }));
    // A touch on a coasting list just stops it.
    if (live.get().momentum) {
      live.set({ momentum: false });
      return;
    }
    if (n.touches.length > 1) return;
    const index = rowAt(n.pageY);
    const layout = rowLayout(index);
    if (index === -1 || !layout) return;
    if (canLift && !canLift(rows[index], n.pageX - origin.x, origin.w)) return;
    pan.setValue(0);
    live.set({ fingerY: n.pageY });
    setPress({
      index,
      touchId: n.identifier,
      startX: n.pageX,
      startY: n.pageY,
      offY: rowsY(n.pageY) - layout.y,
      pressedAt: n.timestamp,
      lifted: false,
      abandoned: false,
    });
  };

  const touchMove = (e: GestureResponderEvent) => {
    const t = press && holding(e.nativeEvent.touches);
    if (!press || !t) return;
    if (!press.lifted) {
      // Moving either way first is a scroll or a sideways swipe on the row (e.g. to delete it).
      const moved = Math.max(Math.abs(t.pageX - press.startX), Math.abs(t.pageY - press.startY));
      if (!press.abandoned && moved > SLOP) setPress((p) => p && { ...p, abandoned: true });
      return;
    }
    pan.setValue(t.pageY - press.startY);
    live.set({ fingerY: t.pageY });
    track();
  };

  const touchEnd = (e: GestureResponderEvent) => {
    if (!press || !holding(e.nativeEvent.changedTouches)) return;
    const p = press;
    const drop = at;
    const own = rowLayout(p.index);
    if (!p.lifted || !own) return finish();
    const moves = drop !== null && drop !== p.index && drop !== p.index + 1;
    // Where the row will be: in the place of the row at the drop line (moving up), or ending just above it
    // (moving down), or back in its own place.
    let y = own.y;
    if (moves && drop < p.index) y = rowLayout(drop)?.y ?? y;
    else if (moves) {
      const above = rowLayout(drop - 1);
      if (above) y = above.y + above.h - own.h;
    }
    setAt(null);
    setEdge(0);
    setSettling({ row: rows[p.index], key: keyOf(rows[p.index]), h: own.h });
    // Glide the lifted copy there; then the rows move (the row itself hidden, under the copy), and it settles.
    const toward = rowsTop + y - live.get().scroll - (p.startY - origin.y - p.offY);
    Animated.timing(pan, { toValue: toward, duration: 160, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start(() => {
      if (!moves) return finish();
      LayoutAnimation.configureNext({ duration: 220, update: { type: LayoutAnimation.Types.easeInEaseOut } });
      onDrop(rows[p.index], drop);
      haptics.drop();
      setTimeout(finish, 230);
    });
  };

  const touchCancel = (e: GestureResponderEvent) => {
    if (press && holding(e.nativeEvent.changedTouches)) finish();
  };

  const measureRow = (key: string) => (e: LayoutChangeEvent) => {
    const { y, height } = e.nativeEvent.layout;
    setLayouts((all) => (all[key]?.y === y && all[key]?.h === height ? all : { ...all, [key]: { y, h: height } }));
  };

  // Where the drop line goes: at the top of the row at the insertion point, or below the last row.
  const lineY = (() => {
    if (!lifted || at === null || (at === lifted.index || at === lifted.index + 1)) return null;
    const l = rowLayout(at) ?? rowLayout(rows.length - 1);
    if (!l) return null;
    return at < rows.length ? l.y - 4 : l.y + l.h + 2;
  })();

  const liftedLayout = lifted ? rowLayout(lifted.index) : undefined;

  return (
    <View
      ref={wrapRef}
      style={{ flex: 1 }}
      onLayout={() => wrapRef.current?.measureInWindow((x, y, w, h) => setOrigin({ x, y, w, h }))}
      onTouchStart={touchStart}
      onTouchMove={touchMove}
      onTouchEnd={touchEnd}
      onTouchCancel={touchCancel}>
      <ScrollView
        ref={attachScrollView}
        scrollEnabled={!lifted}
        contentContainerStyle={contentContainerStyle}
        onContentSizeChange={(_, h) => setContentHeight(h)}
        scrollEventThrottle={16}
        onScroll={(e) => live.set({ scroll: e.nativeEvent.contentOffset.y })}
        onMomentumScrollBegin={() => live.set({ momentum: true })}
        onMomentumScrollEnd={() => live.set({ momentum: false })}>
        {header}
        <View onLayout={(e) => setRowsTop(e.nativeEvent.layout.y)}>
          {rows.map((row, i) => (
            <View
              key={keyOf(row)}
              onLayout={measureRow(keyOf(row))}
              style={settling ? keyOf(row) === settling.key && styles.hidden : lifted?.index === i && styles.placeholder}>
              {renderRow(row)}
            </View>
          ))}
          {lineY !== null ? <View style={[styles.line, { top: lineY }]} /> : null}
        </View>
        {footer}
      </ScrollView>

      {lifted && (settling || liftedLayout) ? (
        <Animated.View
          style={[
            styles.lifted,
            {
              top: lifted.startY - origin.y - lifted.offY,
              height: settling?.h ?? liftedLayout?.h,
              transform: [{ translateY: pan }, { scale: 1.03 }],
            },
          ]}>
          {renderLifted(settling ? settling.row : rows[lifted.index])}
        </Animated.View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  placeholder: { opacity: 0.25 },
  hidden: { opacity: 0 },
  line: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 3,
    borderRadius: 2,
    backgroundColor: colors.accent,
    pointerEvents: 'none',
  },
  lifted: {
    position: 'absolute',
    left: 0,
    right: 0,
    pointerEvents: 'none',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 8 },
    elevation: 12,
  },
});
