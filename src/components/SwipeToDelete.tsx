import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { NativeScrollEvent, NativeSyntheticEvent, StyleProp, ViewStyle } from 'react-native';

import { colors } from '../theme';

const DELETE_WIDTH = 84;
const GAP = 8;
/** How far the row slides left to show the Delete button. */
const REVEAL = DELETE_WIDTH + GAP;

interface Props {
  /** Whether the Delete button is showing. The parent keeps this, so only one row is open at a time. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
  /** Rounds the Delete button to match the row. */
  radius?: number;
  /** For the row's outer spacing (margins), so the button lines up with the row itself. */
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

/**
 * A list row that slides left under the finger to show a Delete button on its right, like iOS lists. It's a
 * sideways scroll view, so the swipe feels native and doesn't fight the list's own vertical scrolling. While
 * open, a tap on the row just closes it again.
 */
export function SwipeToDelete({ open, onOpenChange, onDelete, radius = 12, style, children }: Props) {
  const [width, setWidth] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  // Follow the parent: opening this row closes any other, and the parent can close this one.
  useEffect(() => {
    scrollRef.current?.scrollTo({ x: open ? REVEAL : 0, animated: true });
  }, [open]);

  const settle = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const isOpen = e.nativeEvent.contentOffset.x > REVEAL / 2;
    if (isOpen !== open) onOpenChange(isOpen);
  };

  return (
    <View style={style} onLayout={(e) => setWidth(e.nativeEvent.layout.width)}>
      {width ? (
        <ScrollView
          ref={scrollRef}
          horizontal
          bounces={false}
          showsHorizontalScrollIndicator={false}
          snapToOffsets={[0, REVEAL]}
          decelerationRate="fast"
          onScrollEndDrag={settle}
          onMomentumScrollEnd={settle}>
          <View style={{ width }}>
            {children}
            {open ? (
              <Pressable
                style={StyleSheet.absoluteFill}
                onPress={() => onOpenChange(false)}
                accessibilityLabel="Close"
              />
            ) : null}
          </View>
          <Pressable
            onPress={onDelete}
            accessibilityRole="button"
            accessibilityLabel="Delete"
            style={({ pressed }) => [styles.delete, { borderRadius: radius }, pressed && { opacity: 0.75 }]}>
            <Text style={styles.deleteText}>Delete</Text>
          </Pressable>
        </ScrollView>
      ) : (
        children
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  delete: {
    width: DELETE_WIDTH,
    marginLeft: GAP,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
