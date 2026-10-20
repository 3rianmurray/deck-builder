import { SymbolView } from 'expo-symbols';
import type { SymbolViewProps } from 'expo-symbols';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';
import ReanimatedSwipeable, { SwipeDirection } from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';

import * as haptics from '../lib/haptics';
import { tipLearned } from '../lib/tips';
import { colors } from '../theme';

const ACTION_WIDTH = 72;
const GAP = 8;

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

/** The side whose button a swipe shows: swiping right shows the left one, swiping left the right one. */
const sideOf = (direction: SwipeDirection): SwipeSide => (direction === SwipeDirection.RIGHT ? 'left' : 'right');

/**
 * A list row that slides sideways under the finger to show a button beside it, like iOS lists: swipe left for
 * Delete, swipe right for Duplicate. Let go past halfway (or with a flick) and it springs open; otherwise it
 * springs back. While open, a tap on the row closes it again.
 */
export function SwipeRow({ open, onOpenChange, onDelete, onDuplicate, radius = 12, style, children }: Props) {
  const ref = useRef<SwipeableMethods>(null);
  // The side the row itself is open to, so the parent closing it (say, by opening another row) can be followed
  // without closing a row that's already shut.
  const shown = useRef<SwipeSide | null>(null);

  useEffect(() => {
    if (open === shown.current) return;
    if (open === null) ref.current?.close();
    else if (open === 'left') ref.current?.openLeft();
    else ref.current?.openRight();
  }, [open]);

  const action = (label: string, icon: SymbolViewProps['name'], color: string, onPress: () => void, gap: ViewStyle) => (
    <View style={[styles.actionWrap, gap]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={({ pressed }) => [styles.action, { borderRadius: radius, backgroundColor: color }, pressed && { opacity: 0.75 }]}>
        <SymbolView name={icon} size={24} tintColor="#fff" />
      </Pressable>
    </View>
  );

  return (
    <View style={style}>
      <ReanimatedSwipeable
        ref={ref}
        friction={1}
        overshootLeft={false}
        overshootRight={false}
        leftThreshold={(ACTION_WIDTH + GAP) / 2}
        rightThreshold={(ACTION_WIDTH + GAP) / 2}
        // A tick as a button clicks into view.
        onSwipeableWillOpen={() => {
          haptics.tick();
          // Swiped open: the swipe's tip isn't needed.
          tipLearned('home-swipe');
        }}
        onSwipeableOpen={(direction) => {
          shown.current = sideOf(direction);
          onOpenChange(shown.current);
        }}
        onSwipeableClose={() => {
          shown.current = null;
          if (open) onOpenChange(null);
        }}
        renderLeftActions={
          onDuplicate
            ? () =>
                action('Duplicate', { ios: 'plus.square.on.square', android: 'content_copy', web: 'content_copy' }, colors.accent, onDuplicate, {
                  paddingRight: GAP,
                })
            : undefined
        }
        renderRightActions={() => action('Delete', { ios: 'trash', android: 'delete', web: 'delete' }, colors.danger, onDelete, { paddingLeft: GAP })}>
        <View>
          {children}
          {open ? <Pressable style={StyleSheet.absoluteFill} onPress={() => ref.current?.close()} accessibilityRole="button" accessibilityLabel="Close" /> : null}
        </View>
      </ReanimatedSwipeable>
    </View>
  );
}

const styles = StyleSheet.create({
  actionWrap: { width: ACTION_WIDTH + GAP },
  action: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
