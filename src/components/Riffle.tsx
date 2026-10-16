import { useEffect, useState } from 'react';
import { Animated, Easing, StyleSheet, View } from 'react-native';

import * as haptics from '../lib/haptics';
import { cardRatio } from '../lib/types';
import type { Deck } from '../lib/types';
import { colors } from '../theme';
import { CardView } from './CardView';

/** Cards drawn in the riffle: enough to read as a deck splitting and weaving back together. */
const CARDS = 8;
/** The longest a riffle waits for its cards' pictures before playing anyway. */
const READY_WAIT_MS = 250;
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
 * landing is felt as a tick, except the last, so it finishes quietly. Each card casts a faint shadow only while
 * it's in the air: landed, they'd all stack into one dark patch.
 *
 * It plays once, as soon as its cards' pictures are ready (until then it's invisible, and the deck shows as it
 * is: fresh cards are blank while their pictures load), calling `onStart` as it starts and `onDone` at the end.
 */
export function Riffle({
  deck,
  width,
  onStart,
  onDone,
}: {
  deck: Deck;
  width: number;
  onStart?: () => void;
  onDone: () => void;
}) {
  const [t] = useState(() => new Animated.Value(0));
  const ratio = cardRatio(deck);
  // How many of its cards have their picture showing; it starts once they all do (or after a moment regardless).
  const [ready, setReady] = useState(0);
  const [started, setStarted] = useState(false);
  if (!started && ready >= CARDS) setStarted(true);
  useEffect(() => {
    const timer = setTimeout(() => setStarted(true), READY_WAIT_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!started) return;
    onStart?.();
    // Started once mounted (and ready): the native driver needs its views to exist first.
    const timers = Array.from({ length: CARDS - 1 }, (_, i) =>
      setTimeout(haptics.tick, (WEAVE_START + i * WEAVE_STEP + FALL) * RIFFLE_MS),
    );
    Animated.timing(t, { toValue: 1, duration: RIFFLE_MS, easing: Easing.linear, useNativeDriver: true }).start(({ finished }) => {
      if (finished) onDone();
    });
    return () => timers.forEach(clearTimeout);
    // Plays once per mount, once ready; a new shuffle mounts a new riffle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [started]);

  const spread = width * 0.3;
  return (
    <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none', opacity: started ? 1 : 0 }]}>
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
            {/* Its shadow, just while it's off the table (behind the card, so only the shadow shows). */}
            <Animated.View
              style={[
                styles.shadow,
                { width, height: width / ratio, borderRadius: Math.max(4, width * 0.06) },
                { opacity: t.interpolate({ inputRange, outputRange: [0, 1, 1, 0, 0] }) },
              ]}
            />
            <CardView deck={deck} faceUp={false} width={width} flat onReady={() => setReady((r) => r + 1)} />
          </Animated.View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { position: 'absolute', left: 0, top: 0 },
  shadow: {
    position: 'absolute',
    left: 0,
    top: 0,
    // Hidden by the card on top of it; only the shadow shows.
    backgroundColor: colors.surfaceRaised,
    shadowColor: '#000',
    // Each half is four cards deep, so their shadows add up: keep each one light.
    shadowOpacity: 0.18,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
  },
});
