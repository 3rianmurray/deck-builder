import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import * as haptics from '../lib/haptics';
import type { Deck } from '../lib/types';
import { CardView } from './CardView';

/** Cards drawn in the riffle: enough to read as a deck splitting and weaving back together. */
const CARDS = 8;
/** How long the whole shuffle takes. */
export const RIFFLE_MS = 720;
/** Split: both halves are out by this point of the shuffle. */
const SPLIT_END = 0.26;
/** Weave: the first card starts falling back at this point, each next one a little later. */
const WEAVE_START = 0.32;
const WEAVE_STEP = 0.062;
/** How long each card takes to fall back onto the deck. */
const FALL = 0.12;

/**
 * How much of the deck's pile is on the table through a riffle, for its `PileDepth` to follow: it goes as the
 * halves lift off (the whole deck is in the player's hands), and builds back up as the cards weave down into
 * it. Played alongside a `Riffle`; JS-driven, as PileDepth needs.
 */
export function riffleHeight(height: Animated.Value): Animated.CompositeAnimation {
  const weaveEnd = WEAVE_START + (CARDS - 1) * WEAVE_STEP + FALL;
  height.setValue(1);
  return Animated.sequence([
    Animated.timing(height, { toValue: 0, duration: SPLIT_END * RIFFLE_MS, easing: Easing.out(Easing.quad), useNativeDriver: false }),
    Animated.delay((WEAVE_START + FALL / 2 - SPLIT_END) * RIFFLE_MS),
    Animated.timing(height, {
      toValue: 1,
      duration: (weaveEnd - WEAVE_START - FALL / 2) * RIFFLE_MS,
      easing: Easing.inOut(Easing.quad),
      useNativeDriver: false,
    }),
  ]);
}

/**
 * A riffle shuffle drawn over the deck's top card: the deck splits into two halves, which lift and tilt apart,
 * then the cards fall back one by one from alternate halves, weaving together into one deck again. Each card
 * landing is felt as a tick. It plays once when mounted and calls `onDone` at the end.
 */
export function Riffle({ deck, width, onDone }: { deck: Deck; width: number; onDone: () => void }) {
  const [t] = useState(() => new Animated.Value(0));

  useEffect(() => {
    // Started once mounted: the native driver needs its views to exist first.
    const timers = Array.from({ length: CARDS }, (_, i) =>
      setTimeout(haptics.tick, (WEAVE_START + i * WEAVE_STEP + FALL) * RIFFLE_MS),
    );
    Animated.timing(t, { toValue: 1, duration: RIFFLE_MS, easing: Easing.linear, useNativeDriver: true }).start(({ finished }) => {
      if (!finished) return;
      // Squared up again.
      haptics.drop();
      onDone();
    });
    return () => timers.forEach(clearTimeout);
    // Plays once per mount; a new shuffle mounts a new riffle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const spread = width * 0.3;
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
      {Array.from({ length: CARDS }, (_, i) => {
        // Alternate cards come from alternate halves, so falling back in order weaves them together; later
        // cards are drawn on top, as they land last.
        const side = i % 2 === 0 ? -1 : 1;
        const back = WEAVE_START + i * WEAVE_STEP;
        const inputRange = [0, SPLIT_END, back, back + FALL, 1];
        // Out with its half from the start, held there, then back onto the deck in its turn.
        const along = (out: number) => t.interpolate({ inputRange, outputRange: [0, out, out, 0, 0] });
        const tilt = (deg: number) => t.interpolate({ inputRange, outputRange: ['0deg', `${deg}deg`, `${deg}deg`, '0deg', '0deg'] });
        // Each half is a little stack: its cards a step apart, lifted off the table while apart.
        const height = Math.floor(i / 2);
        return (
          <Animated.View
            key={i}
            style={[
              styles.card,
              {
                transform: [
                  { translateX: along(side * (spread + height * 1.5)) },
                  { translateY: along(-8 - height * 1.5) },
                  { rotate: tilt(side * 8) },
                ],
              },
            ]}>
            {/* Its own faint shadow: the table's full one, on eight cards at once, looks far too heavy. */}
            <CardView deck={deck} faceUp={false} width={width} flat />
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    position: 'absolute',
    left: 0,
    top: 0,
    shadowColor: '#000',
    shadowOpacity: 0.14,
    shadowRadius: 2,
    shadowOffset: { width: 0, height: 1 },
  },
});
