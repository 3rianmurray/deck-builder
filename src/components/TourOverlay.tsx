import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDecks } from '../lib/DecksContext';
import * as haptics from '../lib/haptics';
import { loadSettings } from '../lib/storage';
import { endTour, nextTourStep, TOUR, useTourStep, useTourTargetRect } from '../lib/tour';
import type { TourStep } from '../lib/tour';
import { colors } from '../theme';
import { Button } from './Button';
import { Text } from './Text';

/** How long after leaving the table the Sample Deck goes back to table mode (once the table's out of sight). */
const MODE_RESET_MS = 700;
/** How long a step waits, and its control stays still, before it shows. */
const SETTLE_MS = 450;
/** Room left round a highlighted control. */
const RING_PAD = 8;
/** Space between the tip and the control it points at. */
const TIP_GAP = 14;

/** A walkthrough step's tip: where it is in the tour, what to do, and the way out. */
export function TourTip({ index, step, onNext = nextTourStep }: { index: number; step: TourStep; onNext?: () => void }) {
  return (
    <View style={styles.tip}>
      <Text style={styles.count}>
        {index + 1} of {TOUR.length}
      </Text>
      <Text style={styles.title}>{step.title}</Text>
      <Text style={styles.text}>{step.text}</Text>
      <View style={styles.row}>
        {/* No skipping from the last step: Done does that. */}
        {index < TOUR.length - 1 ? (
          <Pressable onPress={endTour} hitSlop={10} accessibilityRole="button" style={({ pressed }) => pressed && { opacity: 0.6 }}>
            <Text style={styles.skip}>Skip tour</Text>
          </Pressable>
        ) : (
          <View />
        )}
        {step.next ? <Button label={step.next} variant="primary" onPress={onNext} /> : null}
      </View>
    </View>
  );
}

/** The flourish's cards: one of each of three sample suits. */
const FLOURISH_CARDS = [
  require('../../assets/sample/sun-1.png'),
  require('../../assets/sample/moon-1.png'),
  require('../../assets/sample/star-1.png'),
];
const FLOURISH_WIDTH = 92;
/** How far apart the fanned cards sit, and how far each turns. */
const FAN_STEP = 64;
const FAN_TURN = 14;

/**
 * A little celebration for finishing the walkthrough: three cards spring up and fan out in the middle of the
 * screen, hold a moment, then drift up and fade. It doesn't take touches, and goes once it's played.
 */
function Flourish() {
  const [fan] = useState(() => new Animated.Value(0));
  const [leave] = useState(() => new Animated.Value(0));
  const [done, setDone] = useState(false);
  useEffect(() => {
    Animated.sequence([
      Animated.spring(fan, { toValue: 1, friction: 6, tension: 70, useNativeDriver: true }),
      Animated.delay(650),
      Animated.timing(leave, { toValue: 1, duration: 420, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(() => setDone(true));
  }, [fan, leave]);
  if (done) return null;
  return (
    <View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.flourish]}>
      {FLOURISH_CARDS.map((art, i) => {
        const side = i - 1;
        return (
          <Animated.View
            key={i}
            style={[
              styles.flourishCard,
              {
                opacity: Animated.multiply(
                  fan.interpolate({ inputRange: [0, 0.3, 1], outputRange: [0, 1, 1] }),
                  leave.interpolate({ inputRange: [0, 1], outputRange: [1, 0] }),
                ),
                transform: [
                  { translateX: fan.interpolate({ inputRange: [0, 1], outputRange: [0, side * FAN_STEP] }) },
                  {
                    translateY: Animated.add(
                      fan.interpolate({ inputRange: [0, 1], outputRange: [60, Math.abs(side) * 10] }),
                      leave.interpolate({ inputRange: [0, 1], outputRange: [0, -80] }),
                    ),
                  },
                  { rotate: fan.interpolate({ inputRange: [0, 1], outputRange: ['0deg', `${side * FAN_TURN}deg`] }) },
                  { scale: fan.interpolate({ inputRange: [0, 1], outputRange: [0.5, 1] }) },
                ],
              },
            ]}>
            <Image source={art} style={styles.flourishArt} contentFit="cover" />
          </Animated.View>
        );
      })}
    </View>
  );
}

/** A gold ring that gently pulses round a control. */
function Ring({ rect }: { rect: { x: number; y: number; w: number; h: number } }) {
  const [pulse] = useState(() => new Animated.Value(0));
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.ring,
        {
          left: rect.x - RING_PAD,
          top: rect.y - RING_PAD,
          width: rect.w + RING_PAD * 2,
          height: rect.h + RING_PAD * 2,
          opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 0.45] }),
          transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.04] }) }],
        },
      ]}
    />
  );
}

/**
 * The walkthrough, drawn over the whole app: a ring round the control the current step is about (the rest of
 * the screen darkened, for steps that ask for it) and its tip beside it. Only the tip takes touches, so the
 * player uses the real controls underneath. Steps inside a menu are shown by the menu itself (see ActionSheet).
 */
