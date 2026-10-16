import { SymbolView } from 'expo-symbols';
import type { SymbolViewProps } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent, StyleProp, ViewStyle } from 'react-native';

import * as haptics from '../lib/haptics';
import { colors } from '../theme';

const ACTION_WIDTH = 72;
const GAP = 8;
/** How far the row slides to show one of its buttons. */
const REVEAL = ACTION_WIDTH + GAP;

/** Which button a row has been swiped open to show: `left` (swiped right) or `right` (swiped left). */
export type SwipeSide = 'left' | 'right';

interface Props {
  /** Which button is showing, if any. The parent keeps this, so only one row is open at a time. */
  open: SwipeSide | null;
  onOpenChange: (open: SwipeSide | null) => void;
  /** Swiping left shows a Delete button on the right. */
  onDelete: () => void;
  /** If given, swiping right shows a Duplicate button on the left. */
  onDuplicate?: () => void;
  /** Rounds the buttons to match the row. */
  radius?: number;
  /** For the row's outer spacing (margins), so the buttons line up with the row itself. */
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/**
 * A list row that slides sideways under the finger to show buttons beside it, like iOS lists: swipe left for
 * Delete, swipe right for Duplicate. It's a sideways scroll view, so the swipe feels native and doesn't fight
 * the list's own vertical scrolling. While open, a tap on the row just closes it again.
 */
export function SwipeRow({ open, onOpenChange, onDelete, onDuplicate, radius = 12, style, children }: Props) {
  const [width, setWidth] = useState(0);
  const { width: screenWidth } = useWindowDimensions();
  // Before the row is measured: the screen less the list's usual padding.
  const fallbackWidth = screenWidth - 32;
  const scrollRef = useRef<ScrollView>(null);
  // Scroll positions: the Duplicate button (if any) sits off to the left, so closed is scrolled past it.
  const left = onDuplicate ? REVEAL : 0;
  const offsetFor = (side: SwipeSide | null) => (side === 'left' ? 0 : side === 'right' ? left + REVEAL : left);

  // Where the row is headed: the stop it was last sent to.
  const goal = useRef<SwipeSide | null>(open);

  // Follow the parent: opening this row closes any other, and the parent can close this one.
  const target = offsetFor(open);
  useEffect(() => {
    goal.current = open;
    scrollRef.current?.scrollTo({ x: target, animated: true });
  }, [open, target]);

  // The row snaps itself, rather than with the scroll view's snap points, which can stall part way when let go
  // slowly (leaving the row stuck between stops) or carry a flick on past the next stop.
  const go = (side: SwipeSide | null) => {
    goal.current = side;
    scrollRef.current?.scrollTo({ x: offsetFor(side), animated: true });
    if (side === open) return;
    // A tick as a button clicks into view.
    if (side) haptics.tick();
    onOpenChange(side);
  };

  // Let go: to the stop nearest where it would have coasted to, but no further than the next one along.
  const release = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const n = e.nativeEvent as NativeScrollEvent & { targetContentOffset?: { x: number } };
    const rest = n.targetContentOffset?.x ?? n.contentOffset.x;
    const stops: (SwipeSide | null)[] = onDuplicate ? ['left', null, 'right'] : [null, 'right'];
    const from = stops.indexOf(open);
    const nearest = stops.reduce((best, s, i) => (Math.abs(offsetFor(s) - rest) < Math.abs(offsetFor(stops[best]) - rest) ? i : best), 0);
    go(stops[Math.min(from + 1, Math.max(from - 1, nearest))]);
  };

  // Come to rest anywhere but where it was sent (say a coast that outran the snap): on to its stop.
  const rested = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const to = offsetFor(goal.current);
    if (Math.abs(e.nativeEvent.contentOffset.x - to) > 0.5) scrollRef.current?.scrollTo({ x: to, animated: true });
  };

  const action = (label: string, icon: SymbolViewProps['name'], color: string, onPress: () => void, gap: ViewStyle) => (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.action, gap, { borderRadius: radius, backgroundColor: color }, pressed && { opacity: 0.75 }]}>
      <SymbolView name={icon} size={24} tintColor="#fff" />
    </Pressable>
  );

  return (
    <View style={style} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {/* Always the scroll view, even before it's measured (then as wide as the screen allows), so the row
          isn't rebuilt once it is, which would make its picture blink. */}
      {(
        <ScrollView
          ref={scrollRef}
          horizontal
          bounces={false}
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: offsetFor(open), y: 0 }}
          decelerationRate="fast"
          onScrollEndDrag={release}
          onMomentumScrollEnd={rested}>
          {onDuplicate
            ? action('Duplicate', { ios: 'plus.square.on.square', android: 'content_copy', web: 'content_copy' }, colors.accent, onDuplicate, {
                marginRight: GAP,
              })
            : null}
          <View style={{ width: width || fallbackWidth }}>
            {children}
            {open ? (
              <Pressable style={StyleSheet.absoluteFill} onPress={() => onOpenChange(null)} accessibilityLabel="Close" />
            ) : null}
          </View>
          {action('Delete', { ios: 'trash', android: 'delete', web: 'delete' }, colors.danger, onDelete, { marginLeft: GAP })}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  action: { width: ACTION_WIDTH, alignItems: 'center', justifyContent: 'center' },
});
