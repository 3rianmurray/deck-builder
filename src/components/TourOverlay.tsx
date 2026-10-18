import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import * as haptics from '../lib/haptics';
import { endTour, nextTourStep, TOUR, useTourStep, useTourTargetRect } from '../lib/tour';
import type { TourStep } from '../lib/tour';
import { colors } from '../theme';
import { Button } from './Button';
import { Text } from './Text';

/** How long a step takes to fade in, and out. */
const FADE_IN_MS = 220;
const FADE_OUT_MS = 140;
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
  const rect = useTourTargetRect(tour?.step.target);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [tipHeight, setTipHeight] = useState(0);
  // Shown only once things have settled: a moment after the step changes (the next screen sliding in and
  // filling up), and while its control stays put (not mid-scroll or mid-slide).
  const settleKey = tour ? `${tour.index}:${rect ? [rect.x, rect.y, rect.w, rect.h].join(',') : ''}` : null;
  const [settled, setSettled] = useState<string | null>(null);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(settleKey), SETTLE_MS);
    return () => clearTimeout(timer);
  }, [settleKey]);
  // Each step fades in once settled, and out as soon as the player has done it (or the screen starts to move):
  // what was showing stays drawn, fading, until the next is ready.
  const live = !!tour && !tour.step.tile && (!tour.step.target || !!rect) && settled === settleKey;
  const [fade] = useState(() => new Animated.Value(0));
  useEffect(() => {
    Animated.timing(fade, {
      toValue: live ? 1 : 0,
      duration: live ? FADE_IN_MS : FADE_OUT_MS,
      easing: Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [live, fade]);
  const last = useMemo(() => {
    const box: { frame: ReactNode } = { frame: null };
    return { keep: (frame: ReactNode) => Object.assign(box, { frame }), get: () => box.frame };
  }, []);

  // The end: back to the home screen, and a tap to feel it's done.
  const finish = () => {
    endTour();
    if (router.canDismiss()) router.dismissAll();
    haptics.success();
  };

  // Not showing a step (between steps, or waiting for its control to come on screen): the last one fades away.
  if (!live || !tour) {
    return (
      <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]} pointerEvents="none">
        {last.get()}
      </Animated.View>
    );
  }
  const { step, index } = tour;
  const pointing = step.target ? rect : undefined;

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

  const frame = (
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
  last.keep(frame);
  return (
    <Animated.View style={[StyleSheet.absoluteFill, { opacity: fade }]} pointerEvents="box-none">
      {frame}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  dim: { position: 'absolute', backgroundColor: 'rgba(0,0,0,0.55)' },
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