export function TourOverlay() {
  const tour = useTourStep();
  const decks = useDecks();
  /** Counts finishes, so each one plays the flourish afresh. */
  const [finished, setFinished] = useState(0);
  const rect = useTourTargetRect(tour?.step.target);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [tipHeight, setTipHeight] = useState(0);
  // Shown only once things have settled: a moment after the step changes (the next screen sliding in and
  // filling up), and while its control stays put (not mid-scroll or mid-slide).
  const settleKey = tour ? `:` : null;
  const [settled, setSettled] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(settleKey), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [settleKey]);

  // The end: back to the home screen, the Sample Deck set back to table mode (the walkthrough leaves it in
  // reveal mode), and a little flourish.
  const finish = () => {
    endTour();
    if (router.canDismiss()) router.dismissAll();
    const sample = loadSettings().sampleDeckId;
    // Once the table has slid away, so it isn't seen changing on its way out.
    if (sample && decks.getDeck(sample)) setTimeout(() => decks.setPlayMode(sample, 'table'), MODE_RESET_MS);
    haptics.success();
    setFinished((n) => n + 1);
  };
  const flourish = finished ? <Flourish key={finished} /> : null;

  if (!tour || tour.step.tile) return flourish;
  const { step, index } = tour;
  // Waiting for its control to come on screen (say, while the next screen slides in).
  const pointing = step.target ? rect : undefined;
  if ((step.target && !pointing) || settled !== settleKey) return flourish;

  const top = insets.top + 8;
  const bottom = height - insets.bottom - 8;
  // Beside the control: below it if it's in the top half of the screen, above it if not; kept on screen.
  // Without a control, in the middle. Steps can ask for the top of the screen instead, or for beside the control
  // on its right, to keep clear of what the player needs to reach.
  const tipTop = (() => {
    if (step.place === 'top') return pointing ? top : top + height * 0.08;
    if (step.place === 'right' && pointing) return Math.min(Math.max(pointing.y - RING_PAD, top), bottom - tipHeight);
    if (!pointing) return (height - tipHeight) / 2;
    const below = pointing.y + pointing.h / 2 < height / 2;
    const want = below ? pointing.y + pointing.h + RING_PAD + TIP_GAP : pointing.y - RING_PAD - TIP_GAP - tipHeight;
    return Math.min(Math.max(want, top), bottom - tipHeight);
  })();

  const hole = pointing && {
    x: pointing.x - RING_PAD,
    y: pointing.y - RING_PAD,
    w: pointing.w + RING_PAD * 2,
    h: pointing.h + RING_PAD * 2,
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Without a control to point at, the whole screen dims behind the tip. */}
      {!pointing ? <View style={[StyleSheet.absoluteFill, styles.dim]} /> : null}
      {step.dim && hole ? (
        <>
          <View pointerEvents="none" style={[styles.dim, { left: 0, top: 0, width, height: hole.y }]} />
          <View pointerEvents="none" style={[styles.dim, { left: 0, top: hole.y + hole.h, width, height: height - hole.y - hole.h }]} />
          <View pointerEvents="none" style={[styles.dim, { left: 0, top: hole.y, width: hole.x, height: hole.h }]} />
          <View pointerEvents="none" style={[styles.dim, { left: hole.x + hole.w, top: hole.y, width: width - hole.x - hole.w, height: hole.h }]} />
        </>
      ) : null}
      {pointing ? <Ring rect={pointing} /> : null}
      <View
        style={[
          styles.tipWrap,
          { top: tipTop, opacity: tipHeight ? 1 : 0 },
          step.place === 'right' && pointing && { left: pointing.x + pointing.w + RING_PAD + TIP_GAP / 2 },
        ]}
        onLayout={(e) => setTipHeight(e.nativeEvent.layout.height)}>
        <TourTip index={index} step={step} onNext={index === TOUR.length - 1 ? finish : nextTourStep} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
  flourish: { alignItems: 'center', justifyContent: 'center' },
  flourishCard: {
    position: 'absolute',
    width: FLOURISH_WIDTH,
    height: (FLOURISH_WIDTH * 7) / 5,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(224,179,84,0.8)',
  },
  flourishArt: { width: '100%', height: '100%' },
  ring: { position: 'absolute', borderWidth: 3, borderColor: colors.accent, borderRadius: 14 },
  tipWrap: { position: 'absolute', left: 16, right: 16 },
  tip: {
    backgroundColor: colors.surfaceRaised,
    borderRadius: 14,
    padding: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(224,179,84,0.5)',
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
  },
  count: { color: colors.accent, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  title: { color: colors.text, fontSize: 18, fontWeight: '700' },
  text: { color: colors.text, opacity: 0.9, fontSize: 15, lineHeight: 21 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, minHeight: 20 },
  skip: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
});
