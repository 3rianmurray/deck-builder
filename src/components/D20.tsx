// A d20 on a table, seen from above as it lies: a hexagon outline (an icosahedron's silhouette) with the facets
// round the face on top, which shows the number. Tapped, it rolls: spins, hops and skids a little while its number
// flickers, then settles. A trial piece (see SandboxDie), drawn flat like the cards, faking the roll in 2D.
import { Canvas, Path, Skia } from '@shopify/react-native-skia';
import { memo, useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withSequence, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';

import * as haptics from '../lib/haptics';
import type { SandboxDie } from '../lib/sandbox';
import { Text } from './Text';

/** Its size on the table, in table units (a little smaller than a card is wide). */
export const D20_SIZE = 72;
/** How long a roll takes. */
export const ROLL_MS = 900;

const R = D20_SIZE / 2;

/** The hexagon's corners (point at the top), and the face on top: a triangle in the middle. */
function shape() {
  const hex = Array.from({ length: 6 }, (_, i) => {
    const a = ((-90 + i * 60) * Math.PI) / 180;
    return { x: R + R * 0.96 * Math.cos(a), y: R + R * 0.96 * Math.sin(a) };
  });
  const tri = [0, 2, 4].map((i) => {
    const a = ((-90 + i * 60) * Math.PI) / 180;
    return { x: R + R * 0.5 * Math.cos(a), y: R + R * 0.5 * Math.sin(a) };
  });
  const outline = Skia.PathBuilder.Make();
  hex.forEach((p, i) => (i ? outline.lineTo(p.x, p.y) : outline.moveTo(p.x, p.y)));
  outline.close();
  const face = Skia.PathBuilder.Make();
  tri.forEach((p, i) => (i ? face.lineTo(p.x, p.y) : face.moveTo(p.x, p.y)));
  face.close();
  // The facets' edges: each corner of the top face out to the two nearest corners of the outline.
  const edges = Skia.PathBuilder.Make();
  tri.forEach((p, k) => {
    for (const j of [(k * 2 + 5) % 6, k * 2, (k * 2 + 1) % 6]) {
      edges.moveTo(p.x, p.y);
      edges.lineTo(hex[j].x, hex[j].y);
    }
  });
  return { outline: outline.build(), face: face.build(), edges: edges.build() };
}

/**
 * The die at its place on the table (`at`: where it is now, e.g. while dragged). Given a `roll`, it rolls to the
 * value that roll lands on, then calls `onLanded`.
 */
export const D20 = memo(function D20({
  die,
  at,
  roll,
  onLanded,
}: {
  die: SandboxDie;
  at: { x: number; y: number };
  roll: { key: string; to: number; dx: number; dy: number; turn: number } | null;
  onLanded: () => void;
}) {
  const paths = useMemo(shape, []);
  const [shown, setShown] = useState(die.value);
  const spin = useSharedValue(0);
  const hop = useSharedValue(1);
  const skidX = useSharedValue(0);
  const skidY = useSharedValue(0);

  // Not rolling: its own number.
  if (!roll && shown !== die.value) setShown(die.value);

  useEffect(() => {
    if (!roll) return;
    const ease = { duration: ROLL_MS, easing: Easing.out(Easing.cubic) };
    spin.set(0);
    spin.set(withTiming(roll.turn, ease, (done) => done && scheduleOnRN(onLanded)));
    hop.set(withSequence(withTiming(1.28, { duration: ROLL_MS * 0.22, easing: Easing.out(Easing.quad) }), withTiming(0.94, { duration: ROLL_MS * 0.38, easing: Easing.in(Easing.quad) }), withTiming(1, { duration: ROLL_MS * 0.4 })));
    skidX.set(0);
    skidY.set(0);
    skidX.set(withTiming(roll.dx, ease));
    skidY.set(withTiming(roll.dy, ease));
    // The number tumbles through random faces, slowing as it settles, a tick for each.
    const timers: ReturnType<typeof setTimeout>[] = [];
    let t = 0;
    for (let gap = 45; t + gap < ROLL_MS - 60; gap *= 1.18) {
      t += gap;
      timers.push(
        setTimeout(() => {
          setShown(1 + Math.floor(Math.random() * 20));
          haptics.tick();
        }, t),
      );
    }
    timers.push(setTimeout(() => setShown(roll.to), ROLL_MS - 40));
    return () => timers.forEach(clearTimeout);
    // Once per roll.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roll?.key]);

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: skidX.value }, { translateY: skidY.value }, { rotate: `${die.angle + spin.value}deg` }, { scale: hop.value }],
  }));
  // Its shadow stays on the table as it hops: further off, and fainter, the higher it is.
  const shadowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: skidX.value + (hop.value - 1) * 30 }, { translateY: skidY.value + 4 + (hop.value - 1) * 40 }],
    opacity: 0.35 - (hop.value - 1) * 0.6,
  }));

  return (
    <View pointerEvents="none" style={[styles.spot, { left: at.x - R, top: at.y - R }]}>
      <Animated.View style={[StyleSheet.absoluteFill, shadowStyle]}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Path path={paths.outline} color="#000" />
        </Canvas>
      </Animated.View>
      <Animated.View style={[StyleSheet.absoluteFill, style]}>
        <Canvas style={StyleSheet.absoluteFill}>
          <Path path={paths.outline} color="#8c1d24" />
          <Path path={paths.face} color="#a8262e" />
          <Path path={paths.edges} color="rgba(255,236,210,0.55)" style="stroke" strokeWidth={1.4} />
          <Path path={paths.face} color="rgba(255,236,210,0.85)" style="stroke" strokeWidth={1.6} />
          <Path path={paths.outline} color="rgba(255,236,210,0.9)" style="stroke" strokeWidth={2} strokeJoin="round" />
        </Canvas>
        <View style={styles.numberSpot}>
          <Text style={[styles.number, shown === 20 && styles.crit]} maxFontSizeMultiplier={1}>
            {shown}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  spot: { position: 'absolute', width: D20_SIZE, height: D20_SIZE },
  numberSpot: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', paddingTop: 6 },
  number: { color: '#fff6e8', fontSize: 17, fontWeight: '800' },
  crit: { color: '#ffd76a' },
});
