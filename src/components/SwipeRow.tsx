import { SymbolView } from 'expo-symbols';
import type { SymbolViewProps } from 'expo-symbols';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent, StyleProp, ViewStyle } from 'react-native';

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
  const scrollRef = useRef<ScrollView>(null);
  // Scroll positions: the Duplicate button (if any) sits off to the left, so closed is scrolled past it.
  const left = onDuplicate ? REVEAL : 0;
  const offsetFor = (side: SwipeSide | null) => (side === 'left' ? 0 : side === 'right' ? left + REVEAL : left);

  // Follow the parent: opening this row closes any other, and the parent can close this one.
  const target = offsetFor(open);
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: target, animated: true });
  }, [target]);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const x = e.nativeEvent.contentOffset.x;
    const side: SwipeSide | null = onDuplicate && x < left / 2 ? 'left' : x > left + REVEAL / 2 ? 'right' : null;
    if (side !== open) onOpenChange(side);
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
      {width ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          bounces={false}
          showsHorizontalScrollIndicator={false}
          contentOffset={{ x: offsetFor(open), y: 0 }}
          snapToOffsets={onDuplicate ? [0, left, left + REVEAL] : [0, REVEAL]}
          decelerationRate="fast"
          onScrollEndDrag={settle}
          onMomentumScrollEnd={settle}>
          {onDuplicate
            ? action('Duplicate', { ios: 'plus.square.on.square', android: 'content_copy', web: 'content_copy' }, colors.accent, onDuplicate, {
                marginRight: GAP,
              })
            : null}
          <View style={{ width }}>
            {children}
            {open ? (
              <Pressable style={StyleSheet.absoluteFill} onPress={() => onOpenChange(null)} accessibilityLabel="Close" />
            ) : null}
          </View>
          {action('Delete', { ios: 'trash', android: 'delete', web: 'delete' }, colors.danger, onDelete, { marginLeft: GAP })}
        </ScrollView>
      ) : (
        children
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  action: { width: ACTION_WIDTH, alignItems: 'center', justifyContent: 'center' },
});
